import { describe, expect, it } from 'vitest';
import { guitarShapes, TUNING } from '../src/theory/guitar';
import { chordPcs, type QualityId } from '../src/theory/chords';

const top = (root: number, q: QualityId, bass: number | null = null) => {
  const f = guitarShapes(root, q, bass)[0].frets;
  return f.map((x) => (x < 0 ? 'x' : x > 9 ? `(${x})` : String(x))).join('');
};

describe('guitar shapes', () => {
  it('finds the familiar open chords', () => {
    expect(top(0, 'maj')).toBe('x32010');
    expect(top(7, 'maj')).toBe('320003');
    expect(top(2, 'maj')).toBe('xx0232');
    expect(top(9, 'min')).toBe('x02210');
    expect(top(4, 'min')).toBe('022000');
    expect(top(11, '7')).toBe('x21202');
    expect(top(0, 'maj7')).toBe('x32000');
  });

  it('uses barre shapes where there is no open chord', () => {
    expect(top(5, 'maj')).toBe('133211');
    expect(top(11, 'min')).toBe('x24432');
    expect(top(0, 'min')).toBe('x35543');
    expect(top(6, 'min')).toBe('244222');
    const f = guitarShapes(5, 'maj')[0];
    expect(f.barre).toEqual({ fret: 1, from: 0, to: 5 });
  });

  it('puts slash-chord basses on the lowest string', () => {
    expect(top(7, 'maj', 4)).toBe('x20003'); // G/B
    expect(top(2, 'maj', 4)).toBe('200232'); // D/F#
    expect(top(0, 'maj', 4)).toBe('032010'); // C/E
  });

  it('every shape only sounds chord tones and stays playable', () => {
    const qualities: QualityId[] = ['maj', 'min', '7', 'm7', 'maj7', 'dim', 'm7b5', 'sus4', 'sus2', 'add9', '9', '6', 'aug', '5', 'dim7', 'm9'];
    for (let root = 0; root < 12; root++) {
      for (const q of qualities) {
        const shapes = guitarShapes(root, q);
        expect(shapes.length, `${root} ${q}`).toBeGreaterThan(0);
        const pcs = new Set(chordPcs({ root, quality: q }));
        for (const s of shapes) {
          const fretted = s.frets.filter((f) => f > 0);
          expect(Math.max(0, ...fretted) - Math.min(99, ...fretted.concat(99))).toBeLessThanOrEqual(3);
          expect(s.fingers).toBeLessThanOrEqual(4);
          s.frets.forEach((f, i) => {
            if (f >= 0) expect(pcs.has((TUNING[i] + f) % 12), `${root} ${q} ${s.frets}`).toBe(true);
          });
        }
      }
    }
  });
});

