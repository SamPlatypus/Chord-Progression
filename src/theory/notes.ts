/**
 * Pitch-class arithmetic and note spelling.
 *
 * Notes are spelled by letter + accidental so that, for example, the third
 * of F minor is A♭ (not G♯) and the fourth degree of F♯ major is B (not C♭).
 */

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
/** Natural pitch class of each letter (C = 0). */
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

export const FLAT = '♭';
export const SHARP = '♯';

export interface SpelledNote {
  /** 0..6 index into LETTERS. */
  letter: number;
  /** Accidental in semitones: -2..2. */
  acc: number;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function mod12(n: number): number {
  return mod(n, 12);
}

export function pcOf(note: SpelledNote): number {
  return mod12(LETTER_PC[note.letter] + note.acc);
}

export function accidentalText(acc: number): string {
  if (acc === 0) return '';
  if (acc === 1) return SHARP;
  if (acc === -1) return FLAT;
  if (acc === 2) return '𝄪';
  if (acc === -2) return FLAT + FLAT;
  return '';
}

export function noteName(note: SpelledNote): string {
  return LETTERS[note.letter] + accidentalText(note.acc);
}

/** Plain name for a pitch class using sharps or flats (no letter context). */
export function plainName(pc: number, preferFlat: boolean): string {
  const sharpNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const flatNames = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  return (preferFlat ? flatNames : sharpNames)[mod12(pc)];
}

/** Spelled note for a pitch class with a single accidental at most. */
export function plainSpelling(pc: number, preferFlat: boolean): SpelledNote {
  const p = mod12(pc);
  const naturalIndex = LETTER_PC.indexOf(p as (typeof LETTER_PC)[number]);
  if (naturalIndex >= 0) return { letter: naturalIndex, acc: 0 };
  if (preferFlat) {
    const letter = LETTER_PC.indexOf(mod12(p + 1) as (typeof LETTER_PC)[number]);
    return { letter, acc: -1 };
  }
  const letter = LETTER_PC.indexOf(mod12(p - 1) as (typeof LETTER_PC)[number]);
  return { letter, acc: 1 };
}

/**
 * Spell pitch class `pc` using the given letter. Falls back to a plain
 * spelling when that would require more than one accidental.
 */
export function spellWithLetter(letter: number, pc: number, preferFlat: boolean): SpelledNote {
  const l = mod(letter, 7);
  let acc = mod12(pc - LETTER_PC[l]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 1) return plainSpelling(pc, preferFlat);
  return { letter: l, acc };
}

/** MIDI number → frequency in Hz (A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiName(midi: number, preferFlat = false): string {
  return plainName(midi, preferFlat) + (Math.floor(midi / 12) - 1);
}

/** Parse a note name like "C", "F#", "Bb", "E♭" into a spelled note. */
export function parseNoteName(text: string): SpelledNote | null {
  const m = /^([A-Ga-g])([#♯b♭]{0,2})$/.exec(text.trim());
  if (!m) return null;
  const letter = 'CDEFGAB'.indexOf(m[1].toUpperCase());
  let acc = 0;
  for (const ch of m[2]) acc += ch === '#' || ch === '♯' ? 1 : -1;
  return { letter, acc };
}
