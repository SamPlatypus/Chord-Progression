import type { InstrumentId } from '../audio/instruments';
import type { DrumStyleId } from '../music/drums';
import type { BassStyle } from '../music/patterns';
import type { ChordStep } from '../theory/chords';
import type { SpelledNote } from '../theory/notes';
import type { ModeId } from '../theory/scales';

export interface LoopRange {
  /** Chord ids so the range survives inserts and reorders. */
  startId: string;
  endId: string;
}

export interface Song {
  id: string;
  name: string;
  tonic: SpelledNote;
  mode: ModeId;
  meter: 3 | 4;
  bpm: number;
  chords: ChordStep[];
  patternId: string;
  instrumentId: InstrumentId;
  bassStyle: BassStyle;
  drumStyle: DrumStyleId;
  /** 0 = straight, 1 = full triplet swing. */
  swing: number;
  loopRange: LoopRange | null;
  createdAt: number;
  updatedAt: number;
}

export interface TempoTrainer {
  enabled: boolean;
  /** BPM added each time. */
  step: number;
  /** Loops between increases. */
  every: number;
  /** Stop increasing at this tempo. */
  target: number;
}

export type LabelMode = 'both' | 'names' | 'numerals';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemeMode;
  labels: LabelMode;
  voiceLeading: boolean;
  /** Upper-voicing register: -1 low, 0 mid, 1 high. */
  register: number;
  humanize: boolean;
  countIn: boolean;
  metronome: boolean;
  loop: boolean;
  adaptOnModeChange: boolean;
  applyPresetStyle: boolean;
  showScale: boolean;
  colorByFunction: boolean;
  keepAwake: boolean;
  volumes: { master: number; chords: number; bass: number; drums: number; click: number };
  reverb: number;
  trainer: TempoTrainer;
}

export type SheetId =
  | 'key'
  | 'tempo'
  | 'sound'
  | 'chord'
  | 'add'
  | 'presets'
  | 'library'
  | 'text'
  | 'settings'
  | 'rename'
  | 'help';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}
