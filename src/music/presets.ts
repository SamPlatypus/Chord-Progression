import type { ModeId } from '../theory/scales';
import type { BassStyle } from './patterns';

export interface Preset {
  id: string;
  name: string;
  category: 'Pop' | 'Rock' | 'Ballad' | 'Jazz' | 'Blues & Soul' | 'Minor & Cinematic' | 'Modal' | 'Classical';
  /** Roman numerals, bar-delimited. Read against `mode` (see parseRoman). */
  numerals: string;
  mode: ModeId;
  /** Songwriting note shown in the browser. */
  note: string;
  bpm: number;
  patternId: string;
  bassStyle: BassStyle;
  swing?: number;
  meter?: 3 | 4;
  instrumentId?: string;
}

export const PRESETS: Preset[] = [
  // Pop
  { id: 'axis', name: 'The Axis', category: 'Pop', numerals: 'I V vi IV', mode: 'major', note: 'The four chords behind countless hits. Uplifting and familiar.', bpm: 100, patternId: 'strum-folk', bassStyle: 'root' },
  { id: 'sensitive', name: 'Sensitive Female', category: 'Pop', numerals: 'vi IV I V', mode: 'major', note: 'Axis rotated to start on vi — wistful, anthemic.', bpm: 92, patternId: 'block-332', bassStyle: 'pulse', instrumentId: 'piano' },
  { id: 'fifties', name: "'50s Doo-Wop", category: 'Pop', numerals: 'I vi IV V', mode: 'major', note: 'The "Stand By Me" family. Sweet, nostalgic.', bpm: 76, patternId: 'arp-triplet', bassStyle: 'root', instrumentId: 'piano' },
  { id: 'pop-punk', name: 'Pop-Punk Lift', category: 'Pop', numerals: 'I V vi iii IV I IV V', mode: 'major', note: 'Eight-bar cycle with a melodic descending middle.', bpm: 150, patternId: 'strum-rock', bassStyle: 'pulse' },
  { id: 'royal-road', name: 'Royal Road', category: 'Pop', numerals: 'IVmaj7 V7 iii7 vi', mode: 'major', note: 'J-pop / anime staple: yearning, always moving.', bpm: 110, patternId: 'block-eighths', bassStyle: 'pulse', instrumentId: 'ep' },
  { id: 'pop-climb', name: 'Climb to the Chorus', category: 'Pop', numerals: 'IV V iii vi IV ii V7sus4 V7', mode: 'major', note: 'Pre-chorus build that leans hard into the dominant.', bpm: 104, patternId: 'strum-eighths', bassStyle: 'root' },

  // Rock
  { id: 'three-chord', name: 'Three-Chord Rock', category: 'Rock', numerals: 'I IV V IV', mode: 'major', note: 'I–IV–V: the foundation of rock’n’roll and folk.', bpm: 128, patternId: 'strum-rock', bassStyle: 'pulse' },
  { id: 'mixo-rock', name: 'Mixolydian Rock', category: 'Rock', numerals: 'I bVII IV I', mode: 'major', note: 'The ♭VII swagger of classic rock anthems.', bpm: 118, patternId: 'strum-chuck', bassStyle: 'rootFifth' },
  { id: 'power-minor', name: 'Power Minor', category: 'Rock', numerals: 'i5 bVI5 bVII5 i5', mode: 'minor', note: 'Power-chord riff vocabulary for heavier songs.', bpm: 140, patternId: 'strum-rock', bassStyle: 'pulse' },
  { id: 'grunge', name: 'Major III Twist', category: 'Rock', numerals: 'I III IV iv', mode: 'major', note: 'Chromatic major III and minor iv: bittersweet alt-rock.', bpm: 92, patternId: 'strum-folk', bassStyle: 'root' },

  // Ballad
  { id: 'canon', name: 'Pachelbel Canon', category: 'Ballad', numerals: 'I V vi iii IV I IV V', mode: 'major', note: 'Stepwise bass descent — wedding staple and ballad goldmine.', bpm: 72, patternId: 'arp-updown', bassStyle: 'root', instrumentId: 'piano' },
  { id: 'heart-ballad', name: 'Piano Ballad', category: 'Ballad', numerals: 'I I/3 IV iv', mode: 'major', note: 'First-inversion lift into a borrowed minor iv — instant tears.', bpm: 66, patternId: 'block-ballad', bassStyle: 'off', instrumentId: 'piano' },
  { id: 'descending', name: 'Descending Bass', category: 'Ballad', numerals: 'I V/3 vi I/5 IV I/3 ii V', mode: 'major', note: 'Slash chords walk the bass down a scale under steady harmony.', bpm: 70, patternId: 'block-ballad', bassStyle: 'off', instrumentId: 'piano' },
  { id: 'waltz', name: 'Country Waltz', category: 'Ballad', numerals: 'I IV I V I IV V I', mode: 'major', note: '3/4 time with an oom-pah-pah feel.', bpm: 104, patternId: 'block-waltz', bassStyle: 'off', meter: 3, instrumentId: 'piano' },

  // Jazz
  { id: 'two-five-one', name: 'ii–V–I', category: 'Jazz', numerals: 'ii7 V7 Imaj7 Imaj7', mode: 'major', note: 'The core cadence of jazz harmony.', bpm: 120, patternId: 'block-charleston', bassStyle: 'walking', swing: 0.6, instrumentId: 'ep' },
  { id: 'turnaround', name: 'Rhythm Turnaround', category: 'Jazz', numerals: 'Imaj7 vi7 ii7 V7', mode: 'major', note: 'I–vi–ii–V: loopable jazz turnaround ("rhythm changes").', bpm: 132, patternId: 'block-charleston', bassStyle: 'walking', swing: 0.6, instrumentId: 'ep' },
  { id: 'minor-251', name: 'Minor ii–V–i', category: 'Jazz', numerals: 'iiø7 V7 i7 i7', mode: 'minor', note: 'Half-diminished ii and dominant V into minor i.', bpm: 116, patternId: 'block-charleston', bassStyle: 'walking', swing: 0.55, instrumentId: 'ep' },
  { id: 'neo-soul', name: 'Neo-Soul Loop', category: 'Jazz', numerals: 'IVmaj9 iii7 ii9 Imaj9', mode: 'major', note: 'Lush descending extended chords.', bpm: 84, patternId: 'arp-spread', bassStyle: 'root', instrumentId: 'ep' },
  { id: 'secondary', name: 'Secondary Dominants', category: 'Jazz', numerals: 'I V7/vi vi V7/V V7 I', mode: 'major', note: 'Borrowed dominants that tonicise vi and V.', bpm: 100, patternId: 'block-quarters', bassStyle: 'walking', instrumentId: 'piano' },

  // Blues & Soul
  { id: 'twelve-bar', name: '12-Bar Blues', category: 'Blues & Soul', numerals: 'I7 IV7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', mode: 'major', note: 'Quick-change 12-bar with a V7 turnaround.', bpm: 96, patternId: 'strum-chuck', bassStyle: 'walking', swing: 0.65 },
  { id: 'minor-blues', name: 'Minor Blues', category: 'Blues & Soul', numerals: 'i7 i7 i7 i7 iv7 iv7 i7 i7 bVI7 V7 i7 V7', mode: 'minor', note: 'Moody 12-bar with the ♭VI7 → V7 approach.', bpm: 84, patternId: 'block-charleston', bassStyle: 'walking', swing: 0.6, instrumentId: 'organ' },
  { id: 'gospel', name: 'Gospel Plagal', category: 'Blues & Soul', numerals: 'I IV/5 I IV/5 I/5 V7 I I', mode: 'major', note: 'Plagal “amen” motion over a tonic pedal.', bpm: 72, patternId: 'arp-triplet', bassStyle: 'root', instrumentId: 'organ' },

  // Minor & Cinematic
  { id: 'epic', name: 'Epic Minor', category: 'Minor & Cinematic', numerals: 'i VI III VII', mode: 'minor', note: 'The trailer-music loop: i–♭VI–♭III–♭VII.', bpm: 84, patternId: 'block-sustain', bassStyle: 'root', instrumentId: 'pad' },
  { id: 'andalusian', name: 'Andalusian Cadence', category: 'Minor & Cinematic', numerals: 'i VII VI V', mode: 'minor', note: 'Flamenco descent ending on a major V.', bpm: 96, patternId: 'strum-sync16', bassStyle: 'root' },
  { id: 'minor-plagal', name: 'Sad Minor Loop', category: 'Minor & Cinematic', numerals: 'i iv VI V', mode: 'minor', note: 'Minor i–iv with a dramatic major V pull.', bpm: 80, patternId: 'arp-updown', bassStyle: 'root', instrumentId: 'piano' },
  { id: 'circle-minor', name: 'Circle of Fifths', category: 'Minor & Cinematic', numerals: 'i iv VII III VI iiø7 V7 i', mode: 'minor', note: 'Falling fifths through every diatonic chord.', bpm: 92, patternId: 'arp-alberti', bassStyle: 'root', instrumentId: 'piano' },
  { id: 'hero', name: 'Hero Rising', category: 'Minor & Cinematic', numerals: 'VI VII i i', mode: 'minor', note: '♭VI–♭VII–i: the triumphant “victory” cadence.', bpm: 88, patternId: 'block-half', bassStyle: 'root', instrumentId: 'pad' },

  // Modal
  { id: 'dorian-vamp', name: 'Dorian Vamp', category: 'Modal', numerals: 'i7 IV7', mode: 'dorian', note: 'The bright major IV gives Dorian its soulful lift.', bpm: 100, patternId: 'strum-chuck', bassStyle: 'octaves', instrumentId: 'ep' },
  { id: 'lydian-float', name: 'Lydian Float', category: 'Modal', numerals: 'Imaj7 II Imaj7 II', mode: 'lydian', note: 'Major II (♯4 colour) — the film-score shimmer.', bpm: 76, patternId: 'arp-sparkle', bassStyle: 'root', instrumentId: 'pad' },
  { id: 'phrygian', name: 'Phrygian Tension', category: 'Modal', numerals: 'i II i vii', mode: 'phrygian', note: 'The ♭II semitone pull: Spanish and metal flavour.', bpm: 110, patternId: 'strum-sync16', bassStyle: 'pulse' },
  { id: 'mixo-vamp', name: 'Mixolydian Vamp', category: 'Modal', numerals: 'I VII IV I', mode: 'mixolydian', note: 'Sunny and loose — jam-band and Britpop vibes.', bpm: 112, patternId: 'strum-folk', bassStyle: 'rootFifth' },

  // Classical
  { id: 'authentic', name: 'Perfect Cadence', category: 'Classical', numerals: 'I IV I/5 V7 I', mode: 'major', note: 'Cadential 6/4 resolving through V7 to I.', bpm: 84, patternId: 'arp-alberti', bassStyle: 'off', instrumentId: 'piano' },
  { id: 'lament', name: 'Lament Bass', category: 'Classical', numerals: 'i v/3 iv/3 V', mode: 'minor', note: 'Chromatic descending “lament” bass in minor.', bpm: 68, patternId: 'block-sustain', bassStyle: 'off', instrumentId: 'organ' },
  { id: 'harmonic-minor', name: 'Harmonic Minor', category: 'Classical', numerals: 'i iv V7 i', mode: 'harmonicMinor', note: 'Raised 7th makes a true dominant V7 in minor.', bpm: 80, patternId: 'arp-updown', bassStyle: 'off', instrumentId: 'piano' },
];

export const PRESET_CATEGORIES = Array.from(new Set(PRESETS.map((p) => p.category)));
