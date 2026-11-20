/**
 * Audio graph: per-track buses → reverb send → compressor → master.
 * Playback "sessions" wrap each run of the transport so Stop can silence
 * everything already scheduled with one fade.
 */
import { guitarBody, type InstrumentId, playNote, warmUp } from './instruments';

export type BusId = 'chords' | 'bass' | 'drums' | 'click';

export interface Mix {
  master: number;
  chords: number;
  bass: number;
  drums: number;
  click: number;
  reverb: number;
}

export class Session {
  readonly gains: Record<BusId, GainNode>;
  private inputs = new Map<InstrumentId, AudioNode>();
  constructor(
    private ctx: AudioContext,
    buses: Record<BusId, GainNode>,
  ) {
    const mk = (bus: BusId) => {
      const g = ctx.createGain();
      g.connect(buses[bus]);
      return g;
    };
    this.gains = { chords: mk('chords'), bass: mk('bass'), drums: mk('drums'), click: mk('click') };
  }

  /** Destination node for a chord instrument (guitars go through a body filter). */
  input(id: InstrumentId): AudioNode {
    let node = this.inputs.get(id);
    if (!node) {
      node = id === 'guitar' || id === 'nylon' ? guitarBody(this.ctx, this.gains.chords) : this.gains.chords;
      this.inputs.set(id, node);
    }
    return node;
  }

  end(fade = 0.06) {
    const now = this.ctx.currentTime;
    for (const g of Object.values(this.gains)) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fade);
    }
    setTimeout(() => {
      for (const g of Object.values(this.gains)) g.disconnect();
    }, (fade + 0.1) * 1000);
  }
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export class AudioEngine {
  ctx: AudioContext | null = null;
  private buses!: Record<BusId, GainNode>;
  private master!: GainNode;
  private reverbSend!: GainNode;
  private previewSession: Session | null = null;
  private mix: Mix = { master: 0.85, chords: 0.8, bass: 0.7, drums: 0.6, click: 0.6, reverb: 0.25 };
  private unlocked = false;

  /** Create (or resume) the AudioContext. Call from a user gesture. */
  ensure(): AudioContext {
    if (!this.ctx) {
      try {
        // Ask iOS to treat this as media playback (ignores the silent switch).
        const nav = navigator as AudioSessionNavigator;
        if (nav.audioSession) nav.audioSession.type = 'playback';
      } catch {
        /* not supported */
      }
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.build(ctx);
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
    if (!this.unlocked) {
      // Play one silent sample to fully unlock audio on older iOS.
      const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start();
      this.unlocked = true;
    }
    return this.ctx;
  }

  private build(ctx: AudioContext) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    comp.connect(this.master).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 2.3, 2.6);
    this.reverbSend = ctx.createGain();
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.9;
    this.reverbSend.connect(reverb).connect(reverbOut).connect(comp);

    const mk = (sendAmount: number) => {
      const g = ctx.createGain();
      g.connect(comp);
      const send = ctx.createGain();
      send.gain.value = sendAmount;
      g.connect(send).connect(this.reverbSend);
      return g;
    };
    this.buses = { chords: mk(1), bass: mk(0.25), drums: mk(0.35), click: ctx.createGain() };
    this.buses.click.connect(comp);
    this.applyMix();
  }

  setMix(mix: Mix) {
    this.mix = mix;
    if (this.ctx) this.applyMix();
  }

  private applyMix() {
    const t = this.ctx!.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.03);
    set(this.master.gain, this.mix.master);
    set(this.buses.chords.gain, this.mix.chords);
    set(this.buses.bass.gain, this.mix.bass);
    set(this.buses.drums.gain, this.mix.drums);
    set(this.buses.click.gain, this.mix.click);
    set(this.reverbSend.gain, this.mix.reverb * 0.8);
  }

  newSession(): Session {
    return new Session(this.ensure(), this.buses);
  }

  warm(id: InstrumentId) {
    if (this.ctx) warmUp(this.ctx, id);
  }

  /** Audition a set of notes (e.g. tapping a chord) with a light strum. */
  preview(notes: number[], instrument: InstrumentId, opts: { spread?: number; dur?: number; vel?: number } = {}) {
    const ctx = this.ensure();
    this.previewSession?.end(0.05);
    const session = new Session(ctx, this.buses);
    this.previewSession = session;
    const start = ctx.currentTime + 0.03;
    const spread = opts.spread ?? 0.018;
    const dest = session.input(instrument);
    notes.forEach((midi, i) => {
      playNote(ctx, dest, instrument, { midi, time: start + i * spread, dur: opts.dur ?? 1.6, vel: opts.vel ?? 0.75 });
    });
  }

  stopPreview() {
    this.previewSession?.end(0.08);
    this.previewSession = null;
  }

  get outputLatency(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!ctx) return 0;
    return (ctx.outputLatency || 0) + (ctx.baseLatency || 0);
  }
}

function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      // Slightly low-passed noise → darker, more natural tail.
      lp += 0.55 * (Math.random() * 2 - 1 - lp);
      const pre = i < ctx.sampleRate * 0.012 ? 0 : 1; // short pre-delay
      d[i] = lp * Math.pow(1 - i / len, decay) * pre;
    }
  }
  return buf;
}

export const engine = new AudioEngine();
