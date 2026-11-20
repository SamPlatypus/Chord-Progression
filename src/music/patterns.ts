/**
 * Accompaniment patterns: block chords, guitar-style strums and arpeggios.
 * Each pattern turns a voiced chord into timed note events (in beats, relative
 * to the chord's start).
 */
import type { ChordStep } from '../theory/chords';
import { getQuality } from '../theory/chords';
import { strumNotes, type Voicing } from '../theory/voicing';

export type PatternKind = 'block' | 'strum' | 'arp';

export interface NoteEvent {
  /** Start, in beats from the chord's start. */
  at: number;
  /** Length in beats. */
  dur: number;
  notes: number[];
  /** 0..1 */
  vel: number;
  /** Strum direction: notes are staggered low→high (down) or high→low (up). */
  strum?: 'down' | 'up';
  /** Percussive muted "chuck". */
  mute?: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  kind: PatternKind;
  description: string;
  /** Visual preview rows: one char per step ("D", "U", "x", "•", "." ...). */
  preview: string;
  /** Beats per preview step. */
  step: number;
  /** Meter the pattern is written for (3 = waltz feel). */
  meter: 3 | 4;
  /** Smallest subdivision that swing applies to. */
  swingUnit: 0.5 | 0.25;
  build(v: Voicing, chord: ChordStep, beats: number, seed: number): NoteEvent[];
}

// ---------------------------------------------------------------------------
// Helpers

/** Repeat a one-cycle event list across `beats`, trimming at the chord's end. */
function tile(cycle: number, beats: number, make: (offset: number) => NoteEvent[]): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (let offset = 0; offset < beats - 1e-6; offset += cycle) {
    for (const e of make(offset)) {
      if (e.at >= beats - 1e-6) continue;
      out.push({ ...e, dur: Math.min(e.dur, beats - e.at) });
    }
  }
  return out;
}

/** Durations that ring until the next event (legato). */
function legato(events: NoteEvent[], beats: number, maxDur = Infinity): NoteEvent[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  return sorted.map((e, i) => {
    const next = sorted.slice(i + 1).find((n) => n.at > e.at + 1e-6);
    const until = next ? next.at : beats;
    return { ...e, dur: Math.min(maxDur, Math.max(0.05, until - e.at)) };
  });
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Upper note by extended index (index ≥ length climbs octaves). */
function upperAt(v: Voicing, i: number): number {
  const m = v.upper.length;
  return v.upper[((i % m) + m) % m] + 12 * Math.floor(i / m);
}

// ---------------------------------------------------------------------------
// Strums — grids: D down, d soft down, U up, u soft up, x muted chuck, . rest

function strumPattern(
  id: string,
  name: string,
  description: string,
  grid: string,
  step: number,
  meter: 3 | 4 = 4,
  staccato = false,
): Pattern {
  return {
    id,
    name,
    kind: 'strum',
    description,
    preview: grid,
    step,
    meter,
    swingUnit: step <= 0.25 ? 0.25 : 0.5,
    build(v, chord, beats) {
      const all = strumNotes(v, chord);
      const top = all.slice(-4);
      const cycle = grid.length * step;
      const events = tile(cycle, beats, (offset) => {
        const evs: NoteEvent[] = [];
        [...grid].forEach((ch, i) => {
          const at = offset + i * step;
          switch (ch) {
            case 'D':
              evs.push({ at, dur: 1, notes: all, vel: i === 0 ? 0.95 : 0.85, strum: 'down' });
              break;
            case 'd':
              evs.push({ at, dur: 1, notes: all.slice(1), vel: 0.6, strum: 'down' });
              break;
            case 'U':
              evs.push({ at, dur: 1, notes: top, vel: 0.7, strum: 'up' });
              break;
            case 'u':
              evs.push({ at, dur: 1, notes: top.slice(-3), vel: 0.48, strum: 'up' });
              break;
            case 'x':
              evs.push({ at, dur: 0.12, notes: all.slice(0, 4), vel: 0.75, strum: 'down', mute: true });
              break;
          }
        });
        return evs;
      });
      return legato(events, beats).map((e) =>
        e.mute ? { ...e, dur: 0.12 } : staccato ? { ...e, dur: Math.min(e.dur, step * 0.7) } : e,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Block chords

type Part = 'all' | 'upper' | 'bass';
interface Hit {
  at: number;
  vel: number;
  part?: Part;
  dur?: number;
}

function blockPattern(
  id: string,
  name: string,
  description: string,
  cycle: number,
  hits: Hit[],
  meter: 3 | 4 = 4,
  stepForPreview = 0.5,
): Pattern {
  const steps = Math.round((Number.isFinite(cycle) ? cycle : 4) / stepForPreview);
  const preview = Array.from({ length: steps }, (_, i) => {
    const h = hits.find((x) => Math.abs(x.at - i * stepForPreview) < 1e-6);
    if (!h) return '.';
    if (h.part === 'bass') return 'b';
    return h.vel >= 0.8 ? '●' : '•';
  }).join('');
  return {
    id,
    name,
    kind: 'block',
    description,
    preview,
    step: stepForPreview,
    meter,
    swingUnit: stepForPreview <= 0.25 ? 0.25 : 0.5,
    build(v, _chord, beats) {
      const c = cycle === Infinity ? beats : cycle;
      const events = tile(c, beats, (offset) =>
        hits.map((h) => {
          const notes = h.part === 'bass' ? [v.bass] : h.part === 'upper' ? v.upper : [v.bass, ...v.upper];
          return { at: offset + h.at, dur: h.dur ?? Infinity, notes, vel: h.vel };
        }),
      );
      // Hits without explicit duration ring until the next hit of the same kind.
      return events.map((e, i) => {
        if (Number.isFinite(e.dur)) return e;
        const sameKind = (n: NoteEvent) => n.notes.length > 1 === e.notes.length > 1;
        const next = events.slice(i + 1).find((n) => n.at > e.at + 1e-6 && sameKind(n));
        return { ...e, dur: (next ? next.at : beats) - e.at };
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Arpeggios

type ArpStep = number | 'B' | 'A' | number[];

function arpPattern(
  id: string,
  name: string,
  description: string,
  rate: number,
  seq: (m: number) => ArpStep[],
  opts: { bassHold?: boolean; ring?: number; meter?: 3 | 4; previewLen?: number } = {},
): Pattern {
  const ring = opts.ring ?? rate * 2.5;
  const sample = seq(3);
  const previewLen = opts.previewLen ?? Math.min(16, Math.round(4 / rate));
  const preview = Array.from({ length: previewLen }, (_, i) => {
    const s = sample[i % sample.length];
    if (s === 'B' || s === 'A') return 'b';
    if (Array.isArray(s)) return '●';
    return String(Math.min(9, (s as number) + 1));
  }).join('');
  return {
    id,
    name,
    kind: 'arp',
    description,
    preview,
    step: rate,
    meter: opts.meter ?? 4,
    swingUnit: rate <= 0.25 ? 0.25 : 0.5,
    build(v, chord, beats) {
      const m = v.upper.length;
      const s = seq(m);
      const events: NoteEvent[] = [];
      const fifth = getQuality(chord.quality).tones.find(([, step]) => step === 4)?.[0] ?? 7;
      const altBass = v.bass + ((fifth - (chord.bass ?? 0) + 12) % 12 || 7);
      const steps = Math.round(beats / rate);
      if (opts.bassHold) events.push({ at: 0, dur: beats, notes: [v.bass], vel: 0.7 });
      for (let i = 0; i < steps; i++) {
        const st = s[i % s.length];
        const at = i * rate;
        const accent = Math.abs(at % 1) < 1e-6 ? 0.08 : 0;
        if (st === 'B') {
          if (opts.bassHold) continue;
          events.push({ at, dur: Math.min(ring * 1.5, beats - at), notes: [v.bass], vel: 0.72 });
        } else if (st === 'A') {
          events.push({ at, dur: Math.min(ring, beats - at), notes: [altBass], vel: 0.62 });
        } else if (Array.isArray(st)) {
          const notes = st.map((x) => (x < 0 ? v.bass : upperAt(v, x)));
          events.push({ at, dur: Math.min(ring, beats - at), notes, vel: 0.68 + accent });
        } else {
          events.push({ at, dur: Math.min(ring, beats - at), notes: [upperAt(v, st)], vel: 0.55 + accent });
        }
      }
      return events;
    },
  };
}

const range = (a: number, b: number) => Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => (a <= b ? a + i : a - i));

// ---------------------------------------------------------------------------

export const PATTERNS: Pattern[] = [
  // Strums
  strumPattern('strum-folk', 'Old Faithful', 'D · D U · U D U — the classic campfire/pop strum', 'D.DU.UDU', 0.5),
  strumPattern('strum-quarters', 'Quarter Downs', 'One down-strum per beat; great for learning changes', 'D.D.D.D.', 0.5),
  strumPattern('strum-eighths', 'Steady Eighths', 'Down-up eighths with accents on the beat', 'DuDuDuDu', 0.5),
  strumPattern('strum-rock', 'Driving Rock', 'All down-strokes, punchy and relentless', 'DdDdDdDd', 0.5),
  strumPattern('strum-chuck', 'Backbeat Chuck', 'Muted chucks on 2 and 4 for a percussive groove', 'D.xUD.xU', 0.5),
  strumPattern('strum-ballad', 'Ballad', 'Let the first strum ring, then build', 'D...D.DU', 0.5),
  strumPattern('strum-ska', 'Ska Upstrokes', 'Short up-strokes on every off-beat', '.U.U.U.U', 0.5, 4, true),
  strumPattern('strum-sync16', 'Syncopated 16ths', 'Tresillo-flavoured 3-3-2 sixteenth groove', 'D..U..D.D..U..DU', 0.25),
  strumPattern('strum-ring', 'Let It Ring', 'A single strum per bar — space to sing over', 'D.......', 0.5),
  strumPattern('strum-waltz', 'Waltz Strum', 'Down · Down Up Down Up in 3/4', 'D.DUDU', 0.5, 3),

  // Block chords
  blockPattern('block-sustain', 'Sustained', 'One long chord per change — hear the harmony clearly', Infinity, [{ at: 0, vel: 0.85 }], 4, 1),
  blockPattern('block-half', 'Half Notes', 'Chords on beats 1 and 3', 4, [{ at: 0, vel: 0.85 }, { at: 2, vel: 0.7 }]),
  blockPattern('block-quarters', 'Quarter Pulse', 'Steady chord on every beat', 4, [{ at: 0, vel: 0.85 }, { at: 1, vel: 0.62 }, { at: 2, vel: 0.72 }, { at: 3, vel: 0.62 }]),
  blockPattern('block-eighths', 'Eighth Pulse', 'Driving pop-piano eighths', 4, range(0, 7).map((i) => ({ at: i / 2, vel: i === 0 ? 0.85 : i % 2 === 0 ? 0.66 : 0.5, dur: 0.42 }))),
  blockPattern('block-charleston', 'Charleston', 'Dotted-quarter + eighth — swingy comping', 4, [{ at: 0, vel: 0.85, dur: 1.3 }, { at: 1.5, vel: 0.7, dur: 2 }]),
  blockPattern('block-332', 'Pop Syncopation', '3 + 3 + 2 pushes — modern pop & EDM', 4, [{ at: 0, vel: 0.88 }, { at: 1.5, vel: 0.72 }, { at: 3, vel: 0.76 }]),
  blockPattern('block-ballad', 'Ballad Comp', 'Held bass with gentle right-hand pulses', 4, [
    { at: 0, vel: 0.75, part: 'bass', dur: 4 },
    { at: 0, vel: 0.78, part: 'upper', dur: 1 },
    { at: 1, vel: 0.5, part: 'upper', dur: 0.5 },
    { at: 1.5, vel: 0.62, part: 'upper', dur: 1.5 },
    { at: 3, vel: 0.55, part: 'upper', dur: 1 },
  ]),
  blockPattern('block-offbeat', 'Off-beat Stabs', 'Reggae/ska keys: bass on the beat, chords off it', 4, [
    { at: 0, vel: 0.8, part: 'bass', dur: 1 },
    { at: 0.5, vel: 0.7, part: 'upper', dur: 0.22 },
    { at: 1.5, vel: 0.7, part: 'upper', dur: 0.22 },
    { at: 2, vel: 0.72, part: 'bass', dur: 1 },
    { at: 2.5, vel: 0.7, part: 'upper', dur: 0.22 },
    { at: 3.5, vel: 0.7, part: 'upper', dur: 0.22 },
  ]),
  blockPattern('block-waltz', 'Waltz', 'Oom-pah-pah: bass, chord, chord', 3, [
    { at: 0, vel: 0.85, part: 'bass', dur: 1 },
    { at: 1, vel: 0.62, part: 'upper', dur: 0.8 },
    { at: 2, vel: 0.62, part: 'upper', dur: 0.8 },
  ], 3, 1),

  // Arpeggios
  arpPattern('arp-up', 'Rising', 'Ascending eighths over a held bass', 0.5, (m) => range(0, m), { bassHold: true }),
  arpPattern('arp-down', 'Falling', 'Descending eighths from the top', 0.5, (m) => range(m, 0), { bassHold: true }),
  arpPattern('arp-updown', 'Up & Down', 'Rise and fall — classic broken chord', 0.5, (m) => [...range(0, m), ...range(m - 1, 1)], { bassHold: true }),
  arpPattern('arp-alberti', 'Alberti Bass', 'Low–high–middle–high, the classical accompaniment', 0.5, (m) => [0, m - 1, 1, m - 1], { bassHold: true }),
  arpPattern('arp-rolling', 'Rolling 16ths', 'Flowing sixteenth-note waves', 0.25, (m) => [...range(0, m + 1), ...range(m, 1)], { bassHold: true, ring: 0.6 }),
  arpPattern('arp-travis', 'Travis Picking', 'Alternating thumb bass with pinched melody notes', 0.5, (m) => [[-1, m - 1], m - 2, 'A', m - 1, 'B', m - 2, 'A', m - 1], { ring: 1.2 }),
  arpPattern('arp-spread', 'Spread Piano', 'Wide two-octave sweep over the bass', 0.5, (m) => ['B', 0, 1, m, m + 1, m, 1, 0], { ring: 2 }),
  arpPattern('arp-triplet', 'Triplet Ballad', '12/8-style triplets — soul and doo-wop', 1 / 3, (m) => ['B', 1, m - 1, 0, 1, m - 1], { ring: 0.9, previewLen: 12 }),
  arpPattern('arp-waltz', 'Waltz Arp', 'Bass then rising notes in 3/4', 0.5, (m) => ['B', 0, 1, m - 1, m, m - 1], { ring: 1, meter: 3 }),
  {
    id: 'arp-sparkle',
    name: 'Sparkle',
    kind: 'arp',
    description: 'Randomised high sixteenths — ambient and dreamy',
    preview: '3.25.4.3.5..24.3',
    step: 0.25,
    meter: 4,
    swingUnit: 0.25,
    build(v, _chord, beats, seed) {
      const rand = mulberry32(seed);
      const events: NoteEvent[] = [{ at: 0, dur: beats, notes: [v.bass], vel: 0.6 }];
      const m = v.upper.length;
      for (let i = 0; i < Math.round(beats / 0.25); i++) {
        if (i % 4 !== 0 && rand() < 0.45) continue;
        const note = upperAt(v, Math.floor(rand() * (m + 3)));
        events.push({ at: i * 0.25, dur: Math.min(0.9, beats - i * 0.25), notes: [note], vel: 0.35 + rand() * 0.35 });
      }
      return events;
    },
  },
];

export function getPattern(id: string): Pattern {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];
}

export const PATTERN_KINDS: { kind: PatternKind; label: string }[] = [
  { kind: 'strum', label: 'Strum' },
  { kind: 'arp', label: 'Arpeggio' },
  { kind: 'block', label: 'Block' },
];

// ---------------------------------------------------------------------------
// Swing

/**
 * Map a straight beat position to a swung one. `amount` 0 = straight,
 * 1 = full triplet swing. Applies within each `unit`-pair (8ths or 16ths).
 */
export function swingTime(t: number, amount: number, unit: number): number {
  if (amount <= 0) return t;
  const pair = unit * 2;
  const base = Math.floor(t / pair + 1e-9) * pair;
  const f = t - base;
  const shift = (amount * pair) / 6; // full swing pushes the off-beat to 2/3
  const mid = unit + shift;
  if (f <= unit) return base + (f / unit) * mid;
  return base + mid + ((f - unit) / unit) * (pair - mid);
}

export function applySwing(events: NoteEvent[], amount: number, unit: number): NoteEvent[] {
  if (amount <= 0) return events;
  return events.map((e) => {
    const start = swingTime(e.at, amount, unit);
    const end = swingTime(e.at + e.dur, amount, unit);
    return { ...e, at: start, dur: Math.max(0.03, end - start) };
  });
}

// ---------------------------------------------------------------------------
// Bass lines

export type BassStyle = 'off' | 'root' | 'pulse' | 'rootFifth' | 'walking' | 'octaves';

export const BASS_STYLES: { id: BassStyle; name: string; description: string }[] = [
  { id: 'off', name: 'Off', description: 'No bass track' },
  { id: 'root', name: 'Roots', description: 'Long root notes on every bar' },
  { id: 'pulse', name: 'Pulse', description: 'Driving root eighths (rock/pop)' },
  { id: 'rootFifth', name: 'Root–Fifth', description: 'Country/folk two-step' },
  { id: 'walking', name: 'Walking', description: 'Quarter-note walk with approach notes (jazz/blues)' },
  { id: 'octaves', name: 'Octaves', description: 'Disco/funk octave bounce' },
];

/** Bass events for one chord. `nextBass` is the next chord's bass note (for walking lines). */
export function buildBass(style: BassStyle, v: Voicing, chord: ChordStep, beats: number, beatsPerBar: number, nextBass: number | null): NoteEvent[] {
  if (style === 'off') return [];
  let b = v.bass - 12;
  if (b < 28) b += 12;
  const tones = getQuality(chord.quality).tones;
  const fifth = tones.find(([, step]) => step === 4)?.[0] ?? 7;
  const third = tones.find(([, step]) => step === 2)?.[0] ?? tones[1][0];
  const rootOffset = -(chord.bass ?? 0); // when slash bass, the root is below/above
  const out: NoteEvent[] = [];
  switch (style) {
    case 'root':
      for (let at = 0; at < beats; at += beatsPerBar) out.push({ at, dur: Math.min(beatsPerBar, beats - at) - 0.05, notes: [b], vel: 0.85 });
      break;
    case 'pulse':
      for (let at = 0; at < beats - 1e-6; at += 0.5) out.push({ at, dur: 0.4, notes: [b], vel: at % 1 === 0 ? 0.85 : 0.65 });
      break;
    case 'rootFifth': {
      const f = b + rootOffset + fifth > b + 9 ? b + rootOffset + fifth - 12 : b + rootOffset + fifth;
      for (let i = 0; i < Math.ceil(beats / 2); i++) {
        const at = i * 2;
        out.push({ at, dur: Math.min(1.8, beats - at), notes: [i % 2 === 0 ? b : f], vel: i % 2 === 0 ? 0.85 : 0.72 });
      }
      break;
    }
    case 'octaves':
      for (let at = 0; at < beats - 1e-6; at += 0.5) out.push({ at, dur: 0.38, notes: [at % 1 === 0 ? b : b + 12], vel: at % 1 === 0 ? 0.85 : 0.7 });
      break;
    case 'walking': {
      const n = Math.max(1, Math.round(beats));
      const chordTones = [0, third, fifth, 12].map((s) => b + rootOffset + s).filter((x) => x >= 28);
      for (let i = 0; i < n; i++) {
        let note: number;
        if (i === 0) note = b;
        else if (i === n - 1 && nextBass !== null) {
          let target = nextBass - 12;
          while (target - prevNote(out) > 7) target -= 12;
          while (prevNote(out) - target > 7) target += 12;
          note = target + (target > prevNote(out) ? -1 : 1);
        } else note = chordTones[Math.min(i, chordTones.length - 1)];
        out.push({ at: i, dur: 0.9, notes: [note], vel: i === 0 ? 0.85 : 0.72 });
      }
      break;
    }
  }
  return out;
}

function prevNote(events: NoteEvent[]): number {
  return events.length ? events[events.length - 1].notes[0] : 40;
}
