import { describe, expect, it } from 'vitest';
import { buildTimeline, exportMidi } from '../src/audio/export';
import { PRESETS } from '../src/music/presets';
import { DEFAULT_SETTINGS, songFromPreset } from '../src/state/store';

function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (o: number) => String.fromCharCode(...bytes.slice(o, o + 4));
  expect(str(0)).toBe('MThd');
  const ntracks = dv.getUint16(10);
  const ppq = dv.getUint16(12);
  let o = 14;
  const tracks: { tick: number; status: number; d1: number; d2: number }[][] = [];
  for (let t = 0; t < ntracks; t++) {
    expect(str(o)).toBe('MTrk');
    const len = dv.getUint32(o + 4);
    let p = o + 8;
    const end = p + len;
    let tick = 0;
    const evs: { tick: number; status: number; d1: number; d2: number }[] = [];
    const vlq = () => {
      let v = 0;
      let b;
      do {
        b = bytes[p++];
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80);
      return v;
    };
    while (p < end) {
      tick += vlq();
      const status = bytes[p++];
      if (status === 0xff) {
        p++;
        const l = vlq();
        p += l;
        continue;
      }
      if ((status & 0xf0) === 0xc0) {
        p += 1;
        continue;
      }
      evs.push({ tick, status, d1: bytes[p], d2: bytes[p + 1] });
      p += 2;
    }
    expect(p).toBe(end);
    tracks.push(evs);
    o = end;
  }
  return { ntracks, ppq, tracks };
}

describe('export', () => {
  const song = { ...songFromPreset(PRESETS.find((p) => p.id === 'twelve-bar')!), drumStyle: 'rock' as const };

  it('builds a timeline covering every pass', () => {
    const tl = buildTimeline(song, DEFAULT_SETTINGS, 2);
    expect(tl.totalBeats).toBe(12 * 4 * 2);
    expect(tl.markers).toHaveLength(24);
    expect(Math.max(...tl.chords.map((c) => c.beat))).toBeLessThan(tl.totalBeats);
    expect(tl.drums.length).toBeGreaterThan(0);
  });

  it('writes a valid multi-track MIDI file with balanced notes', () => {
    const midi = readMidi(exportMidi(song, DEFAULT_SETTINGS, 1));
    expect(midi.ntracks).toBe(4); // meta, chords, bass, drums
    expect(midi.ppq).toBe(480);
    for (const evs of midi.tracks.slice(1)) {
      const on = new Map<string, number>();
      for (const e of evs) {
        const ch = e.status & 0x0f;
        const k = `${ch}:${e.d1}`;
        if ((e.status & 0xf0) === 0x90 && e.d2 > 0) {
          expect(on.get(k) ?? 0, `overlapping ${k} at ${e.tick}`).toBe(0);
          on.set(k, 1);
        } else if ((e.status & 0xf0) === 0x80) {
          expect(on.get(k), `off without on ${k}`).toBe(1);
          on.set(k, 0);
        }
      }
      expect([...on.values()].every((v) => v === 0)).toBe(true);
    }
    // Last chord note ends within the 48 beats of one pass.
    const lastTick = Math.max(...midi.tracks[1].map((e) => e.tick));
    expect(lastTick).toBeLessThanOrEqual(48 * 480);
  });
});
