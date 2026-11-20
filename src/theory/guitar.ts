/**
 * Guitar chord shapes for any chord, found by searching the fretboard
 * (standard tuning) for playable fingerings rather than a fixed lookup table —
 * so slash chords, 9ths and every root/quality combination get a diagram.
 */
import { getQuality, type QualityId } from './chords';
import { mod12 } from './notes';

/** Open-string MIDI notes, low E to high E. */
export const TUNING = [40, 45, 50, 55, 59, 64];

export interface GuitarShape {
  /** Fret per string (low E → high E); -1 = muted, 0 = open. */
  frets: number[];
  /** Lowest fretted position shown in the diagram (1 = nut visible). */
  baseFret: number;
  barre: { fret: number; from: number; to: number } | null;
  fingers: number;
  score: number;
}

interface Requirements {
  pcs: Set<number>;
  required: number[];
  bass: number;
  minStrings: number;
  power: boolean;
}

function requirements(rootPc: number, quality: QualityId, bassInterval: number | null): Requirements {
  const tones = getQuality(quality).tones;
  const pcs = new Set(tones.map(([s]) => mod12(rootPc + s)));
  const required = new Set<number>();
  for (const [semi, step] of tones) {
    const pc = mod12(rootPc + semi);
    // The perfect 5th is optional (except in power chords); altered 5ths define the chord.
    if (step === 4 && semi === 7 && quality !== '5') continue;
    required.add(pc);
  }
  const bass = mod12(rootPc + (bassInterval ?? 0));
  if (!pcs.has(bass)) pcs.add(bass);
  return { pcs, required: [...required], bass, minStrings: quality === '5' ? 3 : 4, power: quality === '5' };
}

function evaluate(frets: number[], req: Requirements): GuitarShape | null {
  const sounding = frets.map((f, s) => (f < 0 ? -1 : TUNING[s] + f));
  const playing = frets.map((f, s) => (f >= 0 ? s : -1)).filter((s) => s >= 0);
  if (playing.length < req.minStrings) return null;
  const lowest = playing[0];
  if (mod12(sounding[lowest]) !== req.bass) return null;
  const present = new Set(playing.map((s) => mod12(sounding[s])));
  if (!req.required.every((pc) => present.has(pc))) return null;
  // Mutes: allowed below the bass and above the top string; at most one in between.
  const top = playing[playing.length - 1];
  let interior = 0;
  for (let s = lowest; s <= top; s++) if (frets[s] < 0) interior++;
  if (interior > 1) return null;

  const fretted = frets.filter((f) => f > 0);
  const minF = fretted.length ? Math.min(...fretted) : 0;
  const maxF = fretted.length ? Math.max(...fretted) : 0;
  if (maxF - minF > 3) return null;
  let fingers = fretted.length;
  let barre: GuitarShape['barre'] = null;
  if (fretted.length > 4) {
    // Five or six fretted notes are only playable with a barre at the lowest fret.
    const atMin = frets.map((f, s) => (f === minF ? s : -1)).filter((s) => s >= 0);
    const from = atMin[0];
    const crossed = frets.slice(from, top + 1);
    if (atMin.length < 2 || crossed.some((f) => f === 0 || (f > 0 && f < minF))) return null;
    barre = { fret: minF, from, to: top };
    fingers = 1 + fretted.filter((f) => f > minF).length;
  }
  if (fingers > 4) return null;
  const opens = frets.filter((f) => f === 0).length;
  const highMutes = req.power ? 0 : 5 - top;
  const score =
    fingers * 1 +
    (6 - playing.length) * 1.4 +
    interior * 3 +
    highMutes * 1.2 +
    minF * 0.6 +
    (barre ? 1.6 : 0) -
    (maxF <= 3 ? opens * 0.35 : 0) +
    (maxF - minF) * 0.3 +
    (!barre && fingers === 4 && maxF - minF >= 2 ? 0.6 : 0); // four-finger stretch
  const baseFret = maxF <= 4 ? 1 : minF;
  return { frets: [...frets], baseFret, barre, fingers, score };
}

/** Familiar open-position shapes (absolute frets), keyed by "rootPc:quality". */
const OPEN_SHAPES: Record<string, string> = {
  '0:maj': 'x32010', '0:maj7': 'x32000', '0:7': 'x32310', '0:add9': 'x32030',
  '2:maj': 'xx0232', '2:min': 'xx0231', '2:7': 'xx0212', '2:maj7': 'xx0222', '2:m7': 'xx0211', '2:sus2': 'xx0230', '2:sus4': 'xx0233',
  '4:maj': '022100', '4:min': '022000', '4:7': '020100', '4:m7': '020000', '4:maj7': '021100', '4:sus4': '022200', '4:5': '022xxx', '4:7sus4': '020200',
  '5:maj': '133211', '5:maj7': 'xx3210',
  '7:maj': '320003', '7:7': '320001', '7:maj7': '320002', '7:6': '320000', '7:add9': '320203',
  '9:maj': 'x02220', '9:min': 'x02210', '9:7': 'x02020', '9:m7': 'x02010', '9:maj7': 'x02120', '9:sus2': 'x02200', '9:sus4': 'x02230', '9:5': 'x022xx', '9:6': 'x02222', '9:m6': 'x02212',
  '11:7': 'x21202',
};

/** Movable CAGED-style forms: offsets from the root fret on `string`. */
const MOVABLE: { string: number; bonus: number; maxRoot: number; shapes: Partial<Record<QualityId, number[]>> }[] = [
  {
    string: 0,
    bonus: 3,
    maxRoot: 11,
    shapes: { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '5': [0, 2, 2, -1, -1, -1], maj7: [0, -1, 1, 1, 0, -1], '7sus4': [0, 2, 0, 2, 0, 0] },
  },
  {
    string: 1,
    bonus: 3,
    maxRoot: 11,
    shapes: { maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], '5': [-1, 0, 2, 2, -1, -1], m7b5: [-1, 0, 1, 0, 1, -1] },
  },
  {
    string: 2,
    bonus: 1.6,
    maxRoot: 7,
    shapes: { maj: [-1, -1, 0, 2, 3, 2], min: [-1, -1, 0, 2, 3, 1], '7': [-1, -1, 0, 2, 1, 2], m7: [-1, -1, 0, 2, 1, 1], maj7: [-1, -1, 0, 2, 2, 2], sus4: [-1, -1, 0, 2, 3, 3], sus2: [-1, -1, 0, 2, 3, 0] },
  },
];

function parseFrets(t: string): number[] {
  return [...t].map((c) => (c === 'x' ? -1 : Number(c)));
}

/** Standard shapes for a root-position chord, each with its familiarity bonus. */
function familiar(rootPc: number, quality: QualityId): { frets: number[]; bonus: number }[] {
  const out: { frets: number[]; bonus: number }[] = [];
  const open = OPEN_SHAPES[`${rootPc}:${quality}`];
  if (open) out.push({ frets: parseFrets(open), bonus: 3.2 });
  for (const m of MOVABLE) {
    const tpl = m.shapes[quality];
    if (!tpl) continue;
    const r = mod12(rootPc - TUNING[m.string]);
    for (const root of [r, r + 12]) {
      if (root === 0 || root > m.maxRoot) continue; // r = 0 is the open chord itself
      out.push({ frets: tpl.map((o) => (o < 0 ? -1 : o + root)), bonus: m.bonus });
    }
  }
  return out;
}

const cache = new Map<string, GuitarShape[]>();

/** Best playable shapes, easiest first (deduplicated, varied positions). */
export function guitarShapes(rootPc: number, quality: QualityId, bassInterval: number | null = null, max = 4): GuitarShape[] {
  const key = `${mod12(rootPc)}:${quality}:${bassInterval ?? ''}:${max}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const req = requirements(mod12(rootPc), quality, bassInterval);
  const found = new Map<string, GuitarShape>();
  for (let start = 1; start <= 12; start++) {
    const allowed = [-1];
    if (start <= 3) allowed.push(0);
    for (let f = start; f <= start + 3; f++) allowed.push(f);
    const options = TUNING.map((open) => allowed.filter((f) => f < 0 || req.pcs.has(mod12(open + f))));
    const frets = new Array(6).fill(-1);
    const walk = (s: number) => {
      if (s === 6) {
        const shape = evaluate(frets, req);
        if (shape) {
          const id = frets.join(',');
          const prev = found.get(id);
          if (!prev || prev.score > shape.score) found.set(id, shape);
        }
        return;
      }
      for (const f of options[s]) {
        frets[s] = f;
        walk(s + 1);
      }
    };
    walk(0);
  }
  if (bassInterval === null || mod12(bassInterval) === 0) {
    for (const f of familiar(mod12(rootPc), quality)) {
      const shape = evaluate(f.frets, req);
      if (!shape) continue;
      shape.score -= f.bonus;
      const id = f.frets.join(',');
      const prev = found.get(id);
      if (!prev || prev.score > shape.score) found.set(id, shape);
    }
  }
  const sorted = [...found.values()].sort((a, b) => a.score - b.score);
  // Keep variety: skip shapes too similar in position to ones already chosen.
  const out: GuitarShape[] = [];
  for (const s of sorted) {
    const pos = Math.max(...s.frets);
    if (out.some((o) => Math.abs(Math.max(...o.frets) - pos) < 2 && o.frets.filter((f, i) => f === s.frets[i]).length >= 4)) continue;
    out.push(s);
    if (out.length >= max) break;
  }
  cache.set(key, out);
  return out;
}
