import { LETTER_PC, mod12, noteName, pcOf, type SpelledNote, spellWithLetter } from './notes';

export type ModeId =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'harmonicMinor'
  | 'melodicMinor';

export interface Mode {
  id: ModeId;
  name: string;
  /** Short label used in compact UI ("maj", "min", ...). */
  short: string;
  /** Seven ascending semitone offsets from the tonic. */
  steps: readonly number[];
  mood: string;
  /** Whether a flat-leaning key signature is typical when spelling the tonic. */
  minorish: boolean;
}

export const MODES: readonly Mode[] = [
  { id: 'major', name: 'Major', short: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], mood: 'Bright, resolved, home-like', minorish: false },
  { id: 'minor', name: 'Minor', short: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10], mood: 'Dark, emotional, introspective', minorish: true },
  { id: 'dorian', name: 'Dorian', short: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], mood: 'Minor with a hopeful, soulful lift (♮6)', minorish: true },
  { id: 'mixolydian', name: 'Mixolydian', short: 'Mixo', steps: [0, 2, 4, 5, 7, 9, 10], mood: 'Bluesy, rock, laid-back major (♭7)', minorish: false },
  { id: 'lydian', name: 'Lydian', short: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], mood: 'Dreamy, floating, cinematic (♯4)', minorish: false },
  { id: 'phrygian', name: 'Phrygian', short: 'Phryg', steps: [0, 1, 3, 5, 7, 8, 10], mood: 'Dark, Spanish, metal (♭2)', minorish: true },
  { id: 'harmonicMinor', name: 'Harmonic Minor', short: 'Harm min', steps: [0, 2, 3, 5, 7, 8, 11], mood: 'Dramatic, classical, exotic (♮7)', minorish: true },
  { id: 'melodicMinor', name: 'Melodic Minor', short: 'Mel min', steps: [0, 2, 3, 5, 7, 9, 11], mood: 'Jazzy, sophisticated minor', minorish: true },
  { id: 'locrian', name: 'Locrian', short: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10], mood: 'Unstable, tense, rarely home', minorish: true },
];

export function getMode(id: ModeId): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

export interface Key {
  tonic: SpelledNote;
  mode: ModeId;
}

export function tonicPc(key: Key): number {
  return pcOf(key.tonic);
}

/** Whether the key prefers flats when an enharmonic choice is needed. */
export function keyPrefersFlat(key: Key): boolean {
  if (key.tonic.acc < 0) return true;
  if (key.tonic.acc > 0) return false;
  // Natural tonics: decide by the key signature of the mode.
  const mode = getMode(key.mode);
  const pcs = mode.steps.map((s) => mod12(tonicPc(key) + s));
  const spelled = scaleNotes(key);
  const flats = spelled.filter((n) => n.acc < 0).length;
  const sharps = spelled.filter((n) => n.acc > 0).length;
  if (flats !== sharps) return flats > sharps;
  return pcs.includes(10) && !pcs.includes(6); // contains B♭ but not F♯
}

/** The seven scale notes spelled with consecutive letters. */
export function scaleNotes(key: Key): SpelledNote[] {
  const mode = getMode(key.mode);
  const t = pcOf(key.tonic);
  return mode.steps.map((s, i) => spellWithLetter(key.tonic.letter + i, t + s, key.tonic.acc < 0));
}

export function keyName(key: Key): string {
  return `${noteName(key.tonic)} ${getMode(key.mode).name}`;
}

/** Conventional tonic spellings offered by the key picker, by pitch class. */
export function defaultTonic(pc: number, minorish: boolean): SpelledNote {
  const p = mod12(pc);
  // Major-ish: C D♭ D E♭ E F F♯ G A♭ A B♭ B
  // Minor-ish: C C♯ D E♭ E F F♯ G G♯ A B♭ B
  const major: [number, number][] = [
    [0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0],
  ];
  const minor: [number, number][] = [
    [0, 0], [0, 1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [6, -1], [6, 0],
  ];
  const [letter, acc] = (minorish ? minor : major)[p];
  return { letter, acc };
}

/** The other spelling of a black-key tonic (C♯ ↔ D♭), or null for naturals. */
export function enharmonicTonic(note: SpelledNote): SpelledNote | null {
  if (note.acc === 0) return null;
  const pc = pcOf(note);
  const letter = note.acc > 0 ? (note.letter + 1) % 7 : (note.letter + 6) % 7;
  let acc = mod12(pc - LETTER_PC[letter]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 1) return null;
  return { letter, acc };
}
