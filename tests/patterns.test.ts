import { describe, expect, it } from 'vitest';
import { makeChord } from '../src/theory/chords';
import { voiceProgression } from '../src/theory/voicing';
import { applySwing, BASS_STYLES, buildBass, PATTERNS, swingTime } from '../src/music/patterns';
import { DRUM_STYLES, drumHits } from '../src/music/drums';

const chord = makeChord(0, 'maj', 4);
const seventh = makeChord(7, '7', 2);
const [v] = voiceProgression([chord], 0, { smooth: false });
const [v7] = voiceProgression([seventh], 0, { smooth: false });

describe('patterns', () => {
  it('every pattern produces in-range events for common durations', () => {
    for (const p of PATTERNS) {
      for (const [voicing, c] of [
        [v, chord],
        [v7, seventh],
      ] as const) {
        for (const beats of [1, 2, 3, 4, 8]) {
          const events = p.build(voicing, { ...c, beats }, beats, 42);
          expect(events.length, `${p.id} @${beats}`).toBeGreaterThan(0);
          for (const e of events) {
            expect(e.at, p.id).toBeGreaterThanOrEqual(0);
            expect(e.at, p.id).toBeLessThan(beats);
            expect(e.dur, p.id).toBeGreaterThan(0);
            expect(e.at + e.dur, p.id).toBeLessThanOrEqual(beats + 1e-6);
            expect(e.notes.length, p.id).toBeGreaterThan(0);
            for (const n of e.notes) {
              expect(Number.isFinite(n), p.id).toBe(true);
              expect(n).toBeGreaterThanOrEqual(24);
              expect(n).toBeLessThanOrEqual(100);
            }
          }
        }
      }
    }
  });

  it('strum grids honour their rhythm', () => {
    const folk = PATTERNS.find((p) => p.id === 'strum-folk')!;
    const events = folk.build(v, chord, 4, 1);
    expect(events.map((e) => e.at)).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
    expect(events.map((e) => e.strum)).toEqual(['down', 'down', 'up', 'up', 'down', 'up']);
  });

  it('has unique ids', () => {
    expect(new Set(PATTERNS.map((p) => p.id)).size).toBe(PATTERNS.length);
  });
});

describe('swing', () => {
  it('keeps downbeats and pushes off-beats toward the triplet', () => {
    expect(swingTime(0, 1, 0.5)).toBe(0);
    expect(swingTime(1, 1, 0.5)).toBeCloseTo(1);
    expect(swingTime(0.5, 1, 0.5)).toBeCloseTo(2 / 3);
    expect(swingTime(0.5, 0, 0.5)).toBe(0.5);
  });

  it('preserves event ordering', () => {
    const events = PATTERNS.find((p) => p.id === 'strum-eighths')!.build(v, chord, 4, 1);
    const swung = applySwing(events, 0.7, 0.5);
    for (let i = 1; i < swung.length; i++) expect(swung[i].at).toBeGreaterThan(swung[i - 1].at);
  });
});

describe('bass lines', () => {
  it('every style stays in a playable register', () => {
    for (const s of BASS_STYLES) {
      const events = buildBass(s.id, v, chord, 4, 4, 47);
      if (s.id === 'off') {
        expect(events).toEqual([]);
        continue;
      }
      for (const e of events) {
        expect(e.notes[0]).toBeGreaterThanOrEqual(24);
        expect(e.notes[0]).toBeLessThanOrEqual(60);
        expect(e.at).toBeLessThan(4);
      }
    }
  });

  it('walking bass approaches the next root by a semitone', () => {
    const events = buildBass('walking', v, chord, 4, 4, 43 /* G */);
    const last = events[events.length - 1].notes[0];
    expect(Math.abs((last % 12) - 7)).toBe(1);
  });
});

describe('drums', () => {
  it('produces hits for every style except off', () => {
    for (const d of DRUM_STYLES) {
      const hits = drumHits(d);
      if (d.id === 'off') expect(hits).toEqual([]);
      else expect(hits.length).toBeGreaterThan(3);
    }
  });
});
