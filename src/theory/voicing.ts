/**
 * Turn abstract chords into concrete MIDI voicings, optionally with smooth
 * voice leading (each chord picks the inversion closest to the previous one).
 */
import { type ChordStep, getQuality } from './chords';
import { mod12 } from './notes';

export interface Voicing {
  /** Bass note (E2–D♯3). */
  bass: number;
  /** Upper-structure notes, ascending (roughly F3–A5). */
  upper: number[];
  /** Pitch class of the chord root (absolute, 0–11). */
  rootPc: number;
  /** Absolute pitch classes of all chord tones. */
  pcs: number[];
}

export interface VoicingOptions {
  /** Pick inversions that move as little as possible between chords. */
  smooth: boolean;
  /** Shift the upper structure: -1 low, 0 middle, 1 high. */
  register?: number;
}

const BASS_LOW = 40; // E2
const UPPER_LOW = 53; // F3 – lowest note of a root-position chord
const CENTER = 64; // E4

/** Upper-structure pitch classes: drop the 5th of five-note chords to keep four voices. */
function upperPcs(chord: ChordStep, rootPc: number): number[] {
  const tones = getQuality(chord.quality).tones;
  let list = tones.map(([s]) => s);
  if (list.length > 4) list = list.filter((s) => s !== 7);
  if (chord.quality === '5') return [0, 7, 12].map((s) => rootPc + s);
  // Keep tone order root-up so rotations form proper inversions.
  return list.map((s) => rootPc + mod12(s));
}

function stack(pcs: number[], startMidi: number): number[] {
  const out = [startMidi];
  for (let i = 1; i < pcs.length; i++) {
    let n = out[i - 1] + 1;
    while (mod12(n) !== mod12(pcs[i])) n++;
    out.push(n);
  }
  return out;
}

function candidates(pcs: number[], low: number, high: number): number[][] {
  const result: number[][] = [];
  const uniq = pcs.length === 3 && mod12(pcs[0]) === mod12(pcs[2]) ? null : pcs; // power chord
  if (!uniq) {
    for (let start = low; start < low + 12; start++) {
      if (mod12(start) === mod12(pcs[0])) {
        result.push([start, start + 7, start + 12]);
        result.push([start + 12, start + 19, start + 24].filter((n) => n <= high));
      }
    }
    return result.filter((c) => c.length === 3);
  }
  for (let r = 0; r < pcs.length; r++) {
    const rotated = pcs.slice(r).concat(pcs.slice(0, r));
    for (let start = low; start < low + 14; start++) {
      if (mod12(start) !== mod12(rotated[0])) continue;
      const v = stack(rotated, start);
      if (v[v.length - 1] <= high) result.push(v);
    }
  }
  return result;
}

function distance(a: number[], b: number[]): number {
  // Average nearest-note movement in both directions (handles different sizes).
  const near = (x: number, set: number[]) => Math.min(...set.map((y) => Math.abs(x - y)));
  const ab = a.reduce((s, x) => s + near(x, b), 0);
  const ba = b.reduce((s, x) => s + near(x, a), 0);
  return (ab + ba) / 2;
}

function mean(v: number[]) {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

export function voiceChord(chord: ChordStep, tonic: number, prev: Voicing | null, opts: VoicingOptions): Voicing {
  const rootPc = mod12(tonic + chord.root);
  const shift = (opts.register ?? 0) * 7;
  const pcs = upperPcs(chord, rootPc);
  const bassPc = mod12(rootPc + (chord.bass ?? 0));
  let bass = BASS_LOW + mod12(bassPc - BASS_LOW);
  if (prev && opts.smooth) {
    // Allow the bass to move by the shortest route within E2–A3.
    const alt = bass + 12 <= 57 ? bass + 12 : bass - 12;
    if (alt >= 36 && Math.abs(alt - prev.bass) < Math.abs(bass - prev.bass) - 2) bass = alt;
  }
  const low = UPPER_LOW + shift;
  let upper: number[];
  if (!prev || !opts.smooth) {
    // Root position, root between F3 and E4 (shifted by register).
    const start = low + mod12(pcs[0] - low);
    upper = stack(pcs, start);
  } else {
    const opts2 = candidates(pcs, low - 3, 84 + shift);
    let best = opts2[0];
    let bestCost = Infinity;
    for (const c of opts2) {
      const drift = Math.max(0, Math.abs(mean(c) - (CENTER + shift)) - 4);
      const cost = distance(c, prev.upper) + drift * 0.75;
      if (cost < bestCost) {
        bestCost = cost;
        best = c;
      }
    }
    upper = best ?? stack(pcs, low + mod12(pcs[0] - low));
  }
  // Keep the bass below the upper structure.
  while (bass >= upper[0]) bass -= 12;
  const allPcs = getQuality(chord.quality).tones.map(([s]) => mod12(rootPc + s));
  return { bass, upper, rootPc, pcs: Array.from(new Set(allPcs)) };
}

/**
 * Voice a whole progression. With `wrap`, a second pass is seeded with the last
 * chord so the loop point (last → first) also moves smoothly.
 */
export function voiceProgression(chords: ChordStep[], tonic: number, opts: VoicingOptions, wrap = false): Voicing[] {
  const pass = (seed: Voicing | null) => {
    const out: Voicing[] = [];
    let prev = seed;
    for (const c of chords) {
      const v = voiceChord(c, tonic, prev, opts);
      out.push(v);
      prev = v;
    }
    return out;
  };
  const first = pass(null);
  if (!wrap || !opts.smooth || chords.length < 2) return first;
  return pass(first[first.length - 1]);
}

/** Notes for a guitar-style strum: bass, optional fifth above it, then the upper voicing. */
export function strumNotes(v: Voicing, chord: ChordStep): number[] {
  const notes = [v.bass];
  const fifth = getQuality(chord.quality).tones.find(([, step]) => step === 4);
  if ((chord.bass ?? 0) === 0 && fifth) {
    const f = v.bass + fifth[0];
    if (f < v.upper[0] - 1) notes.push(f);
  }
  return notes.concat(v.upper);
}
