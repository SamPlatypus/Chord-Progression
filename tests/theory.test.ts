import { describe, expect, it } from 'vitest';
import {
  adaptToMode,
  analyzeChord,
  chordName,
  chordToneNames,
  degreeOf,
  diatonicChords,
  makeChord,
  numeral,
} from '../src/theory/chords';
import { formatChordText, parseProgression, parseRoman } from '../src/theory/parse';
import { enharmonicTonic, type Key, scaleNotes } from '../src/theory/scales';
import { noteName } from '../src/theory/notes';
import { voiceProgression } from '../src/theory/voicing';
import { PRESETS } from '../src/music/presets';

const C_MAJOR: Key = { tonic: { letter: 0, acc: 0 }, mode: 'major' };
const C_MINOR: Key = { tonic: { letter: 0, acc: 0 }, mode: 'minor' };
const F_MINOR: Key = { tonic: { letter: 3, acc: 0 }, mode: 'minor' };
const EB_MAJOR: Key = { tonic: { letter: 2, acc: -1 }, mode: 'major' };
const FS_MAJOR: Key = { tonic: { letter: 3, acc: 1 }, mode: 'major' };

const names = (text: string, key: Key) => parseProgression(text, key, 4).chords.map((c) => chordName(c, key));

describe('scales', () => {
  it('spells scales with one letter per degree', () => {
    expect(scaleNotes(FS_MAJOR).map(noteName)).toEqual(['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
    expect(scaleNotes(F_MINOR).map(noteName)).toEqual(['F', 'G', 'A♭', 'B♭', 'C', 'D♭', 'E♭']);
  });

  it('finds enharmonic tonics', () => {
    expect(noteName(enharmonicTonic({ letter: 0, acc: 1 })!)).toBe('D♭');
    expect(noteName(enharmonicTonic({ letter: 6, acc: -1 })!)).toBe('A♯');
    expect(enharmonicTonic({ letter: 0, acc: 0 })).toBeNull();
  });
});

describe('diatonic chords', () => {
  it('builds major-key triads and sevenths', () => {
    expect(diatonicChords('major', false).map((d) => d.quality)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
    expect(diatonicChords('major', true).map((d) => d.quality)).toEqual(['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']);
  });

  it('builds harmonic minor including the augmented III', () => {
    expect(diatonicChords('harmonicMinor', false).map((d) => d.quality)).toEqual(['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim']);
  });
});

describe('naming', () => {
  it('names chords with key-aware spelling', () => {
    expect(names('i iv v', F_MINOR)).toEqual(['Fm', 'B♭m', 'Cm']);
    expect(names('I IV V7', EB_MAJOR)).toEqual(['E♭', 'A♭', 'B♭7']);
    expect(chordToneNames(makeChord(0, 'min'), F_MINOR)).toEqual(['F', 'A♭', 'C']);
  });

  it('writes numerals relative to the mode', () => {
    expect(numeral(makeChord(8, 'maj'), 'major')).toBe('♭VI');
    expect(numeral(makeChord(8, 'maj'), 'minor')).toBe('VI');
    expect(numeral(makeChord(11, 'dim'), 'major')).toBe('vii°');
    expect(numeral(makeChord(2, 'm7b5'), 'minor')).toBe('iiø7');
    expect(numeral(makeChord(6, 'dim7'), 'major')).toBe('♯iv°7');
  });

  it('prefers the simplest spelling for chromatic roots', () => {
    expect(degreeOf(4, 'minor')).toEqual({ degree: 2, alter: 1 }); // E in C minor = ♯III
    expect(degreeOf(10, 'major')).toEqual({ degree: 6, alter: -1 }); // ♭VII
    expect(chordName(makeChord(4, 'maj'), C_MINOR)).toBe('E');
  });

  it('shows inversions as slash chords and figured bass', () => {
    const c = makeChord(0, 'maj', 4, 4);
    expect(chordName(c, C_MAJOR)).toBe('C/E');
    expect(numeral(c, 'major')).toBe('I⁶');
    const v7 = makeChord(7, '7', 4, 10);
    expect(chordName(v7, C_MAJOR)).toBe('G7/F');
    expect(numeral(v7, 'major')).toBe('V⁴₂');
  });
});

describe('parsing', () => {
  it('parses roman numerals, secondary dominants and borrowed chords', () => {
    expect(names('I V vi IV', C_MAJOR)).toEqual(['C', 'G', 'Am', 'F']);
    expect(names('V7/V V7/vi bVII iv', C_MAJOR)).toEqual(['D7', 'E7', 'B♭', 'Fm']);
    expect(names('i VI III VII', C_MINOR)).toEqual(['Cm', 'A♭', 'E♭', 'B♭']);
    expect(names('ii7 V7 Imaj7', C_MAJOR)).toEqual(['Dm7', 'G7', 'Cmaj7']);
  });

  it('parses chord symbols with slash bass', () => {
    expect(names('C G/B Am7 F#m7b5 Bbmaj7 Dsus4', C_MAJOR)).toEqual(['C', 'G/B', 'Am7', 'F♯m7♭5', 'B♭maj7', 'Dsus4']);
  });

  it('splits bars evenly and honours explicit durations', () => {
    const { chords } = parseProgression('| C G | Am | F:2 G:2 | C F G |', C_MAJOR, 4);
    expect(chords.map((c) => c.beats)).toEqual([2, 2, 4, 2, 2, 2, 1, 1]);
  });

  it('reports unknown tokens', () => {
    const { errors } = parseProgression('C Xyz G', C_MAJOR, 4);
    expect(errors).toEqual(['Xyz']);
  });

  it('round-trips through text', () => {
    const { chords } = parseProgression('| C G | Am | F:2 G:2 | C:3 G:1 |', C_MAJOR, 4);
    const text = formatChordText(chords.map((c) => chordName(c, C_MAJOR)), chords.map((c) => c.beats), 4);
    const again = parseProgression(text, C_MAJOR, 4).chords;
    expect(again.map((c) => [c.root, c.quality, c.beats])).toEqual(chords.map((c) => [c.root, c.quality, c.beats]));
  });

  it('parses every preset', () => {
    for (const p of PRESETS) {
      const key: Key = { tonic: { letter: 0, acc: 0 }, mode: p.mode };
      const r = parseProgression(p.numerals, key, p.meter ?? 4);
      expect(r.errors, p.name).toEqual([]);
      expect(r.chords.length, p.name).toBeGreaterThan(1);
    }
  });

  it('parses inversion figures', () => {
    expect(parseRoman('I/3', 'major')).toEqual({ root: 0, quality: 'maj', bass: 4 });
    expect(parseRoman('V7/7', 'major')).toEqual({ root: 7, quality: '7', bass: 10 });
  });
});

describe('analysis', () => {
  it('labels functions and secondary dominants', () => {
    const [i, v7ofvi, vi] = parseProgression('I V7/vi vi', C_MAJOR, 4).chords;
    expect(analyzeChord(i, C_MAJOR, v7ofvi).fn).toBe('tonic');
    expect(analyzeChord(v7ofvi, C_MAJOR, vi).role).toBe('Secondary dominant → vi');
    const iv = makeChord(5, 'min');
    expect(analyzeChord(iv, C_MAJOR, null).role).toBe('Borrowed from minor');
  });
});

describe('mode adaptation', () => {
  it('maps diatonic chords onto the new mode', () => {
    const chords = parseProgression('I V vi IV', C_MAJOR, 4).chords;
    const minor = adaptToMode(chords, 'major', 'minor');
    expect(minor.map((c) => chordName(c, C_MINOR))).toEqual(['Cm', 'Gm', 'A♭', 'Fm']);
    const back = adaptToMode(minor, 'minor', 'major');
    expect(back.map((c) => chordName(c, C_MAJOR))).toEqual(['C', 'G', 'Am', 'F']);
  });

  it('keeps chromatic chords unchanged', () => {
    const chords = parseProgression('I bVII IV', C_MAJOR, 4).chords;
    const dorian = adaptToMode(chords, 'major', 'dorian');
    expect(dorian[1].root).toBe(10);
    expect(dorian[1].quality).toBe('maj');
  });
});

describe('voicing', () => {
  it('voice-leads with small movements', () => {
    const chords = parseProgression('I IV V I', C_MAJOR, 4).chords;
    const smooth = voiceProgression(chords, 0, { smooth: true });
    for (let i = 1; i < smooth.length; i++) {
      const moved = smooth[i].upper.reduce((s, n, j) => s + Math.abs(n - smooth[i - 1].upper[j]), 0);
      expect(moved).toBeLessThanOrEqual(6);
    }
    for (const v of smooth) {
      expect(v.bass).toBeLessThan(v.upper[0]);
    }
  });

  it('puts slash bass notes in the bass', () => {
    const [c] = parseProgression('C/G', C_MAJOR, 4).chords;
    const [v] = voiceProgression([c], 0, { smooth: false });
    expect(v.bass % 12).toBe(7);
  });
});

describe('numeral text', () => {
  it('round-trips numerals through the parser', async () => {
    const { numeralText } = await import('../src/theory/chords');
    const text = 'I V/3 vi I/5 IV ii7 V7/7 bVII iiø7 vii°7 Imaj7';
    const chords = parseProgression(text, C_MAJOR, 4).chords;
    const out = chords.map((c) => numeralText(c, 'major')).join(' ');
    const again = parseProgression(out, C_MAJOR, 4).chords;
    expect(again.map((c) => [c.root, c.quality, c.bass])).toEqual(chords.map((c) => [c.root, c.quality, c.bass]));
  });
});
