/** Compact song ⇄ URL-hash encoding for share links (no server needed). */
import type { InstrumentId } from '../audio/instruments';
import type { DrumStyleId } from '../music/drums';
import type { BassStyle } from '../music/patterns';
import { type ChordStep, makeChord, QUALITIES, type QualityId } from '../theory/chords';
import { MODES, type ModeId } from '../theory/scales';
import type { Song } from './types';

interface Packed {
  v: 1;
  n: string;
  t: [number, number];
  m: ModeId;
  b: number;
  mt: 3 | 4;
  p: string;
  i: InstrumentId;
  bs: BassStyle;
  d: DrumStyleId;
  s: number;
  c: [number, QualityId, number | null, number][];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSong(song: Song): string {
  const packed: Packed = {
    v: 1,
    n: song.name,
    t: [song.tonic.letter, song.tonic.acc],
    m: song.mode,
    b: song.bpm,
    mt: song.meter,
    p: song.patternId,
    i: song.instrumentId,
    bs: song.bassStyle,
    d: song.drumStyle,
    s: Math.round(song.swing * 100) / 100,
    c: song.chords.map((c) => [c.root, c.quality, c.bass, c.beats]),
  };
  return toBase64Url(JSON.stringify(packed));
}

export function decodeSong(code: string): Song | null {
  try {
    const p = JSON.parse(fromBase64Url(code)) as Packed;
    if (p.v !== 1 || !Array.isArray(p.c)) return null;
    const chords: ChordStep[] = p.c
      .filter(([root, q, , beats]) => Number.isInteger(root) && q in QUALITIES && beats > 0)
      .slice(0, 128)
      .map(([root, q, bass, beats]) => makeChord(root, q, Math.min(16, Math.max(1, Math.round(beats))), bass ?? null));
    const now = Date.now();
    return {
      id: 'imported',
      name: String(p.n || 'Shared progression').slice(0, 60),
      tonic: { letter: Math.min(6, Math.max(0, p.t[0] | 0)), acc: Math.min(1, Math.max(-1, p.t[1] | 0)) },
      mode: MODES.some((m) => m.id === p.m) ? p.m : 'major',
      bpm: Math.min(260, Math.max(30, Number(p.b) || 100)),
      meter: p.mt === 3 ? 3 : 4,
      chords,
      patternId: String(p.p || 'strum-folk'),
      instrumentId: p.i || 'guitar',
      bassStyle: p.bs || 'root',
      drumStyle: p.d || 'off',
      swing: Math.min(1, Math.max(0, Number(p.s) || 0)),
      loopRange: null,
      createdAt: now,
      updatedAt: now,
    };
  } catch {
    return null;
  }
}

export function shareUrl(song: Song): string {
  const base = location.href.split('#')[0];
  return `${base}#s=${encodeSong(song)}`;
}

/** If the page was opened from a share link, return the song and clear the hash. */
export function consumeShareHash(): Song | null {
  const m = /^#s=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (!m) return null;
  const song = decodeSong(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  return song;
}
