/**
 * Fully synthesized instruments (no samples → works offline, tiny download).
 * Each voice is built from Web Audio nodes scheduled at an exact time.
 */
import { midiToFreq } from '../theory/notes';

export type InstrumentId = 'guitar' | 'piano' | 'ep' | 'pad' | 'organ' | 'nylon';

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  description: string;
  /** Natural strum spread between strings in seconds (0 = block). */
  strumSpread: number;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  { id: 'guitar', name: 'Steel Guitar', description: 'Bright plucked strings (physical model)', strumSpread: 0.014 },
  { id: 'nylon', name: 'Nylon Guitar', description: 'Warm, soft classical guitar', strumSpread: 0.018 },
  { id: 'piano', name: 'Piano', description: 'Warm acoustic-style piano', strumSpread: 0.006 },
  { id: 'ep', name: 'Electric Piano', description: 'Bell-like FM tine keys', strumSpread: 0.006 },
  { id: 'pad', name: 'Synth Pad', description: 'Soft evolving pad', strumSpread: 0.02 },
  { id: 'organ', name: 'Organ', description: 'Drawbar organ with vibrato', strumSpread: 0 },
];

export function getInstrument(id: string): InstrumentInfo {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

export interface NoteSpec {
  midi: number;
  time: number;
  /** Seconds the note is held before release. */
  dur: number;
  vel: number;
  mute?: boolean;
}

// ---------------------------------------------------------------------------
// Shared resources per AudioContext

interface Resources {
  pianoWave: PeriodicWave;
  organWave: PeriodicWave;
  noise: AudioBuffer;
  ks: Map<string, AudioBuffer>;
}

const resources = new WeakMap<BaseAudioContext, Resources>();

function res(ctx: BaseAudioContext): Resources {
  let r = resources.get(ctx);
  if (!r) {
    const pianoHarm = [0, 1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05, 0.035, 0.02, 0.012];
    const organHarm = [0, 1, 0.75, 0.55, 0.42, 0, 0.3, 0, 0.22];
    const mk = (h: number[]) => ctx.createPeriodicWave(new Float32Array(h.map(() => 0)), new Float32Array(h));
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    r = { pianoWave: mk(pianoHarm), organWave: mk(organHarm), noise, ks: new Map() };
    resources.set(ctx, r);
  }
  return r;
}

// ---------------------------------------------------------------------------
// Karplus–Strong plucked string

function ksBuffer(ctx: BaseAudioContext, midi: number, bright: boolean, nylon: boolean): { buffer: AudioBuffer; rate: number } {
  const key = `${midi}:${bright ? 1 : 0}:${nylon ? 1 : 0}`;
  const r = res(ctx);
  const sr = ctx.sampleRate;
  const freq = midiToFreq(midi);
  const N = Math.max(2, Math.floor(sr / freq - 0.5));
  const rate = (freq * (N + 0.5)) / sr;
  let buffer = r.ks.get(key);
  if (!buffer) {
    const t60 = Math.max(1.2, (nylon ? 3.6 : 5.2) - (midi - 40) * 0.075);
    const seconds = Math.min(4, t60 * 0.9);
    const len = Math.floor(sr * seconds);
    buffer = ctx.createBuffer(1, len, sr);
    const out = buffer.getChannelData(0);
    const line = new Float32Array(N);
    // Excitation: filtered noise; softer pluck = stronger low-pass.
    const k = nylon ? (bright ? 0.35 : 0.22) : bright ? 0.75 : 0.45;
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      lp += k * (Math.random() * 2 - 1 - lp);
      line[i] = lp;
      mean += lp;
    }
    mean /= N;
    // Pick position comb (pluck ~1/5 along the string) and DC removal.
    const pick = Math.max(1, Math.floor(N / 5));
    const shaped = new Float32Array(N);
    for (let i = 0; i < N; i++) shaped[i] = line[i] - mean - 0.5 * (line[(i + pick) % N] - mean);
    const rho = Math.pow(0.001, 1 / (freq * t60));
    const damp = nylon ? 0.42 : 0.5; // weighting of the 2-tap average (lower = darker)
    let idx = 0;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      const cur = shaped[idx];
      const nextIdx = idx + 1 === N ? 0 : idx + 1;
      const nxt = shaped[nextIdx];
      shaped[idx] = rho * ((1 - damp) * cur + damp * nxt);
      out[i] = cur;
      const a = Math.abs(cur);
      if (a > peak) peak = a;
      idx = nextIdx;
    }
    // Normalise and fade the tail to avoid clicks.
    const g = peak > 0 ? 0.9 / peak : 1;
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < len; i++) {
      out[i] *= g * (i > len - fade ? (len - i) / fade : 1);
    }
    r.ks.set(key, buffer);
  }
  return { buffer, rate };
}

/** Pre-render string buffers in idle time so the first strum is instant. */
export function warmUp(ctx: BaseAudioContext, id: InstrumentId) {
  if (id !== 'guitar' && id !== 'nylon') return;
  const notes: number[] = [];
  for (let m = 38; m <= 86; m++) notes.push(m);
  const step = () => {
    const batch = notes.splice(0, 6);
    for (const m of batch) {
      ksBuffer(ctx, m, true, id === 'nylon');
      ksBuffer(ctx, m, false, id === 'nylon');
    }
    if (notes.length) setTimeout(step, 16);
  };
  setTimeout(step, 0);
}

function playString(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec, nylon: boolean) {
  const { buffer, rate } = ksBuffer(ctx, n.midi, n.vel > 0.62, nylon);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const amp = ctx.createGain();
  const peak = 0.46 * Math.pow(n.vel, 1.4);
  amp.gain.setValueAtTime(peak, n.time);
  if (n.mute) {
    // Palm-muted chuck: tiny bit of string + filtered noise burst.
    amp.gain.setTargetAtTime(0, n.time + 0.012, 0.012);
    const nz = ctx.createBufferSource();
    nz.buffer = res(ctx).noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18 * n.vel, n.time);
    ng.gain.exponentialRampToValueAtTime(0.001, n.time + 0.05);
    nz.connect(bp).connect(ng).connect(dest);
    nz.start(n.time, Math.random() * 0.5, 0.07);
  } else {
    amp.gain.setTargetAtTime(0, n.time + n.dur, 0.035);
  }
  src.connect(amp).connect(dest);
  src.start(n.time);
  src.stop(n.time + (n.mute ? 0.12 : Math.min(buffer.duration / rate, n.dur + 0.3)));
}

// ---------------------------------------------------------------------------
// Keys & synths

function playPiano(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec) {
  const f = midiToFreq(n.midi);
  const r = res(ctx);
  const t = n.time;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.setPeriodicWave(r.pianoWave);
  osc2.setPeriodicWave(r.pianoWave);
  osc1.frequency.value = f;
  osc2.frequency.value = f;
  osc2.detune.value = 4;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const bright = 900 + n.vel * 4200 + (n.midi - 48) * 40;
  filter.frequency.setValueAtTime(Math.max(600, bright), t);
  filter.frequency.setTargetAtTime(Math.max(500, bright * 0.3), t + 0.01, 0.5);
  const amp = ctx.createGain();
  const peak = 0.135 * Math.pow(n.vel, 1.3);
  const decay = Math.max(0.5, 2.2 - (n.midi - 48) * 0.035);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.004);
  amp.gain.setTargetAtTime(peak * 0.35, t + 0.004, 0.18);
  amp.gain.setTargetAtTime(0, t + 0.3, decay);
  const end = t + n.dur;
  amp.gain.cancelScheduledValues(end);
  amp.gain.setTargetAtTime(0, end, 0.09);
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(amp).connect(dest);
  osc1.start(t);
  osc2.start(t);
  osc1.stop(end + 0.6);
  osc2.stop(end + 0.6);
}

function playEP(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec) {
  const f = midiToFreq(n.midi);
  const t = n.time;
  const end = t + n.dur;
  const carrier = ctx.createOscillator();
  carrier.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const modGain = ctx.createGain();
  const idx = (1.2 + 2.2 * n.vel) * f;
  modGain.gain.setValueAtTime(idx, t);
  modGain.gain.setTargetAtTime(f * 0.35, t, 0.35);
  const tine = ctx.createOscillator();
  tine.frequency.value = f * 14;
  const tineGain = ctx.createGain();
  tineGain.gain.setValueAtTime(f * 0.9 * n.vel, t);
  tineGain.gain.setTargetAtTime(0, t, 0.025);
  mod.connect(modGain).connect(carrier.frequency);
  tine.connect(tineGain).connect(carrier.frequency);
  const amp = ctx.createGain();
  const peak = 0.1 * Math.pow(n.vel, 1.2);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.003);
  amp.gain.setTargetAtTime(0, t + 0.003, Math.max(0.6, 2.4 - (n.midi - 48) * 0.04));
  amp.gain.cancelScheduledValues(end);
  amp.gain.setTargetAtTime(0, end, 0.12);
  carrier.connect(amp).connect(dest);
  for (const o of [carrier, mod, tine]) {
    o.start(t);
    o.stop(end + 0.8);
  }
}

function playPad(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec) {
  const f = midiToFreq(n.midi);
  const t = n.time;
  const end = t + n.dur;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.linearRampToValueAtTime(1400 + n.vel * 1200, t + 0.6);
  filter.frequency.setTargetAtTime(900, t + 0.6, 1.5);
  const amp = ctx.createGain();
  const peak = 0.1 * (0.6 + 0.4 * n.vel);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.28);
  amp.gain.setTargetAtTime(peak * 0.8, t + 0.28, 0.6);
  amp.gain.cancelScheduledValues(end);
  amp.gain.setTargetAtTime(0, end, 0.3);
  const oscs: OscillatorNode[] = [];
  for (const d of [-9, 9]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(filter);
    oscs.push(o);
  }
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.value = f / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.5;
  sub.connect(subGain).connect(filter);
  oscs.push(sub);
  filter.connect(amp).connect(dest);
  for (const o of oscs) {
    o.start(t);
    o.stop(end + 1.8);
  }
}

function playOrgan(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec) {
  const f = midiToFreq(n.midi);
  const t = n.time;
  const end = t + n.dur;
  const r = res(ctx);
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(r.organWave);
  osc.frequency.value = f;
  const sub = ctx.createOscillator();
  sub.frequency.value = f / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.35;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.8;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 7;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.detune);
  lfoGain.connect(sub.detune);
  const amp = ctx.createGain();
  const peak = 0.1 * (0.75 + 0.25 * n.vel);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.012);
  amp.gain.setValueAtTime(peak, end);
  amp.gain.linearRampToValueAtTime(0, end + 0.07);
  osc.connect(amp);
  sub.connect(subGain).connect(amp);
  amp.connect(dest);
  for (const o of [osc, sub, lfo]) {
    o.start(t);
    o.stop(end + 0.1);
  }
}

export function playNote(ctx: BaseAudioContext, dest: AudioNode, id: InstrumentId, n: NoteSpec) {
  switch (id) {
    case 'guitar':
      return playString(ctx, dest, n, false);
    case 'nylon':
      return playString(ctx, dest, n, true);
    case 'piano':
      return playPiano(ctx, dest, n);
    case 'ep':
      return playEP(ctx, dest, n);
    case 'pad':
      return playPad(ctx, dest, n);
    case 'organ':
      return playOrgan(ctx, dest, n);
  }
}

/** Guitar body resonance; returns the input node of the chain. */
export function guitarBody(ctx: BaseAudioContext, dest: AudioNode): AudioNode {
  const low = ctx.createBiquadFilter();
  low.type = 'peaking';
  low.frequency.value = 120;
  low.Q.value = 1.2;
  low.gain.value = 4;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 2600;
  mid.Q.value = 1;
  mid.gain.value = 2.5;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 7000;
  low.connect(mid).connect(top).connect(dest);
  return low;
}

// ---------------------------------------------------------------------------
// Bass & metronome

export function playBass(ctx: BaseAudioContext, dest: AudioNode, n: NoteSpec) {
  const f = midiToFreq(n.midi);
  const t = n.time;
  const end = t + n.dur;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const sine = ctx.createOscillator();
  sine.frequency.value = f;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 3;
  const cutoff = 280 + n.vel * 900;
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.setTargetAtTime(220, t + 0.01, 0.12);
  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.5;
  const amp = ctx.createGain();
  const peak = 0.3 * Math.pow(n.vel, 1.2);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.006);
  amp.gain.setTargetAtTime(peak * 0.6, t + 0.006, 0.25);
  amp.gain.cancelScheduledValues(end);
  amp.gain.setTargetAtTime(0, end, 0.04);
  saw.connect(sawGain).connect(filter);
  sine.connect(filter);
  filter.connect(amp).connect(dest);
  for (const o of [saw, sine]) {
    o.start(t);
    o.stop(end + 0.3);
  }
}

export function playClick(ctx: BaseAudioContext, dest: AudioNode, time: number, accent: boolean, vel = 1) {
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = accent ? 1760 : 1175;
  const amp = ctx.createGain();
  const peak = (accent ? 0.5 : 0.32) * vel;
  amp.gain.setValueAtTime(0, time);
  amp.gain.linearRampToValueAtTime(peak, time + 0.001);
  amp.gain.exponentialRampToValueAtTime(0.0005, time + 0.045);
  osc.connect(amp).connect(dest);
  osc.start(time);
  osc.stop(time + 0.06);
}

// ---------------------------------------------------------------------------
// Drums (simple synthesized kit)

export function playKick(ctx: BaseAudioContext, dest: AudioNode, time: number, vel: number) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.9 * vel, time);
  amp.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
  osc.connect(amp).connect(dest);
  osc.start(time);
  osc.stop(time + 0.4);
}

export function playSnare(ctx: BaseAudioContext, dest: AudioNode, time: number, vel: number) {
  const nz = ctx.createBufferSource();
  nz.buffer = res(ctx).noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.45 * vel, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
  nz.connect(hp).connect(ng).connect(dest);
  nz.start(time, Math.random() * 0.5, 0.2);
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(220, time);
  body.frequency.exponentialRampToValueAtTime(150, time + 0.08);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.35 * vel, time);
  bg.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  body.connect(bg).connect(dest);
  body.start(time);
  body.stop(time + 0.15);
}

export function playHat(ctx: BaseAudioContext, dest: AudioNode, time: number, vel: number, open = false) {
  const nz = ctx.createBufferSource();
  nz.buffer = res(ctx).noise;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  const len = open ? 0.28 : 0.045;
  g.gain.setValueAtTime(0.22 * vel, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + len);
  nz.connect(hp).connect(g).connect(dest);
  nz.start(time, Math.random() * 0.5, len + 0.02);
}

// ---------------------------------------------------------------------------
// Lead voice for the melody pad (held while the pad is pressed)

export function startLead(ctx: BaseAudioContext, dest: AudioNode, midi: number, vel = 0.8): () => void {
  const f = midiToFreq(midi);
  const t = ctx.currentTime + 0.005;
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.value = f;
  const sine = ctx.createOscillator();
  sine.frequency.value = f * 2;
  const sineGain = ctx.createGain();
  sineGain.gain.value = 0.18;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0, t);
  lfoGain.gain.linearRampToValueAtTime(9, t + 0.45);
  lfo.connect(lfoGain);
  lfoGain.connect(tri.detune);
  lfoGain.connect(sine.detune);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  const amp = ctx.createGain();
  const peak = 0.2 * vel;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.014);
  amp.gain.setTargetAtTime(peak * 0.75, t + 0.014, 0.25);
  tri.connect(filter);
  sine.connect(sineGain).connect(filter);
  filter.connect(amp).connect(dest);
  for (const o of [tri, sine, lfo]) o.start(t);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    amp.gain.cancelScheduledValues(now);
    amp.gain.setValueAtTime(amp.gain.value, now);
    amp.gain.setTargetAtTime(0, now, 0.06);
    for (const o of [tri, sine, lfo]) o.stop(now + 0.5);
  };
}
