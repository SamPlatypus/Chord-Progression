/**
 * Glue between the store and the audio transport: play/stop, auditioning,
 * mixer sync, playhead polling and screen wake-lock.
 */
import { store } from '../state/store';
import type { ChordStep } from '../theory/chords';
import { tonicPc } from '../theory/scales';
import { strumNotes, voiceChord, type Voicing } from '../theory/voicing';
import { engine } from './engine';
import { getInstrument } from './instruments';
import { songVoicings, Transport } from './transport';

export const transport = new Transport(
  engine,
  () => ({ song: store.state.song, settings: store.state.settings, version: store.state.version }),
  {
    onEnded: () => {
      store.setTransport({ playing: false, chordIndex: -1, beat: 0, countIn: 0, loop: 0 });
      releaseWakeLock();
    },
    onTempoTrainer: (bpm) => {
      store.setTempo(bpm);
      store.toast(`Tempo trainer: ${bpm} BPM`);
    },
  },
);

let raf = 0;

function poll() {
  if (!transport.playing) {
    store.setTransport({ playing: false, chordIndex: -1, beat: 0, countIn: 0 });
    return;
  }
  const pos = transport.position();
  if (pos) store.setTransport({ chordIndex: pos.chordIndex, beat: pos.beat, countIn: pos.countIn, loop: pos.loop });
  raf = requestAnimationFrame(poll);
}

export function syncMix() {
  const s = store.state.settings;
  engine.setMix({ ...s.volumes, reverb: s.reverb });
}

export function play(fromIndex?: number) {
  if (store.state.song.chords.length === 0) {
    store.toast('Add some chords first');
    return;
  }
  engine.stopPreview();
  syncMix();
  transport.start(fromIndex);
  engine.warm(store.state.song.instrumentId);
  store.setTransport({ playing: true, chordIndex: -1, beat: 0, countIn: 0, loop: 0 });
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(poll);
  void requestWakeLock();
}

export function stop() {
  transport.stop();
  cancelAnimationFrame(raf);
  store.setTransport({ playing: false, chordIndex: -1, beat: 0, countIn: 0, loop: 0 });
  releaseWakeLock();
}

export function togglePlay() {
  if (transport.playing) stop();
  else play();
}

/** Smooth playhead for animations (call from requestAnimationFrame). */
export function playhead() {
  return transport.position();
}

function previewNotes(v: Voicing, chord: ChordStep): number[] {
  const inst = store.state.song.instrumentId;
  if (inst === 'guitar' || inst === 'nylon') return strumNotes(v, chord);
  return [v.bass, ...v.upper];
}

/** Hear a chord from the progression (no-op while playing). */
export function auditionIndex(index: number) {
  if (transport.playing) return;
  const { song, settings } = store.state;
  const chord = song.chords[index];
  if (!chord) return;
  const v = songVoicings(song, settings)[index];
  engine.preview(previewNotes(v, chord), song.instrumentId, { spread: getInstrument(song.instrumentId).strumSpread || 0.004 });
  engine.warm(song.instrumentId);
}

/** Hear an arbitrary chord, voice-led from the selected/last chord. */
export function auditionChord(chord: Pick<ChordStep, 'root' | 'quality' | 'bass'>) {
  if (transport.playing) return;
  const { song, settings } = store.state;
  const full: ChordStep = { id: 'preview', beats: 4, ...chord };
  const t = tonicPc({ tonic: song.tonic, mode: song.mode });
  const voicings = songVoicings(song, settings);
  const ref = store.state.selected ?? song.chords.length - 1;
  const prev = voicings[ref] ?? null;
  const v = voiceChord(full, t, prev, { smooth: settings.voiceLeading, register: settings.register });
  engine.preview(previewNotes(v, full), song.instrumentId, { spread: getInstrument(song.instrumentId).strumSpread || 0.004 });
}

// ---------------------------------------------------------------------------
// Screen wake lock while playing (practice without the phone dimming)

type WakeLockSentinelLike = { release(): Promise<void> };
let wakeLock: WakeLockSentinelLike | null = null;

async function requestWakeLock() {
  if (!store.state.settings.keepAwake) return;
  const nav = navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<WakeLockSentinelLike> } };
  try {
    if (nav.wakeLock && !wakeLock) wakeLock = await nav.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && transport.playing) {
      wakeLock = null;
      void requestWakeLock();
    }
  });
}

let lastMixKey = '';
store.subscribe(() => {
  const s = store.state.settings;
  const key = JSON.stringify([s.volumes, s.reverb]);
  if (key !== lastMixKey) {
    lastMixKey = key;
    syncMix();
  }
});
