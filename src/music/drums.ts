/** Simple drum grooves on a 16th-note grid (x = hit, X = accent). */

export type DrumStyleId = 'off' | 'rock' | 'pop' | 'halftime' | 'ballad' | 'disco' | 'waltz';

export interface DrumStyle {
  id: DrumStyleId;
  name: string;
  description: string;
  /** Beats per cycle. */
  beats: number;
  kick: string;
  snare: string;
  hat: string;
  /** Open hi-hat hits. */
  open?: string;
}

export const DRUM_STYLES: DrumStyle[] = [
  { id: 'off', name: 'Off', description: 'No drums', beats: 4, kick: '', snare: '', hat: '' },
  { id: 'rock', name: 'Rock', description: 'Straight eighths, backbeat on 2 & 4', beats: 4, kick: 'X.......x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
  { id: 'pop', name: 'Pop', description: 'Four-on-the-floor with off-beat hats', beats: 4, kick: 'X...x...x...x...', snare: '....X.......X...', hat: '..x...x...x...x.', open: '..............x.' },
  { id: 'halftime', name: 'Half-time', description: 'Big, slow backbeat on 3', beats: 4, kick: 'X.........x.....', snare: '........X.......', hat: 'x.x.x.x.x.x.x.x.' },
  { id: 'ballad', name: 'Ballad', description: 'Soft quarter hats, gentle backbeat', beats: 4, kick: 'x.........x.....', snare: '....x.......x...', hat: 'x...x...x...x...' },
  { id: 'disco', name: 'Disco', description: 'Kick every beat, open hats off the beat', beats: 4, kick: 'X...X...X...X...', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.', open: '..x...x...x...x.' },
  { id: 'waltz', name: 'Waltz', description: 'Boom-tick-tick in 3/4', beats: 3, kick: 'X...........', snare: '....x...x...', hat: 'x.x.x.x.x.x.' },
];

export function getDrumStyle(id: string): DrumStyle {
  return DRUM_STYLES.find((d) => d.id === id) ?? DRUM_STYLES[0];
}

export interface DrumHit {
  /** Beat offset within the cycle. */
  at: number;
  part: 'kick' | 'snare' | 'hat' | 'open';
  vel: number;
}

export function drumHits(style: DrumStyle): DrumHit[] {
  const out: DrumHit[] = [];
  const parts: ['kick' | 'snare' | 'hat' | 'open', string | undefined][] = [
    ['kick', style.kick],
    ['snare', style.snare],
    ['hat', style.hat],
    ['open', style.open],
  ];
  for (const [part, row] of parts) {
    if (!row) continue;
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      // An open hat replaces the closed hat on the same step.
      if (part === 'hat' && style.open?.[i] && style.open[i] !== '.') return;
      out.push({ at: i * 0.25, part, vel: ch === 'X' ? 1 : i % 4 === 0 ? 0.8 : 0.6 });
    });
  }
  return out;
}
