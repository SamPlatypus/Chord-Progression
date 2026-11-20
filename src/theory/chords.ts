import { mod, mod12, noteName, type SpelledNote, spellWithLetter } from './notes';
import { getMode, type Key, keyPrefersFlat, type ModeId, tonicPc } from './scales';

export type QualityId =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  | '5'
  | 'maj7'
  | '7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | 'mMaj7'
  | 'augMaj7'
  | '6'
  | 'm6'
  | 'add9'
  | 'madd9'
  | '9'
  | 'maj9'
  | 'm9'
  | '7sus4';

export interface Quality {
  id: QualityId;
  name: string;
  /** Suffix used after the root in chord symbols ("m7", "maj7", ...). */
  symbol: string;
  /** Whether the Roman numeral is written in lower case. */
  lower: boolean;
  /** Suffix after the Roman numeral ("°", "ø7", "maj7", ...). */
  numeral: string;
  /** Chord tones as [semitones above root, letter steps above root]. */
  tones: readonly (readonly [number, number])[];
  /** Diatonic "size" family used when re-harmonising. */
  family: 'triad' | 'seventh' | 'color';
}

const T = (semi: number, step: number) => [semi, step] as const;

export const QUALITIES: Record<QualityId, Quality> = {
  maj: { id: 'maj', name: 'Major', symbol: '', lower: false, numeral: '', tones: [T(0, 0), T(4, 2), T(7, 4)], family: 'triad' },
  min: { id: 'min', name: 'Minor', symbol: 'm', lower: true, numeral: '', tones: [T(0, 0), T(3, 2), T(7, 4)], family: 'triad' },
  dim: { id: 'dim', name: 'Diminished', symbol: 'dim', lower: true, numeral: '°', tones: [T(0, 0), T(3, 2), T(6, 4)], family: 'triad' },
  aug: { id: 'aug', name: 'Augmented', symbol: 'aug', lower: false, numeral: '+', tones: [T(0, 0), T(4, 2), T(8, 4)], family: 'triad' },
  sus2: { id: 'sus2', name: 'Suspended 2nd', symbol: 'sus2', lower: false, numeral: 'sus2', tones: [T(0, 0), T(2, 1), T(7, 4)], family: 'color' },
  sus4: { id: 'sus4', name: 'Suspended 4th', symbol: 'sus4', lower: false, numeral: 'sus4', tones: [T(0, 0), T(5, 3), T(7, 4)], family: 'color' },
  '5': { id: '5', name: 'Power chord', symbol: '5', lower: false, numeral: '5', tones: [T(0, 0), T(7, 4), T(12, 0)], family: 'color' },
  maj7: { id: 'maj7', name: 'Major 7th', symbol: 'maj7', lower: false, numeral: 'maj7', tones: [T(0, 0), T(4, 2), T(7, 4), T(11, 6)], family: 'seventh' },
  '7': { id: '7', name: 'Dominant 7th', symbol: '7', lower: false, numeral: '7', tones: [T(0, 0), T(4, 2), T(7, 4), T(10, 6)], family: 'seventh' },
  m7: { id: 'm7', name: 'Minor 7th', symbol: 'm7', lower: true, numeral: '7', tones: [T(0, 0), T(3, 2), T(7, 4), T(10, 6)], family: 'seventh' },
  m7b5: { id: 'm7b5', name: 'Half-diminished', symbol: 'm7♭5', lower: true, numeral: 'ø7', tones: [T(0, 0), T(3, 2), T(6, 4), T(10, 6)], family: 'seventh' },
  dim7: { id: 'dim7', name: 'Diminished 7th', symbol: 'dim7', lower: true, numeral: '°7', tones: [T(0, 0), T(3, 2), T(6, 4), T(9, 6)], family: 'seventh' },
  mMaj7: { id: 'mMaj7', name: 'Minor-major 7th', symbol: 'm(maj7)', lower: true, numeral: '(maj7)', tones: [T(0, 0), T(3, 2), T(7, 4), T(11, 6)], family: 'seventh' },
  augMaj7: { id: 'augMaj7', name: 'Augmented major 7th', symbol: 'maj7♯5', lower: false, numeral: '+maj7', tones: [T(0, 0), T(4, 2), T(8, 4), T(11, 6)], family: 'seventh' },
  '6': { id: '6', name: 'Major 6th', symbol: '6', lower: false, numeral: '6', tones: [T(0, 0), T(4, 2), T(7, 4), T(9, 5)], family: 'color' },
  m6: { id: 'm6', name: 'Minor 6th', symbol: 'm6', lower: true, numeral: '6', tones: [T(0, 0), T(3, 2), T(7, 4), T(9, 5)], family: 'color' },
  add9: { id: 'add9', name: 'Add 9', symbol: 'add9', lower: false, numeral: 'add9', tones: [T(0, 0), T(4, 2), T(7, 4), T(14, 1)], family: 'color' },
  madd9: { id: 'madd9', name: 'Minor add 9', symbol: 'm(add9)', lower: true, numeral: 'add9', tones: [T(0, 0), T(3, 2), T(7, 4), T(14, 1)], family: 'color' },
  '9': { id: '9', name: 'Dominant 9th', symbol: '9', lower: false, numeral: '9', tones: [T(0, 0), T(4, 2), T(7, 4), T(10, 6), T(14, 1)], family: 'color' },
  maj9: { id: 'maj9', name: 'Major 9th', symbol: 'maj9', lower: false, numeral: 'maj9', tones: [T(0, 0), T(4, 2), T(7, 4), T(11, 6), T(14, 1)], family: 'color' },
  m9: { id: 'm9', name: 'Minor 9th', symbol: 'm9', lower: true, numeral: '9', tones: [T(0, 0), T(3, 2), T(7, 4), T(10, 6), T(14, 1)], family: 'color' },
  '7sus4': { id: '7sus4', name: '7th sus4', symbol: '7sus4', lower: false, numeral: '7sus4', tones: [T(0, 0), T(5, 3), T(7, 4), T(10, 6)], family: 'color' },
};

/** Ordered list for pickers, grouped by how common they are. */
export const QUALITY_GROUPS: { label: string; ids: QualityId[] }[] = [
  { label: 'Triads', ids: ['maj', 'min', 'dim', 'aug', 'sus2', 'sus4', '5'] },
  { label: 'Sevenths', ids: ['maj7', '7', 'm7', 'm7b5', 'dim7', 'mMaj7', '7sus4'] },
  { label: 'Colour', ids: ['6', 'm6', 'add9', 'madd9', '9', 'maj9', 'm9', 'augMaj7'] },
];

export function getQuality(id: QualityId): Quality {
  return QUALITIES[id] ?? QUALITIES.maj;
}

/** One step of a progression. Roots are stored relative to the key's tonic so the
 * progression transposes automatically when the key changes. */
export interface ChordStep {
  id: string;
  /** Semitones above the tonic, 0..11. */
  root: number;
  quality: QualityId;
  /** Bass note as semitones above the chord root (null = root position). */
  bass: number | null;
  /** Duration in beats. */
  beats: number;
}

let idCounter = 0;
export function newId(): string {
  idCounter = (idCounter + 1) % 1e6;
  return `c${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function makeChord(root: number, quality: QualityId, beats = 4, bass: number | null = null): ChordStep {
  return { id: newId(), root: mod12(root), quality, bass, beats };
}

// ---------------------------------------------------------------------------
// Diatonic harmony

const TRIAD_BY_INTERVALS: Record<string, QualityId> = {
  '4,7': 'maj',
  '3,7': 'min',
  '3,6': 'dim',
  '4,8': 'aug',
};
const SEVENTH_BY_INTERVALS: Record<string, QualityId> = {
  '4,7,11': 'maj7',
  '4,7,10': '7',
  '3,7,10': 'm7',
  '3,6,10': 'm7b5',
  '3,6,9': 'dim7',
  '3,7,11': 'mMaj7',
  '4,8,11': 'augMaj7',
};

/** Quality of the diatonic chord built by stacking thirds on a scale degree. */
export function diatonicQuality(mode: ModeId, degree: number, seventh: boolean): QualityId {
  const steps = getMode(mode).steps;
  const at = (n: number) => steps[mod(n, 7)] + 12 * Math.floor(n / 7);
  const root = at(degree);
  const third = at(degree + 2) - root;
  const fifth = at(degree + 4) - root;
  if (!seventh) return TRIAD_BY_INTERVALS[`${third},${fifth}`] ?? 'maj';
  const sev = at(degree + 6) - root;
  return SEVENTH_BY_INTERVALS[`${third},${fifth},${sev}`] ?? diatonicQuality(mode, degree, false);
}

export interface DiatonicChord {
  degree: number;
  root: number;
  quality: QualityId;
}

export function diatonicChords(mode: ModeId, seventh: boolean): DiatonicChord[] {
  const steps = getMode(mode).steps;
  return steps.map((root, degree) => ({ degree, root, quality: diatonicQuality(mode, degree, seventh) }));
}

/** Pitch classes (relative to tonic) of a chord's tones. */
export function chordPcs(chord: Pick<ChordStep, 'root' | 'quality'>): number[] {
  return getQuality(chord.quality).tones.map(([s]) => mod12(chord.root + s));
}

export function isInScale(chord: Pick<ChordStep, 'root' | 'quality'>, mode: ModeId): boolean {
  const steps = getMode(mode).steps;
  return chordPcs(chord).every((pc) => steps.includes(pc));
}

// ---------------------------------------------------------------------------
// Analysis: degree, spelling, numerals, function

export interface DegreeInfo {
  /** 0..6 scale degree used for spelling. */
  degree: number;
  /** Chromatic alteration relative to the mode's scale degree (-1, 0, +1). */
  alter: number;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/**
 * Find the scale degree (and alteration) that best names a root.
 * Chooses the degree that yields the simplest spelling (E in C minor is ♯III,
 * not ♭IV); ties prefer the flat form (♭VI, ♭VII), the pop/rock convention,
 * except diminished chords a tritone above the tonic, which read as ♯iv°.
 */
export function degreeOf(root: number, mode: ModeId, quality?: QualityId): DegreeInfo {
  const steps = getMode(mode).steps;
  const r = mod12(root);
  const exact = steps.indexOf(r);
  if (exact >= 0) return { degree: exact, alter: 0 };
  const flatOf = steps.findIndex((s) => mod12(s - 1) === r);
  const sharpOf = steps.findIndex((s) => mod12(s + 1) === r);
  if (flatOf < 0 && sharpOf < 0) return { degree: 0, alter: 0 };
  if (flatOf < 0) return { degree: sharpOf, alter: 1 };
  if (sharpOf < 0) return { degree: flatOf, alter: -1 };
  const flatAcc = Math.abs(steps[flatOf] - MAJOR_STEPS[flatOf] - 1);
  const sharpAcc = Math.abs(steps[sharpOf] - MAJOR_STEPS[sharpOf] + 1);
  if (sharpAcc < flatAcc) return { degree: sharpOf, alter: 1 };
  if (flatAcc < sharpAcc) return { degree: flatOf, alter: -1 };
  const dimish = quality === 'dim' || quality === 'dim7' || quality === 'm7b5';
  if (flatOf === 0 || (dimish && r === 6)) return { degree: sharpOf, alter: 1 };
  return { degree: flatOf, alter: -1 };
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const SUPERSCRIPT: Record<string, string> = { '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷' };
const SUBSCRIPT: Record<string, string> = { '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆' };

export function rootSpelling(root: number, key: Key, quality?: QualityId): SpelledNote {
  const { degree } = degreeOf(root, key.mode, quality);
  return spellWithLetter(key.tonic.letter + degree, tonicPc(key) + root, keyPrefersFlat(key));
}

/** Spell each chord tone (root first) using third-based letter stacking. */
export function chordToneNames(chord: Pick<ChordStep, 'root' | 'quality'>, key: Key): string[] {
  const rootNote = rootSpelling(chord.root, key, chord.quality);
  const flat = keyPrefersFlat(key);
  return getQuality(chord.quality)
    .tones.filter(([s]) => s < 12 || s === 14)
    .map(([s, step]) => noteName(spellWithLetter(rootNote.letter + step, tonicPc(key) + chord.root + s, flat)));
}

/** Index of the bass note within the chord tones (0 root, 1 third, ...), or -1. */
export function bassToneIndex(chord: Pick<ChordStep, 'quality' | 'bass'>): number {
  if (chord.bass === null || chord.bass === 0) return 0;
  const tones = getQuality(chord.quality).tones;
  return tones.findIndex(([s]) => mod12(s) === mod12(chord.bass as number));
}

export function chordName(chord: Pick<ChordStep, 'root' | 'quality' | 'bass'>, key: Key): string {
  const rootNote = rootSpelling(chord.root, key, chord.quality);
  const q = getQuality(chord.quality);
  let name = noteName(rootNote) + q.symbol;
  if (chord.bass !== null && mod12(chord.bass) !== 0) {
    const flat = keyPrefersFlat(key);
    const pc = tonicPc(key) + chord.root + chord.bass;
    const toneIdx = q.tones.findIndex(([s]) => mod12(s) === mod12(chord.bass as number));
    const bassNote =
      toneIdx >= 0
        ? spellWithLetter(rootNote.letter + q.tones[toneIdx][1], pc, flat)
        : spellWithLetter(rootSpelling(mod12(chord.root + chord.bass), key).letter, pc, flat);
    name += '/' + noteName(bassNote);
  }
  return name;
}

export interface NumeralParts {
  /** Accidental prefix (♭/♯) or empty. */
  acc: string;
  /** Roman numeral with case applied. */
  base: string;
  /** Quality suffix ("°", "7", "maj7"...). */
  suffix: string;
  /** Inversion figure or slash text. */
  figure: string;
}

export function numeralParts(chord: Pick<ChordStep, 'root' | 'quality' | 'bass'>, mode: ModeId): NumeralParts {
  const { degree, alter } = degreeOf(chord.root, mode, chord.quality);
  const q = getQuality(chord.quality);
  const base = q.lower ? ROMAN[degree].toLowerCase() : ROMAN[degree];
  const acc = alter < 0 ? '♭' : alter > 0 ? '♯' : '';
  let suffix = q.numeral;
  let figure = '';
  const inv = bassToneIndex(chord);
  if (chord.bass !== null && chord.bass !== 0) {
    const isSeventh = q.tones.length >= 4 && q.tones[3][1] === 6;
    if (inv === 1 || inv === 2 || (inv === 3 && isSeventh)) {
      if (isSeventh) {
        // Seventh-chord figures replace the plain "7".
        const figs = ['', '65', '43', '42'][inv];
        figure = SUPERSCRIPT[figs[0]] + SUBSCRIPT[figs[1]];
        if (suffix === '7') suffix = '';
        else if (suffix === 'ø7') suffix = 'ø';
        else if (suffix === '°7') suffix = '°';
      } else if (q.family === 'triad') {
        figure = inv === 1 ? SUPERSCRIPT['6'] : SUPERSCRIPT['6'] + SUBSCRIPT['4'];
      } else {
        figure = '/' + ['', '3', '5', '7'][inv];
      }
    } else {
      // Non-chord-tone bass: show the bass scale degree.
      const b = degreeOf(mod12(chord.root + chord.bass), mode);
      figure = '/' + (b.alter < 0 ? '♭' : b.alter > 0 ? '♯' : '') + (b.degree + 1);
    }
  }
  return { acc, base, suffix, figure };
}

export function numeral(chord: Pick<ChordStep, 'root' | 'quality' | 'bass'>, mode: ModeId): string {
  const p = numeralParts(chord, mode);
  return p.acc + p.base + p.suffix + p.figure;
}

/** Numeral in the plain text form understood by parseRoman ("♭VII", "V7/3"). */
export function numeralText(chord: Pick<ChordStep, 'root' | 'quality' | 'bass'>, mode: ModeId): string {
  const { degree, alter } = degreeOf(chord.root, mode, chord.quality);
  const q = getQuality(chord.quality);
  let out = (alter < 0 ? '♭' : alter > 0 ? '♯' : '') + (q.lower ? ROMAN[degree].toLowerCase() : ROMAN[degree]) + q.numeral;
  const inv = bassToneIndex(chord);
  if (chord.bass !== null && chord.bass !== 0 && inv > 0) {
    const step = q.tones[inv][1];
    const fig = { 2: '3', 4: '5', 6: '7' }[step];
    if (fig) out += '/' + fig;
  }
  return out;
}

export type HarmonicFunction = 'tonic' | 'predominant' | 'dominant' | 'chromatic';

export interface ChordAnalysis {
  name: string;
  numeral: string;
  fn: HarmonicFunction;
  /** Human-readable role, e.g. "Tonic", "Secondary dominant → vi". */
  role: string;
  diatonic: boolean;
}

const MAJOR_FUNCTION: HarmonicFunction[] = ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'tonic', 'dominant'];
const MINOR_FUNCTION: HarmonicFunction[] = ['tonic', 'predominant', 'tonic', 'predominant', 'dominant', 'predominant', 'dominant'];

function isMajorish(mode: ModeId) {
  return mode === 'major' || mode === 'lydian' || mode === 'mixolydian';
}

const DOMINANT_QUALITIES: QualityId[] = ['maj', '7', '9', '7sus4'];

/** Describe the role of a chord in context (uses the following chord for secondary dominants). */
export function analyzeChord(chord: ChordStep, key: Key, next?: ChordStep | null): ChordAnalysis {
  const name = chordName(chord, key);
  const num = numeral(chord, key.mode);
  const diatonic = isInScale(chord, key.mode);
  const { degree, alter } = degreeOf(chord.root, key.mode, chord.quality);
  if (diatonic && alter === 0) {
    const fn = (isMajorish(key.mode) ? MAJOR_FUNCTION : MINOR_FUNCTION)[degree];
    const roleName = { tonic: 'Tonic', predominant: 'Predominant', dominant: 'Dominant', chromatic: 'Chromatic' }[fn];
    return { name, numeral: num, fn, role: degree === 0 ? 'Tonic · home' : roleName, diatonic };
  }
  // Dominant of the tonic borrowed from harmonic minor (V in minor).
  if (chord.root === 7 && DOMINANT_QUALITIES.includes(chord.quality)) {
    return { name, numeral: num, fn: 'dominant', role: 'Dominant (raised 7th)', diatonic };
  }
  if (chord.root === 11 && (chord.quality === 'dim' || chord.quality === 'dim7')) {
    return { name, numeral: num, fn: 'dominant', role: 'Leading-tone chord', diatonic };
  }
  if (next && DOMINANT_QUALITIES.includes(chord.quality) && mod12(chord.root + 5) === next.root && next.root !== 0) {
    const target = numeral({ ...next, bass: null, quality: next.quality }, key.mode).replace(/[^♭♯IVXivx°+]/g, '');
    return { name, numeral: num, fn: 'chromatic', role: `Secondary dominant → ${target}`, diatonic };
  }
  if (next && (chord.quality === 'dim7' || chord.quality === 'dim') && mod12(chord.root + 1) === next.root) {
    return { name, numeral: num, fn: 'chromatic', role: 'Passing diminished', diatonic };
  }
  if (DOMINANT_QUALITIES.includes(chord.quality) && mod12(chord.root - 1) === 0 && next?.root === 0) {
    return { name, numeral: num, fn: 'dominant', role: 'Tritone substitute', diatonic };
  }
  const parallel: ModeId = isMajorish(key.mode) ? 'minor' : 'major';
  if (isInScale(chord, parallel)) {
    return { name, numeral: num, fn: 'chromatic', role: `Borrowed from ${parallel}`, diatonic };
  }
  for (const m of ['dorian', 'mixolydian', 'lydian', 'phrygian', 'harmonicMinor'] as ModeId[]) {
    if (m !== key.mode && isInScale(chord, m)) {
      return { name, numeral: num, fn: 'chromatic', role: `Borrowed from ${getMode(m).name}`, diatonic };
    }
  }
  return { name, numeral: num, fn: 'chromatic', role: 'Chromatic colour', diatonic };
}

/**
 * Re-express a progression in another mode. Chords that were diatonic in the old
 * mode are mapped onto the same scale degree of the new mode (keeping their
 * triad/seventh size); other chords keep their exact sound.
 */
export function adaptToMode(chords: ChordStep[], from: ModeId, to: ModeId): ChordStep[] {
  if (from === to) return chords;
  const fromSteps = getMode(from).steps;
  const toSteps = getMode(to).steps;
  return chords.map((c) => {
    const degree = fromSteps.indexOf(c.root);
    if (degree < 0) return c;
    const q = getQuality(c.quality);
    const wasDiatonic = isInScale(c, from);
    const root = toSteps[degree];
    if (wasDiatonic && (q.family === 'triad' || q.family === 'seventh')) {
      const seventh = q.family === 'seventh';
      const quality = diatonicQuality(to, degree, seventh);
      const bass = c.bass === null ? null : remapBass(c, quality);
      return { ...c, root, quality, bass };
    }
    if (wasDiatonic) {
      // Colour chords (sus, add9, 6...) keep their colour but follow the new third.
      const third = diatonicQuality(to, degree, false);
      const quality = recolor(c.quality, third === 'min' || third === 'dim');
      return { ...c, root, quality };
    }
    return c;
  });
}

/** Snap every chord to the diatonic chord on its (nearest) scale degree. */
export function fitToMode(chords: ChordStep[], mode: ModeId): ChordStep[] {
  const steps = getMode(mode).steps;
  return chords.map((c) => {
    if (isInScale(c, mode)) return c;
    const degree = steps.includes(c.root) ? steps.indexOf(c.root) : degreeOf(c.root, mode, c.quality).degree;
    const root = steps[degree];
    const q = getQuality(c.quality);
    if (q.family === 'triad' || q.family === 'seventh') {
      const quality = diatonicQuality(mode, degree, q.family === 'seventh');
      return { ...c, root, quality, bass: c.bass === null ? null : remapBass(c, quality) };
    }
    const third = diatonicQuality(mode, degree, false);
    const quality = recolor(c.quality, third === 'min' || third === 'dim');
    const fitted = { ...c, root, quality };
    if (isInScale(fitted, mode)) return fitted;
    return { ...fitted, quality: third, bass: c.bass === null ? null : remapBass(c, third) };
  });
}

function recolor(q: QualityId, minor: boolean): QualityId {
  const pairs: [QualityId, QualityId][] = [
    ['6', 'm6'],
    ['add9', 'madd9'],
    ['9', 'm9'],
    ['maj9', 'm9'],
  ];
  for (const [maj, min] of pairs) {
    if (minor && q === maj) return min;
    if (!minor && q === min) return maj;
  }
  return q;
}

function remapBass(c: ChordStep, quality: QualityId): number | null {
  const idx = bassToneIndex(c);
  if (idx < 0) return c.bass;
  const tones = getQuality(quality).tones;
  return idx < tones.length ? mod12(tones[idx][0]) : null;
}

/** Total beats in a progression. */
export function totalBeats(chords: ChordStep[]): number {
  return chords.reduce((sum, c) => sum + c.beats, 0);
}
