/**
 * Look-ahead scheduler ("A Tale of Two Clocks"): a timer wakes every ~25 ms and
 * schedules every note falling inside the next ~150 ms on the AudioContext clock.
 * It re-reads the song on each wake, so edits, tempo changes and pattern changes
 * are heard almost immediately while playing.
 */
import { getDrumStyle, drumHits } from '../music/drums';
import { applySwing, buildBass, getPattern, type NoteEvent } from '../music/patterns';
import { tonicPc } from '../theory/scales';
import { type Voicing, voiceProgression } from '../theory/voicing';
import type { Settings, Song } from '../state/types';
import type { AudioEngine, Session } from './engine';
import { getInstrument, playBass, playClick, playHat, playKick, playNote, playSnare } from './instruments';

export interface Marker {
  time: number;
  /** Index of the chord in the song, or -1 during count-in. */
  chordIndex: number;
  chordId: string | null;
  /** Beat within the current chord (0-based). */
  beat: number;
  /** Count-in beats remaining (including this one), 0 when not counting in. */
  countIn: number;
  loop: number;
  bpm: number;
}

export interface Snapshot {
  song: Song;
  settings: Settings;
  version: number;
}

interface CountInSegment {
  kind: 'countin';
  startBeat: number;
  beats: number;
}

interface ChordSegment {
  kind: 'chord';
  index: number;
  id: string;
  startBeat: number;
  beats: number;
  events: NoteEvent[];
  bass: NoteEvent[];
  version: number;
}

type Segment = CountInSegment | ChordSegment;

const LOOKAHEAD = 0.15;
const INTERVAL_MS = 25;

/** Loop range normalised to indices. */
export function loopBounds(song: Song): [number, number] {
  const n = song.chords.length;
  if (!song.loopRange || n === 0) return [0, Math.max(0, n - 1)];
  const a = song.chords.findIndex((c) => c.id === song.loopRange!.startId);
  const b = song.chords.findIndex((c) => c.id === song.loopRange!.endId);
  if (a < 0 || b < 0) return [0, n - 1];
  return [Math.min(a, b), Math.max(a, b)];
}

/** Voicings for the whole song, wrapped so the loop point also voice-leads. */
export function songVoicings(song: Song, settings: Settings): Voicing[] {
  const opts = { smooth: settings.voiceLeading, register: settings.register };
  return voiceProgression(song.chords, tonicPc({ tonic: song.tonic, mode: song.mode }), opts, true);
}

function createTicker(cb: () => void): () => void {
  // A worker-driven timer keeps ticking when the main thread is busy or throttled.
  try {
    const src = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${INTERVAL_MS});}else{clearInterval(id);id=null;}}`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.onmessage = cb;
    w.postMessage('start');
    return () => {
      w.postMessage('stop');
      w.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = setInterval(cb, INTERVAL_MS);
    return () => clearInterval(id);
  }
}

export interface TransportHooks {
  onEnded(): void;
  onTempoTrainer(bpm: number): void;
}

export class Transport {
  playing = false;
  private session: Session | null = null;
  private stopTicker: (() => void) | null = null;
  private seg: Segment | null = null;
  private markers: Marker[] = [];
  private refTime = 0;
  private refBeat = 0;
  private bpm = 100;
  private scheduledBeat = 0;
  /** Beat at which the current loop pass began (bar/drum reference). */
  private barRef = 0;
  private loopCount = 0;
  private endTime: number | null = null;
  private voicings: Voicing[] = [];
  private voicingVersion = -1;
  private lastMarker: Marker | null = null;

  constructor(
    private engine: AudioEngine,
    private snapshot: () => Snapshot,
    private hooks: TransportHooks,
  ) {}

  start(fromIndex?: number) {
    if (this.playing) this.stop();
    const ctx = this.engine.ensure();
    const snap = this.snapshot();
    const { song, settings } = snap;
    if (song.chords.length === 0) return;
    this.session = this.engine.newSession();
    this.playing = true;
    this.markers = [];
    this.lastMarker = null;
    this.loopCount = 0;
    this.endTime = null;
    this.bpm = song.bpm;
    this.refTime = ctx.currentTime + 0.08;
    this.refBeat = 0;
    this.scheduledBeat = 0;
    this.barRef = 0;
    this.voicingVersion = -1;
    const [rs] = loopBounds(song);
    const startIndex = fromIndex ?? rs;
    if (settings.countIn) {
      this.seg = { kind: 'countin', startBeat: 0, beats: song.meter };
      this.pendingStart = startIndex;
    } else {
      this.seg = this.chordSegment(snap, startIndex, 0);
    }
    this.stopTicker = createTicker(() => this.tick());
    this.tick();
  }

  private pendingStart = 0;

  stop() {
    this.stopTicker?.();
    this.stopTicker = null;
    this.session?.end();
    this.session = null;
    this.playing = false;
    this.seg = null;
    this.markers = [];
    this.lastMarker = null;
  }

  /** Current playhead (what is audible now), with fractional beat progress. */
  position(): (Marker & { progress: number }) | null {
    const ctx = this.engine.ctx;
    if (!ctx || !this.playing) return null;
    const now = ctx.currentTime - this.engine.outputLatency;
    while (this.markers.length && this.markers[0].time <= now) {
      this.lastMarker = this.markers.shift()!;
    }
    const m = this.lastMarker;
    if (!m) return null;
    const beatLen = 60 / m.bpm;
    return { ...m, progress: Math.min(1, Math.max(0, (now - m.time) / beatLen)) };
  }

  private beatToTime(beat: number) {
    return this.refTime + ((beat - this.refBeat) * 60) / this.bpm;
  }

  private timeToBeat(time: number) {
    return this.refBeat + ((time - this.refTime) * this.bpm) / 60;
  }

  private getVoicings(snap: Snapshot): Voicing[] {
    if (this.voicingVersion !== snap.version) {
      this.voicings = songVoicings(snap.song, snap.settings);
      this.voicingVersion = snap.version;
    }
    return this.voicings;
  }

  private chordSegment(snap: Snapshot, index: number, startBeat: number): ChordSegment | null {
    const { song, settings } = snap;
    const chord = song.chords[index];
    if (!chord) return null;
    const voicings = this.getVoicings(snap);
    const v = voicings[index];
    const pattern = getPattern(song.patternId);
    const [rs, re] = loopBounds(song);
    const nextIndex = index >= re ? (settings.loop ? rs : -1) : index + 1;
    const nextV = nextIndex >= 0 ? voicings[nextIndex] : null;
    const raw = pattern.build(v, chord, chord.beats, index * 7919 + this.loopCount * 104729);
    const events = applySwing(raw, song.swing, pattern.swingUnit);
    const bass = applySwing(
      buildBass(song.bassStyle, v, chord, chord.beats, song.meter, nextV ? nextV.bass : null),
      song.swing,
      0.5,
    );
    return { kind: 'chord', index, id: chord.id, startBeat, beats: chord.beats, events, bass, version: snap.version };
  }

  private tick() {
    const ctx = this.engine.ctx;
    if (!ctx || !this.playing || !this.session) return;
    if (this.endTime !== null) {
      if (ctx.currentTime >= this.endTime) {
        this.stop();
        this.hooks.onEnded();
      }
      return;
    }
    const snap = this.snapshot();
    if (snap.song.bpm !== this.bpm) {
      // Re-anchor the beat clock so a tempo change applies from here on.
      this.refTime = this.beatToTime(this.scheduledBeat);
      this.refBeat = this.scheduledBeat;
      this.bpm = snap.song.bpm;
    }
    // If the song changed, refresh the current chord's events (index may shift).
    const seg = this.seg;
    if (seg && seg.kind === 'chord' && seg.version !== snap.version) {
      const idx = snap.song.chords.findIndex((c) => c.id === seg.id);
      const fresh = idx >= 0 ? this.chordSegment(snap, idx, seg.startBeat) : null;
      if (fresh) this.seg = fresh;
      else seg.version = snap.version; // chord deleted: finish its slot, then move on
    }
    // Drop stale playhead markers if nobody polled them (e.g. background tab).
    if (this.markers.length > 64) {
      while (this.markers.length > 1 && this.markers[1].time <= ctx.currentTime) this.lastMarker = this.markers.shift()!;
    }
    const horizon = this.timeToBeat(ctx.currentTime + LOOKAHEAD);
    let guard = 0;
    while (this.seg && this.scheduledBeat < horizon && guard++ < 64) {
      const cur = this.seg;
      const segEnd = cur.startBeat + cur.beats;
      const to = Math.max(this.scheduledBeat, Math.min(horizon, segEnd));
      this.scheduleRange(snap, cur, this.scheduledBeat, to);
      this.scheduledBeat = to;
      if (to >= segEnd - 1e-9) this.advance(snap, segEnd);
    }
  }

  private advance(snap: Snapshot, segEnd: number) {
    const { song, settings } = snap;
    const cur = this.seg!;
    const n = song.chords.length;
    if (n === 0) {
      this.finish(segEnd);
      return;
    }
    if (cur.kind === 'countin') {
      this.barRef = segEnd;
      this.seg = this.chordSegment(snap, Math.min(this.pendingStart, n - 1), segEnd);
      return;
    }
    const [rs, re] = loopBounds(song);
    let idx = song.chords.findIndex((c) => c.id === cur.id);
    if (idx < 0) idx = Math.min(cur.index, n) - 1; // deleted: continue from its slot
    let next = idx + 1;
    if (idx >= re || next >= n) {
      if (!settings.loop) {
        this.finish(segEnd);
        return;
      }
      next = rs;
      this.loopCount++;
      this.barRef = segEnd;
      const t = settings.trainer;
      if (t.enabled && this.loopCount % Math.max(1, t.every) === 0 && song.bpm < t.target) {
        this.hooks.onTempoTrainer(Math.min(t.target, song.bpm + t.step));
      }
    }
    if (next < rs) next = rs;
    this.seg = this.chordSegment(snap, next, segEnd);
    if (!this.seg) this.finish(segEnd);
  }

  private finish(endBeat: number) {
    this.seg = null;
    this.endTime = this.beatToTime(endBeat) + 0.25;
  }

  private scheduleRange(snap: Snapshot, seg: Segment, from: number, to: number) {
    const { song, settings } = snap;
    const ctx = this.engine.ctx!;
    const session = this.session!;
    const secPerBeat = 60 / this.bpm;
    const meter = song.meter;

    // Beat markers + metronome
    for (let b = Math.ceil(from - 1e-9); b < to - 1e-9; b++) {
      const time = this.beatToTime(b);
      const beatIn = b - seg.startBeat;
      if (seg.kind === 'countin') {
        this.markers.push({ time, chordIndex: -1, chordId: null, beat: beatIn, countIn: seg.beats - beatIn, loop: this.loopCount, bpm: this.bpm });
        playClick(ctx, session.gains.click, time, beatIn === 0, 1);
      } else {
        this.markers.push({ time, chordIndex: seg.index, chordId: seg.id, beat: beatIn, countIn: 0, loop: this.loopCount, bpm: this.bpm });
        if (settings.metronome) {
          const barPos = ((b - this.barRef) % meter + meter) % meter;
          playClick(ctx, session.gains.click, time, barPos === 0);
        }
      }
    }
    if (seg.kind === 'countin') return;

    // Drums (cycle locked to the bar grid of the current loop pass)
    const drums = getDrumStyle(song.drumStyle);
    if (drums.id !== 'off') {
      const hits = drumHits(drums).filter((h) => h.at < meter);
      const firstCycle = Math.floor((from - this.barRef) / meter) - 1;
      for (let c = firstCycle; c <= firstCycle + 3; c++) {
        const cycleStart = this.barRef + c * meter;
        for (const h of hits) {
          const at = cycleStart + swingBeat(h.at, song.swing);
          if (at < from - 1e-9 || at >= to - 1e-9 || at < seg.startBeat - 1e-9) continue;
          const time = this.beatToTime(at) + this.jitter(settings, 0.004);
          const dest = session.gains.drums;
          if (h.part === 'kick') playKick(ctx, dest, time, h.vel);
          else if (h.part === 'snare') playSnare(ctx, dest, time, h.vel);
          else playHat(ctx, dest, time, h.vel, h.part === 'open');
        }
      }
    }

    // Chord instrument
    const inst = getInstrument(song.instrumentId);
    const dest = session.input(inst.id);
    for (const e of seg.events) {
      const at = seg.startBeat + e.at;
      if (at < from - 1e-9 || at >= to - 1e-9) continue;
      const time = this.beatToTime(at) + this.jitter(settings, 0.008);
      const vel = clampVel(e.vel * (settings.humanize ? 0.9 + Math.random() * 0.2 : 1));
      const notes = e.strum === 'up' ? [...e.notes].reverse() : e.notes;
      const spread = e.strum ? inst.strumSpread * (e.strum === 'up' ? 0.75 : 1) * (e.mute ? 0.5 : 1) : 0;
      notes.forEach((midi, i) => {
        const t = time + i * spread;
        const tilt = e.strum ? 1 - (i / Math.max(1, notes.length)) * 0.15 : 1;
        playNote(ctx, dest, inst.id, { midi, time: t, dur: Math.max(0.05, e.dur * secPerBeat - i * spread), vel: vel * tilt, mute: e.mute });
      });
    }

    // Bass
    for (const e of seg.bass) {
      const at = seg.startBeat + e.at;
      if (at < from - 1e-9 || at >= to - 1e-9) continue;
      const time = this.beatToTime(at) + this.jitter(settings, 0.005);
      playBass(ctx, session.gains.bass, { midi: e.notes[0], time, dur: e.dur * secPerBeat, vel: e.vel });
    }
  }

  private jitter(settings: Settings, amount: number) {
    return settings.humanize ? Math.random() * amount : 0;
  }
}

function swingBeat(at: number, swing: number): number {
  if (swing <= 0) return at;
  const base = Math.floor(at);
  const f = at - base;
  const mid = 0.5 + swing / 6;
  return base + (f <= 0.5 ? (f / 0.5) * mid : mid + ((f - 0.5) / 0.5) * (1 - mid));
}

function clampVel(v: number) {
  return Math.min(1, Math.max(0.05, v));
}
