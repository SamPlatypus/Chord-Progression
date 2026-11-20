/**
 * Songwriting helpers: chord substitutions, borrowed-chord palette and a
 * guitar capo finder.
 */
import { type ChordStep, chordPcs, diatonicQuality, getQuality, isInScale, type QualityId } from './chords';
import { mod12, plainName } from './notes';
import { getMode, type Key, type ModeId, tonicPc } from './scales';

export interface Suggestion {
  root: number;
  quality: QualityId;
  bass: number | null;
  reason: string;
}

function isMajorish(mode: ModeId) {
  return mode === 'major' || mode === 'lydian' || mode === 'mixolydian';
}

export function substitutions(chord: ChordStep, next: ChordStep | null, mode: ModeId): Suggestion[] {
  const steps = getMode(mode).steps;
  const out: Suggestion[] = [];
  const add = (root: number, quality: QualityId, reason: string, bass: number | null = null) => {
    const r = mod12(root);
    if (r === chord.root && quality === chord.quality && bass === chord.bass) return;
    if (out.some((s) => s.root === r && s.quality === quality && s.bass === bass)) return;
    out.push({ root: r, quality, bass, reason });
  };
  const q = getQuality(chord.quality);
  const degree = steps.indexOf(chord.root);
  const seventh = q.family === 'seventh';

  if (degree >= 0) {
    // Same degree, different colour
    add(chord.root, diatonicQuality(mode, degree, !seventh), seventh ? 'Simpler triad' : 'Add the 7th');
    // Chords a third away share two notes
    for (const d of [degree + 5, degree + 2]) {
      const dd = d % 7;
      add(steps[dd], diatonicQuality(mode, dd, seventh), 'Shares two notes');
    }
  }
  if (chord.quality === 'maj' || chord.quality === 'min') {
    add(chord.root, 'sus2', 'Open, airy');
    add(chord.root, 'sus4', 'Suspended tension');
    add(chord.root, chord.quality === 'maj' ? 'add9' : 'madd9', 'Add sparkle');
  }
  // Parallel major/minor swap (modal interchange)
  if (chord.quality === 'maj') add(chord.root, 'min', isMajorish(mode) ? 'Borrowed minor colour' : 'Minor version');
  if (chord.quality === 'min') add(chord.root, 'maj', 'Major version (brighter)');
  // Dominant tricks into the next chord
  if (next && next.root !== chord.root) {
    add(next.root + 7, '7', 'Secondary dominant → next chord');
    add(next.root + 1, 'dim7', 'Passing dim7 → next chord');
    add(next.root - 1 + 12, '7', 'Tritone sub → next chord');
  }
  if (chord.quality === '7' || (chord.root === 7 && chord.quality === 'maj')) {
    add(chord.root + 6, '7', 'Tritone substitution');
    add(chord.root, '7sus4', 'Softer dominant');
  }
  // Inversion for smoother bass
  if (q.family === 'triad' && chord.bass === null) {
    add(chord.root, chord.quality, 'First inversion (3rd in bass)', mod12(q.tones[1][0]));
  }
  return out.slice(0, 10);
}

export interface PaletteChord {
  root: number;
  quality: QualityId;
  label?: string;
}

/** Common borrowed / chromatic chords for the current mode. */
export function borrowedPalette(mode: ModeId, sevenths: boolean): PaletteChord[] {
  const list: PaletteChord[] = isMajorish(mode)
    ? [
        { root: 5, quality: sevenths ? 'm7' : 'min' }, // iv
        { root: 10, quality: sevenths ? '7' : 'maj' }, // ♭VII
        { root: 8, quality: sevenths ? 'maj7' : 'maj' }, // ♭VI
        { root: 3, quality: sevenths ? 'maj7' : 'maj' }, // ♭III
        { root: 2, quality: '7' }, // V/V
        { root: 4, quality: '7' }, // V/vi
        { root: 9, quality: '7' }, // V/ii
        { root: 0, quality: '7' }, // V/IV
        { root: 1, quality: sevenths ? 'maj7' : 'maj' }, // Neapolitan
        { root: 11, quality: 'dim7' },
      ]
    : [
        { root: 7, quality: sevenths ? '7' : 'maj' }, // V (harmonic)
        { root: 5, quality: sevenths ? '7' : 'maj' }, // IV (Dorian)
        { root: 11, quality: 'dim7' }, // vii°7
        { root: 1, quality: sevenths ? 'maj7' : 'maj' }, // ♭II
        { root: 0, quality: sevenths ? 'maj7' : 'maj' }, // Picardy I
        { root: 2, quality: '7' }, // V/V
        { root: 0, quality: '7' }, // V/iv
        { root: 9, quality: 'm7b5' }, // vi ø
      ];
  return list.filter((c) => !isInScale(c, mode));
}

// ---------------------------------------------------------------------------
// Capo helper

const OPEN_SHAPES: Record<string, QualityId[]> = {
  C: ['maj', 'maj7', '7', 'add9', 'sus2'],
  D: ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', '6'],
  E: ['maj', 'min', '7', 'm7', 'sus4', '7sus4', '5'],
  F: ['maj7'],
  G: ['maj', '7', '6', 'add9'],
  A: ['maj', 'min', '7', 'm7', 'maj7', 'sus2', 'sus4', '5', '6'],
  B: ['7'],
};

const SHAPE_PCS: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };

export interface CapoOption {
  capo: number;
  shapes: string[];
  open: number;
  total: number;
}

/** Rank capo positions by how many chords become open-position shapes. */
export function capoOptions(chords: ChordStep[], key: Key): CapoOption[] {
  if (chords.length === 0) return [];
  const t = tonicPc(key);
  const out: CapoOption[] = [];
  for (let capo = 0; capo <= 7; capo++) {
    let open = 0;
    const shapes: string[] = [];
    for (const c of chords) {
      const pc = mod12(t + c.root - capo);
      const letter = SHAPE_PCS[pc];
      const ok = !!letter && OPEN_SHAPES[letter].includes(c.quality);
      if (ok) open++;
      const name = plainName(pc, false) + getQuality(c.quality).symbol;
      if (!shapes.includes(name)) shapes.push(name);
    }
    out.push({ capo, shapes, open, total: chords.length });
  }
  return out.sort((a, b) => b.open - a.open || a.capo - b.capo).slice(0, 3);
}

/** Which scale degrees (as absolute pitch classes) belong to the key. */
export function scalePcs(key: Key): number[] {
  const t = tonicPc(key);
  return getMode(key.mode).steps.map((s) => mod12(t + s));
}

export function chordAbsPcs(chord: ChordStep, key: Key): number[] {
  const t = tonicPc(key);
  return chordPcs(chord).map((pc) => mod12(pc + t));
}
