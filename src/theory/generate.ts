/**
 * "Inspire me" progression generator: weighted random walks over functional
 * harmony (tonic → predominant → dominant → tonic), scored for flow and
 * loopability, then seasoned with borrowed chords, secondary dominants and
 * colour tones according to a "spice" amount.
 */
import { type ChordStep, diatonicQuality, makeChord, type QualityId } from './chords';
import { mod12 } from './notes';
import { getMode, type ModeId } from './scales';

export type GenStyle = 'pop' | 'ballad' | 'rock' | 'jazz' | 'dark' | 'modal';

export const GEN_STYLES: { id: GenStyle; name: string; hint: string }[] = [
  { id: 'pop', name: 'Pop', hint: 'Catchy, loopable four-chord feel' },
  { id: 'ballad', name: 'Ballad', hint: 'Gentle, with walking slash-chord basses' },
  { id: 'rock', name: 'Rock', hint: 'Borrowed ♭VII / ♭VI swagger' },
  { id: 'jazz', name: 'Jazz', hint: 'Seventh chords, ii–V motion, secondary dominants' },
  { id: 'dark', name: 'Dark', hint: 'Minor key with a dramatic dominant' },
  { id: 'modal', name: 'Modal', hint: 'Dorian, Mixolydian or Lydian colour' },
];

export interface GenOptions {
  style: GenStyle;
  length: 4 | 8;
  /** 0 = strictly diatonic, 1 = adventurous. */
  spice: number;
  seed: number;
  mode: ModeId;
  meter: 3 | 4;
}

export interface GenResult {
  chords: ChordStep[];
  mode: ModeId;
}

type Table = Record<number, Record<number, number>>;

// Transition weights between scale degrees (0 = I).
const MAJOR_FLOW: Table = {
  0: { 3: 3, 4: 3, 5: 3, 1: 2, 2: 1 },
  1: { 4: 5, 3: 1, 6: 0.5, 0: 0.5 },
  2: { 5: 3, 3: 3, 1: 1 },
  3: { 4: 4, 0: 3, 1: 1.5, 5: 1 },
  4: { 0: 5, 5: 3, 3: 1.5 },
  5: { 3: 4, 1: 3, 4: 2, 2: 1 },
  6: { 0: 4, 2: 1 },
};

const MINOR_FLOW: Table = {
  0: { 3: 3, 5: 3, 6: 3, 4: 1.5, 2: 1.5 },
  1: { 4: 4, 0: 1 },
  2: { 5: 3, 3: 2, 6: 2 },
  3: { 0: 3, 4: 2, 6: 2, 5: 1 },
  4: { 0: 4, 5: 2 },
  5: { 6: 4, 2: 2, 3: 2, 4: 1 },
  6: { 0: 4, 2: 3, 5: 1 },
};

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(weights: Record<number, number>, rand: () => number): number {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return Number(k);
  }
  return Number(entries[entries.length - 1][0]);
}

function isMajorish(mode: ModeId) {
  return mode === 'major' || mode === 'lydian' || mode === 'mixolydian';
}

function walkScore(degrees: number[], flow: Table, style: GenStyle): number {
  let score = 0;
  for (let i = 0; i < degrees.length; i++) {
    const a = degrees[i];
    const b = degrees[(i + 1) % degrees.length];
    const w = flow[a]?.[b] ?? 0;
    score += w > 0 ? Math.log(1 + w) : -3; // loop wrap counts too
    if (a === b) score -= 2;
  }
  const unique = new Set(degrees).size;
  score += unique * 0.8;
  if (!degrees.includes(0)) score -= 4; // must visit home
  if (style === 'jazz') {
    for (let i = 0; i < degrees.length - 1; i++) if (degrees[i] === 1 && degrees[i + 1] === 4) score += 2;
  }
  return score;
}

/** Characteristic chord of each mode, which modal progressions should feature. */
const MODAL_SIGNATURE: Partial<Record<ModeId, number>> = { dorian: 3, mixolydian: 6, lydian: 1, phrygian: 1 };

export function generateProgression(opts: GenOptions): GenResult {
  const rand = rng(opts.seed);
  let mode = opts.mode;
  if (opts.style === 'dark' && isMajorish(mode)) mode = 'minor';
  if (opts.style === 'modal') mode = (['dorian', 'mixolydian', 'lydian'] as ModeId[])[Math.floor(rand() * 3)];
  if ((opts.style === 'pop' || opts.style === 'ballad' || opts.style === 'jazz') && !isMajorish(mode) && mode !== 'minor' && mode !== 'dorian') mode = 'minor';
  const majorish = isMajorish(mode);
  const flow = majorish ? MAJOR_FLOW : MINOR_FLOW;
  const steps = getMode(mode).steps;
  const n = opts.length;

  // Sample many walks, keep the best-flowing loop.
  let best: number[] = [];
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 60; attempt++) {
    const startPool: Record<number, number> = opts.style === 'pop' ? { 0: 4, 5: 2, 3: 1 } : opts.style === 'jazz' ? { 1: 3, 0: 2 } : { 0: 5, 5: 1 };
    const degrees = [pick(startPool, rand)];
    while (degrees.length < n) degrees.push(pick(flow[degrees[degrees.length - 1]], rand));
    const sig = opts.style === 'modal' ? MODAL_SIGNATURE[mode] : undefined;
    let score = walkScore(degrees, flow, opts.style) + rand() * 0.8;
    if (sig !== undefined) score += degrees.includes(sig) ? 3 : -5;
    if (score > bestScore) {
      bestScore = score;
      best = degrees;
    }
  }

  const sevenths = opts.style === 'jazz';
  const chords: ChordStep[] = best.map((d) => makeChord(steps[d], diatonicQuality(mode, d, sevenths), opts.meter));
  const spice = Math.max(0, Math.min(1, opts.spice));

  // Seasoning
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const next = chords[(i + 1) % chords.length];
    const d = steps.indexOf(c.root);
    const roll = rand();
    // Dark minor: raise the dominant before returning home.
    if (!majorish && d === 4 && next.root === 0 && (opts.style === 'dark' || roll < 0.3 + spice * 0.5)) {
      chords[i] = { ...c, quality: sevenths || rand() < spice ? '7' : 'maj' };
      continue;
    }
    if (roll < spice * 0.4) {
      const r2 = rand();
      if (r2 < 0.4 && i > 0 && next.root !== 0 && next.root !== c.root) {
        // Secondary dominant into the next chord.
        chords[i] = { ...c, root: mod12(next.root + 7), quality: '7' };
      } else if (r2 < 0.75) {
        chords[i] = borrow(c, mode, opts.style);
      } else {
        chords[i] = colour(c, rand);
      }
    } else if (opts.style === 'rock' && majorish && d === 4 && rand() < 0.5 + spice * 0.3) {
      chords[i] = { ...c, root: 10, quality: 'maj' }; // ♭VII instead of V
    }
  }

  if (opts.style === 'ballad') {
    // Walk the bass: when roots move by a third, put the passing note in the bass.
    for (let i = 0; i < chords.length - 1; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const prev = chords[i - 1];
      if (c.bass !== null || c.quality.startsWith('dim')) continue;
      const third = c.quality === 'min' || c.quality === 'm7' ? 3 : 4;
      const bassPc = mod12(c.root + third);
      const fromPrev = prev ? mod12(prev.root - bassPc) : 99;
      const toNext = mod12(bassPc - next.root);
      if ((toNext === 1 || toNext === 2) && (fromPrev === 1 || fromPrev === 2) && rand() < 0.7) chords[i] = { ...c, bass: third };
    }
  }
  if (opts.style === 'rock' && rand() < 0.4) {
    for (let i = 0; i < chords.length; i++) if (chords[i].quality === 'maj' || chords[i].quality === 'min') if (rand() < 0.5) chords[i] = { ...chords[i], quality: '5' };
  }
  return { chords, mode };
}

function borrow(c: ChordStep, mode: ModeId, style: GenStyle): ChordStep {
  const majorish = isMajorish(mode);
  if (majorish) {
    if (c.root === 5) return { ...c, quality: c.quality === 'maj7' ? 'm7' : 'min' }; // iv
    if (c.root === 9) return { ...c, root: 8, quality: c.quality.includes('7') ? 'maj7' : 'maj' }; // ♭VI
    if (c.root === 7) return { ...c, root: 10, quality: 'maj' }; // ♭VII
    if (c.root === 4) return { ...c, root: 3, quality: 'maj' }; // ♭III
    if (c.root === 2) return { ...c, quality: style === 'jazz' ? '7' : 'maj' }; // II (V/V)
    return c;
  }
  if (c.root === 5) return { ...c, quality: c.quality.includes('7') ? '7' : 'maj' }; // Dorian IV
  if (c.root === 7) return { ...c, quality: '7' }; // V7
  if (c.root === 2) return { ...c, quality: 'm7b5' };
  if (c.root === 3) return { ...c, quality: 'maj7' };
  return c;
}

function colour(c: ChordStep, rand: () => number): ChordStep {
  const options: Partial<Record<QualityId, QualityId[]>> = {
    maj: ['add9', 'maj7', 'sus2', 'sus4', '6'],
    min: ['m7', 'madd9', 'm9'],
    maj7: ['maj9', '6'],
    m7: ['m9'],
    '7': ['9', '7sus4'],
  };
  const list = options[c.quality];
  if (!list) return c;
  return { ...c, quality: list[Math.floor(rand() * list.length)] };
}
