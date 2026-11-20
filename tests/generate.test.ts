import { describe, expect, it } from 'vitest';
import { QUALITIES } from '../src/theory/chords';
import { GEN_STYLES, generateProgression } from '../src/theory/generate';

describe('progression generator', () => {
  it('produces valid, loopable progressions for every style', () => {
    for (const s of GEN_STYLES) {
      for (const length of [4, 8] as const) {
        for (let seed = 1; seed <= 40; seed++) {
          const r = generateProgression({ style: s.id, length, spice: (seed % 5) / 4, seed, mode: 'major', meter: 4 });
          expect(r.chords).toHaveLength(length);
          for (const c of r.chords) {
            expect(c.quality in QUALITIES).toBe(true);
            expect(c.root).toBeGreaterThanOrEqual(0);
            expect(c.root).toBeLessThan(12);
            expect(c.beats).toBe(4);
          }
          if (s.id === 'dark') expect(r.mode).toBe('minor');
          if (s.id === 'modal') expect(['dorian', 'mixolydian', 'lydian']).toContain(r.mode);
        }
      }
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = generateProgression({ style: 'pop', length: 4, spice: 0.3, seed: 7, mode: 'major', meter: 4 });
    const b = generateProgression({ style: 'pop', length: 4, spice: 0.3, seed: 7, mode: 'major', meter: 4 });
    expect(a.chords.map((c) => [c.root, c.quality])).toEqual(b.chords.map((c) => [c.root, c.quality]));
    const variety = new Set(Array.from({ length: 30 }, (_, i) => generateProgression({ style: 'pop', length: 4, spice: 0.3, seed: i + 1, mode: 'major', meter: 4 }).chords.map((c) => `${c.root}${c.quality}`).join()));
    expect(variety.size).toBeGreaterThan(8);
  });

  it('stays diatonic with zero spice in major', () => {
    for (let seed = 1; seed < 50; seed++) {
      const r = generateProgression({ style: 'pop', length: 8, spice: 0, seed, mode: 'major', meter: 4 });
      for (const c of r.chords) expect([0, 2, 4, 5, 7, 9, 11]).toContain(c.root);
      expect(r.chords.some((c) => c.root === 0)).toBe(true);
    }
  });
});
