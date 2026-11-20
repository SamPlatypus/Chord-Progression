/**
 * Text parsing for progressions: Roman numerals ("I V vi IV", "ii7 V7 Imaj7",
 * "V7/V", "bVII") and chord symbols ("C G Am F", "F#m7b5", "G/B").
 * Bars may be delimited with "|" — chords inside one bar share its beats.
 */
import { type ChordStep, getQuality, makeChord, type QualityId } from './chords';
import { mod12, parseNoteName, pcOf } from './notes';
import { getMode, type Key, type ModeId, tonicPc } from './scales';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const ROMAN_DEGREE: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };

const UPPER_SUFFIX: Record<string, QualityId> = {
  '': 'maj',
  M: 'maj',
  maj: 'maj',
  '7': '7',
  dom7: '7',
  maj7: 'maj7',
  M7: 'maj7',
  'Δ': 'maj7',
  'Δ7': 'maj7',
  '6': '6',
  '9': '9',
  maj9: 'maj9',
  add9: 'add9',
  add2: 'add9',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '7sus4': '7sus4',
  '7sus': '7sus4',
  '5': '5',
  '+': 'aug',
  aug: 'aug',
  '+maj7': 'augMaj7',
  'maj7#5': 'augMaj7',
  'maj7♯5': 'augMaj7',
  m: 'min',
  min: 'min',
  '-': 'min',
  m7: 'm7',
  min7: 'm7',
  '-7': 'm7',
  m6: 'm6',
  m9: 'm9',
  madd9: 'madd9',
  'm(add9)': 'madd9',
  mmaj7: 'mMaj7',
  mMaj7: 'mMaj7',
  mM7: 'mMaj7',
  'm(maj7)': 'mMaj7',
  dim: 'dim',
  '°': 'dim',
  o: 'dim',
  dim7: 'dim7',
  '°7': 'dim7',
  o7: 'dim7',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  m7b5: 'm7b5',
  'm7♭5': 'm7b5',
  'min7b5': 'm7b5',
};

const LOWER_SUFFIX: Record<string, QualityId> = {
  '': 'min',
  '7': 'm7',
  '6': 'm6',
  '9': 'm9',
  add9: 'madd9',
  maj7: 'mMaj7',
  M7: 'mMaj7',
  '(maj7)': 'mMaj7',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '5': '5',
  '°': 'dim',
  o: 'dim',
  dim: 'dim',
  '°7': 'dim7',
  o7: 'dim7',
  dim7: 'dim7',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  m7b5: 'm7b5',
};

export interface ParsedChord {
  root: number;
  quality: QualityId;
  bass: number | null;
  beats?: number;
}

function normalizeAccidentals(s: string): string {
  return s.replace(/♭/g, 'b').replace(/♯/g, '#');
}

/** Bass given as a chord-tone index after a slash: "/3", "/5", "/7". */
function bassFromFigure(quality: QualityId, fig: string): number | null | undefined {
  const tones = getQuality(quality).tones;
  const map: Record<string, number> = { '1': 0, '3': 1, '5': 2, '7': 3 };
  const idx = map[fig];
  if (idx === undefined) return undefined;
  if (idx === 0) return null;
  const tone = tones.find(([, step]) => step === [0, 2, 4, 6][idx]);
  return tone ? mod12(tone[0]) : undefined;
}

/**
 * Parse one Roman numeral. Numerals without an accidental are read against the
 * current mode's scale ("VI" in minor = ♭6); an explicit ♭/♯ is read against the
 * major scale ("♭VI" is always a minor sixth above the tonic).
 */
export function parseRoman(token: string, mode: ModeId): ParsedChord | null {
  const t = normalizeAccidentals(token.trim());
  // Secondary function: "V7/V", "vii°/vi"
  const slash = t.indexOf('/');
  if (slash > 0) {
    const head = t.slice(0, slash);
    const tail = t.slice(slash + 1);
    if (/^[1357]$/.test(tail)) {
      const base = parseRoman(head, mode);
      if (!base) return null;
      const bass = bassFromFigure(base.quality, tail);
      if (bass === undefined) return null;
      return { ...base, bass };
    }
    const target = parseRoman(tail, mode);
    const inner = parseRoman(head, 'major');
    if (!target || !inner) return null;
    return { root: mod12(target.root + inner.root), quality: inner.quality, bass: inner.bass };
  }
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(t);
  if (!m) return null;
  const [, acc, num, rest] = m;
  const upper = num === num.toUpperCase();
  const degree = ROMAN_DEGREE[num.toUpperCase()];
  const steps = getMode(mode).steps;
  const root = acc ? mod12(MAJOR[degree] + (acc === 'b' ? -1 : 1)) : steps[degree];
  const table = upper ? UPPER_SUFFIX : LOWER_SUFFIX;
  const quality = table[rest] ?? table[rest.toLowerCase()];
  if (!quality) return null;
  return { root, quality, bass: null };
}

/** Parse a chord symbol like "Am7", "F#m7b5", "Bbmaj7", "G/B", "C/G". */
export function parseChordSymbol(token: string, key: Key): ParsedChord | null {
  const t = normalizeAccidentals(token.trim());
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(t);
  if (!m) return null;
  const rootNote = parseNoteName(m[1]);
  if (!rootNote) return null;
  const quality = UPPER_SUFFIX[m[2]] ?? UPPER_SUFFIX[m[2].replace(/^min/, 'm')];
  if (!quality) return null;
  const root = mod12(pcOf(rootNote) - tonicPc(key));
  let bass: number | null = null;
  if (m[3]) {
    const b = parseNoteName(m[3]);
    if (!b) return null;
    bass = mod12(pcOf(b) - pcOf(rootNote));
    if (bass === 0) bass = null;
  }
  return { root, quality, bass };
}

export function parseChordToken(token: string, key: Key): ParsedChord | null {
  // Optional duration suffix: "C:2", "vi:8"
  const durMatch = /^(.*?)(?::(\d+(?:\.\d+)?))$/.exec(token);
  const body = durMatch ? durMatch[1] : token;
  const beats = durMatch ? Number(durMatch[2]) : undefined;
  const parsed = /^[A-G]/.test(body) ? parseChordSymbol(body, key) : parseRoman(body, key.mode);
  if (!parsed) return null;
  return beats ? { ...parsed, beats } : parsed;
}

export interface ParseResult {
  chords: ChordStep[];
  errors: string[];
}

/**
 * Parse a whole progression. Without bar lines each chord lasts one bar;
 * with bar lines ("| C G | Am F |") chords in a bar split it evenly.
 * A token may carry an explicit length in beats: "C:2", "vi:8".
 */
export function parseProgression(text: string, key: Key, beatsPerBar: number): ParseResult {
  const errors: string[] = [];
  const chords: ChordStep[] = [];
  const cleaned = text.replace(/[–—→,]/g, ' ').replace(/\s-\s/g, ' ');
  const hasBars = cleaned.includes('|');
  const groups = hasBars ? cleaned.split('|') : cleaned.split(/\s+/);
  for (const group of groups) {
    const tokens = group.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const parsed: ParsedChord[] = [];
    for (const tok of tokens) {
      if (tok === '%') {
        const prev = parsed[parsed.length - 1] ?? chords[chords.length - 1];
        if (prev) parsed.push({ root: prev.root, quality: prev.quality, bass: prev.bass });
        continue;
      }
      const p = parseChordToken(tok, key);
      if (p) parsed.push(p);
      else errors.push(tok);
    }
    if (parsed.length === 0) continue;
    if (!hasBars) {
      for (const p of parsed) chords.push(makeChord(p.root, p.quality, clampBeats(p.beats ?? beatsPerBar), p.bass));
      continue;
    }
    const explicit = parsed.reduce((sum, p) => sum + (p.beats ?? 0), 0);
    const free = parsed.filter((p) => p.beats === undefined).length;
    const avail = Math.max(free, beatsPerBar - explicit);
    const base = free ? Math.floor(avail / free) : 0;
    let extra = free ? avail - base * free : 0;
    for (const p of parsed) {
      let beats = p.beats;
      if (beats === undefined) {
        beats = base + (extra > 0 ? 1 : 0);
        if (extra > 0) extra--;
      }
      chords.push(makeChord(p.root, p.quality, clampBeats(beats), p.bass));
    }
  }
  return { chords, errors };
}

function clampBeats(b: number): number {
  return Math.min(16, Math.max(1, Math.round(b)));
}

/** Format a progression as lead-sheet text ("| C | G | Am F |"); parseable by parseProgression. */
export function formatChordText(names: string[], beats: number[], beatsPerBar: number): string {
  const bars: string[] = [];
  let cur: { name: string; b: number }[] = [];
  let acc = 0;
  const flush = () => {
    const sum = cur.reduce((s, i) => s + i.b, 0);
    const even = sum === beatsPerBar && cur.every((i) => i.b === cur[0].b) && beatsPerBar % cur.length === 0;
    bars.push(cur.map((i) => (even ? i.name : `${i.name}:${i.b}`)).join(' '));
    cur = [];
    acc = 0;
  };
  names.forEach((name, i) => {
    const b = beats[i];
    if (acc === 0 && b === beatsPerBar) {
      bars.push(name);
      return;
    }
    if (acc === 0 && b % beatsPerBar === 0) {
      bars.push(`${name}:${b}`);
      return;
    }
    cur.push({ name, b });
    acc += b;
    if (acc >= beatsPerBar) flush();
  });
  if (cur.length) flush();
  return '| ' + bars.join(' | ') + ' |';
}

