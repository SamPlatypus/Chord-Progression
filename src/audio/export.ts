/**
 * Export the progression as a multi-track Standard MIDI File or as rendered
 * audio (WAV) using the same patterns, voicings and synths as live playback.
 */
import { drumHits, getDrumStyle } from '../music/drums';
import { applySwing, buildBass, getPattern } from '../music/patterns';
import type { Settings, Song } from '../state/types';
import { chordName } from '../theory/chords';
import { applyMixNow, createGraph } from './engine';
import { getInstrument, guitarBody, playBass, playHat, playKick, playNote, playSnare } from './instruments';
import { songVoicings } from './transport';

export interface TimedNote {
  beat: number;
  dur: number;
  midi: number;
  vel: number;
  /** Position within a strum (0 = first string struck). */
  order: number;
  strummed: boolean;
  mute?: boolean;
}

export interface Timeline {
  bpm: number;
  meter: number;
  totalBeats: number;
  chords: TimedNote[];
  bass: TimedNote[];
  drums: { beat: number; part: 'kick' | 'snare' | 'hat' | 'open'; vel: number }[];
  markers: { beat: number; text: string }[];
}

function swingBeat(at: number, swing: number): number {
  if (swing <= 0) return at;
  const base = Math.floor(at);
  const f = at - base;
  const mid = 0.5 + swing / 6;
  return base + (f <= 0.5 ? (f / 0.5) * mid : mid + ((f - 0.5) / 0.5) * (1 - mid));
}

/** Every note of `loops` passes through the whole progression, in beats. */
export function buildTimeline(song: Song, settings: Settings, loops: number): Timeline {
  const voicings = songVoicings(song, settings);
  const pattern = getPattern(song.patternId);
  const key = { tonic: song.tonic, mode: song.mode };
  const out: Timeline = { bpm: song.bpm, meter: song.meter, totalBeats: 0, chords: [], bass: [], drums: [], markers: [] };
  const n = song.chords.length;
  let beat = 0;
  for (let loop = 0; loop < loops; loop++) {
    const passStart = beat;
    song.chords.forEach((chord, i) => {
      const v = voicings[i];
      const events = applySwing(pattern.build(v, chord, chord.beats, i * 7919 + loop * 104729), song.swing, pattern.swingUnit);
      for (const e of events) {
        const notes = e.strum === 'up' ? [...e.notes].reverse() : e.notes;
        notes.forEach((midi, order) => out.chords.push({ beat: beat + e.at, dur: e.dur, midi, vel: e.vel, order, strummed: !!e.strum, mute: e.mute }));
      }
      const next = voicings[(i + 1) % n];
      for (const e of applySwing(buildBass(song.bassStyle, v, chord, chord.beats, song.meter, next ? next.bass : null), song.swing, 0.5)) {
        out.bass.push({ beat: beat + e.at, dur: e.dur, midi: e.notes[0], vel: e.vel, order: 0, strummed: false });
      }
      out.markers.push({ beat, text: chordName(chord, key) });
      beat += chord.beats;
    });
    const drums = getDrumStyle(song.drumStyle);
    if (drums.id !== 'off') {
      const hits = drumHits(drums).filter((h) => h.at < song.meter);
      for (let c = passStart; c < beat - 1e-9; c += song.meter) {
        for (const h of hits) {
          const at = c + swingBeat(h.at, song.swing);
          if (at < beat - 1e-9) out.drums.push({ beat: at, part: h.part, vel: h.vel });
        }
      }
    }
  }
  out.totalBeats = beat;
  return out;
}

// ---------------------------------------------------------------------------
// MIDI

const PPQ = 480;
const GM_PROGRAM: Record<string, number> = { guitar: 25, nylon: 24, piano: 0, ep: 4, pad: 89, organ: 16 };
const DRUM_NOTE = { kick: 36, snare: 38, hat: 42, open: 46 } as const;

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function text(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

interface RawEvent {
  tick: number;
  /** Sort priority at equal ticks: meta < note-off < note-on. */
  prio: number;
  data: number[];
}

function track(events: RawEvent[]): Uint8Array {
  events.sort((a, b) => a.tick - b.tick || a.prio - b.prio);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.data);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0);
  const len = body.length;
  return new Uint8Array([0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body]);
}

function noteEvents(notes: TimedNote[], channel: number, beatToTick: (b: number) => number, secToTick: (s: number) => number, spread: number): RawEvent[] {
  // Per pitch: never let a note's off land after the next on of the same pitch.
  const items = notes
    .map((nt) => {
      const start = beatToTick(nt.beat) + (nt.strummed ? secToTick(nt.order * spread) : 0);
      return { pitch: nt.midi, start, end: Math.max(start + 10, beatToTick(nt.beat + nt.dur)), vel: Math.max(1, Math.min(127, Math.round(nt.vel * 112))) };
    })
    .sort((a, b) => a.pitch - b.pitch || a.start - b.start);
  for (let i = 0; i < items.length - 1; i++) {
    if (items[i + 1].pitch === items[i].pitch && items[i].end > items[i + 1].start) items[i].end = Math.max(items[i].start + 1, items[i + 1].start);
  }
  const out: RawEvent[] = [];
  for (const it of items) {
    out.push({ tick: it.start, prio: 2, data: [0x90 | channel, it.pitch, it.vel] });
    out.push({ tick: it.end, prio: 1, data: [0x80 | channel, it.pitch, 0] });
  }
  return out;
}

export function exportMidi(song: Song, settings: Settings, loops: number): Uint8Array {
  const tl = buildTimeline(song, settings, loops);
  const beatToTick = (b: number) => Math.round(b * PPQ);
  const secToTick = (s: number) => Math.round((s * song.bpm * PPQ) / 60);
  const usPerQuarter = Math.round(60_000_000 / song.bpm);

  const meta: RawEvent[] = [
    { tick: 0, prio: 0, data: [0xff, 0x03, ...vlq(text(song.name).length), ...text(song.name)] },
    { tick: 0, prio: 0, data: [0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, prio: 0, data: [0xff, 0x58, 0x04, song.meter, 2, 24, 8] },
    ...tl.markers.map((m) => ({ tick: beatToTick(m.beat), prio: 0, data: [0xff, 0x06, ...vlq(text(m.text).length), ...text(m.text)] })),
  ];

  const named = (name: string, channel: number, program: number | null, events: RawEvent[]) => [
    { tick: 0, prio: 0, data: [0xff, 0x03, ...vlq(text(name).length), ...text(name)] },
    ...(program === null ? [] : [{ tick: 0, prio: 0, data: [0xc0 | channel, program] }]),
    ...events,
  ];

  const inst = getInstrument(song.instrumentId);
  const tracks = [
    track(meta),
    track(named(`Chords (${inst.name})`, 0, GM_PROGRAM[inst.id] ?? 0, noteEvents(tl.chords.filter((c) => !c.mute), 0, beatToTick, secToTick, inst.strumSpread))),
  ];
  if (tl.bass.length) tracks.push(track(named('Bass', 1, 33, noteEvents(tl.bass, 1, beatToTick, secToTick, 0))));
  if (tl.drums.length) {
    const drumNotes: TimedNote[] = tl.drums.map((d) => ({ beat: d.beat, dur: 0.1, midi: DRUM_NOTE[d.part], vel: d.vel, order: 0, strummed: false }));
    tracks.push(track(named('Drums', 9, null, noteEvents(drumNotes, 9, beatToTick, secToTick, 0))));
  }
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
  const total = header.length + tracks.reduce((s, t) => s + t.length, 0);
  const file = new Uint8Array(total);
  file.set(header, 0);
  let off = header.length;
  for (const t of tracks) {
    file.set(t, off);
    off += t.length;
  }
  return file;
}

// ---------------------------------------------------------------------------
// Audio

export async function renderAudio(song: Song, settings: Settings, loops: number, sampleRate = 44100): Promise<AudioBuffer> {
  const tl = buildTimeline(song, settings, loops);
  const spb = 60 / song.bpm;
  const seconds = tl.totalBeats * spb + 2.5;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = createGraph(ctx);
  applyMixNow(graph, { ...settings.volumes, click: 0, reverb: settings.reverb });
  const inst = getInstrument(song.instrumentId);
  const dest = inst.id === 'guitar' || inst.id === 'nylon' ? guitarBody(ctx, graph.buses.chords) : graph.buses.chords;
  const t0 = 0.05;
  for (const nt of tl.chords) {
    const offset = nt.strummed ? nt.order * inst.strumSpread : 0;
    playNote(ctx, dest, inst.id, { midi: nt.midi, time: t0 + nt.beat * spb + offset, dur: Math.max(0.05, nt.dur * spb - offset), vel: nt.vel, mute: nt.mute });
  }
  for (const nt of tl.bass) playBass(ctx, graph.buses.bass, { midi: nt.midi, time: t0 + nt.beat * spb, dur: nt.dur * spb, vel: nt.vel });
  for (const d of tl.drums) {
    const time = t0 + d.beat * spb;
    if (d.part === 'kick') playKick(ctx, graph.buses.drums, time, d.vel);
    else if (d.part === 'snare') playSnare(ctx, graph.buses.drums, time, d.vel);
    else playHat(ctx, graph.buses.drums, time, d.vel, d.part === 'open');
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV, peak-normalised to −1 dBFS. */
export function encodeWav(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let peak = 0;
  for (const ch of data) for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const gain = peak > 0 ? Math.min(4, 0.891 / peak) : 1;
  const bytes = new Uint8Array(44 + length * channels * 2);
  const view = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i] * gain));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return bytes;
}

export function exportFileName(song: Song, ext: string): string {
  const slug = song.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'progression';
  return `${slug}-${song.bpm}bpm.${ext}`;
}

/** Share (mobile) or download (desktop) a generated file. */
export async function saveFile(bytes: Uint8Array, filename: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([bytes as BlobPart], { type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type }) : null;
  if (file && matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'downloaded';
}
