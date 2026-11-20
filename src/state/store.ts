/**
 * Tiny external store with undo/redo and localStorage persistence.
 * The current song is always an entry in the library (autosaved, like Notes).
 */
import { useSyncExternalStore } from 'react';
import type { InstrumentId } from '../audio/instruments';
import { PRESETS, type Preset } from '../music/presets';
import { adaptToMode, type ChordStep, fitToMode, makeChord, newId } from '../theory/chords';
import { parseProgression } from '../theory/parse';
import type { SpelledNote } from '../theory/notes';
import type { ModeId } from '../theory/scales';
import type { Settings, SheetId, Song, Toast } from './types';

export interface TransportView {
  playing: boolean;
  chordIndex: number;
  beat: number;
  countIn: number;
  loop: number;
}

export interface AppState {
  song: Song;
  library: Song[];
  settings: Settings;
  selected: number | null;
  sheet: SheetId | null;
  toast: Toast | null;
  transport: TransportView;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumped on every song/settings change (the scheduler watches it). */
  version: number;
}

const STORAGE_SONGS = 'cp.library.v1';
const STORAGE_CURRENT = 'cp.current.v1';
const STORAGE_SETTINGS = 'cp.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  labels: 'both',
  voiceLeading: true,
  register: 0,
  humanize: true,
  countIn: false,
  metronome: false,
  loop: true,
  adaptOnModeChange: true,
  applyPresetStyle: true,
  showScale: true,
  colorByFunction: true,
  keepAwake: true,
  visual: 'keys',
  volumes: { master: 0.85, chords: 0.8, bass: 0.7, drums: 0.55, click: 0.6 },
  reverb: 0.25,
  trainer: { enabled: false, step: 5, every: 2, target: 140 },
};

export function songFromPreset(preset: Preset, base: Partial<Song> = {}): Song {
  const now = Date.now();
  const tonic = base.tonic ?? { letter: 0, acc: 0 };
  const meter = preset.meter ?? 4;
  const chords = parseProgression(preset.numerals, { tonic, mode: preset.mode }, meter).chords;
  return {
    id: newId(),
    name: preset.name,
    tonic,
    mode: preset.mode,
    meter,
    bpm: preset.bpm,
    chords,
    patternId: preset.patternId,
    instrumentId: (preset.instrumentId as InstrumentId) ?? 'guitar',
    bassStyle: preset.bassStyle,
    drumStyle: 'off',
    swing: preset.swing ?? 0,
    loopRange: null,
    createdAt: now,
    updatedAt: now,
    ...base,
  };
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — keep working in memory */
  }
}

function isValidSong(s: unknown): s is Song {
  const x = s as Song;
  return !!x && typeof x.id === 'string' && Array.isArray(x.chords) && typeof x.bpm === 'number' && !!x.tonic;
}

function initialState(): AppState {
  const settings = { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(STORAGE_SETTINGS, {}) };
  settings.volumes = { ...DEFAULT_SETTINGS.volumes, ...settings.volumes };
  settings.trainer = { ...DEFAULT_SETTINGS.trainer, ...settings.trainer };
  let library = load<Song[]>(STORAGE_SONGS, []).filter(isValidSong);
  const currentId = load<string | null>(STORAGE_CURRENT, null);
  let song = library.find((s) => s.id === currentId) ?? library[0];
  if (!song) {
    song = songFromPreset(PRESETS[0], { name: 'My First Progression' });
    library = [song];
  }
  return {
    song: normalizeSong(song),
    library,
    settings,
    selected: null,
    sheet: null,
    toast: null,
    transport: { playing: false, chordIndex: -1, beat: 0, countIn: 0, loop: 0 },
    canUndo: false,
    canRedo: false,
    version: 0,
  };
}

/** Fill in fields added in later versions. */
function normalizeSong(s: Song): Song {
  return {
    ...s,
    drumStyle: s.drumStyle ?? 'off',
    swing: s.swing ?? 0,
    loopRange: s.loopRange ?? null,
    meter: s.meter ?? 4,
  };
}

// ---------------------------------------------------------------------------

type Listener = () => void;

class Store {
  state: AppState = initialState();
  private listeners = new Set<Listener>();
  private past: Song[] = [];
  private future: Song[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private toastId = 0;
  /** Coalesce rapid edits (e.g. slider drags) into one undo step. */
  private lastCoalesce: { key: string; at: number } | null = null;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;

  private set(partial: Partial<AppState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l());
  }

  // --- song editing -------------------------------------------------------

  /**
   * Apply a change to the current song. `coalesce` merges consecutive edits
   * with the same key (within 1.5 s) into one undo step.
   */
  updateSong(fn: (s: Song) => Song, opts: { history?: boolean; coalesce?: string } = {}) {
    const prev = this.state.song;
    const next = { ...fn(prev), updatedAt: Date.now() };
    const history = opts.history ?? true;
    if (history) {
      const now = Date.now();
      const merge = opts.coalesce && this.lastCoalesce?.key === opts.coalesce && now - this.lastCoalesce.at < 1500;
      if (!merge) {
        this.past.push(prev);
        if (this.past.length > 100) this.past.shift();
      }
      this.lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
      this.future = [];
    }
    const selected = this.state.selected !== null && this.state.selected >= next.chords.length ? (next.chords.length ? next.chords.length - 1 : null) : this.state.selected;
    this.set({
      song: next,
      library: upsert(this.state.library, next),
      selected,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      version: this.state.version + 1,
    });
    this.scheduleSave();
  }

  undo = () => {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state.song);
    this.lastCoalesce = null;
    this.restore(prev);
  };

  redo = () => {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state.song);
    this.lastCoalesce = null;
    this.restore(next);
  };

  private restore(song: Song) {
    const selected = this.state.selected !== null && this.state.selected >= song.chords.length ? null : this.state.selected;
    this.set({
      song,
      library: upsert(this.state.library, song),
      selected,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      version: this.state.version + 1,
    });
    this.scheduleSave();
  }

  setChords(chords: ChordStep[], coalesce?: string) {
    this.updateSong((s) => ({ ...s, chords }), { coalesce });
  }

  insertChord(chord: ChordStep, at?: number) {
    const chords = [...this.state.song.chords];
    const idx = at ?? chords.length;
    chords.splice(idx, 0, chord);
    this.setChords(chords);
    return idx;
  }

  replaceChord(index: number, patch: Partial<ChordStep>, coalesce?: string) {
    const chords = this.state.song.chords.map((c, i) => (i === index ? { ...c, ...patch } : c));
    this.setChords(chords, coalesce);
  }

  removeChord(index: number) {
    const removed = this.state.song.chords[index];
    if (!removed) return;
    this.updateSong((s) => {
      const chords = s.chords.filter((_, i) => i !== index);
      let loopRange = s.loopRange;
      if (loopRange && (loopRange.startId === removed.id || loopRange.endId === removed.id)) loopRange = null;
      return { ...s, chords, loopRange };
    });
  }

  duplicateChord(index: number) {
    const c = this.state.song.chords[index];
    if (!c) return;
    this.insertChord({ ...c, id: newId() }, index + 1);
  }

  moveChord(from: number, to: number) {
    const chords = [...this.state.song.chords];
    if (from === to || from < 0 || from >= chords.length) return;
    const [c] = chords.splice(from, 1);
    chords.splice(Math.max(0, Math.min(chords.length, to)), 0, c);
    this.setChords(chords);
    if (this.state.selected === from) this.set({ selected: Math.max(0, Math.min(chords.length - 1, to)) });
  }

  setKey(tonic: SpelledNote, mode: ModeId) {
    const s = this.state.song;
    const adapt = this.state.settings.adaptOnModeChange && mode !== s.mode;
    this.updateSong((song) => ({
      ...song,
      tonic,
      mode,
      chords: adapt ? adaptToMode(song.chords, song.mode, mode) : song.chords,
    }));
  }

  /** Re-harmonise every chord in the current mode (keeping sizes). */
  fitToMode() {
    const s = this.state.song;
    this.setChords(fitToMode(s.chords, s.mode));
  }

  setTempo(bpm: number, history = false) {
    const clamped = Math.round(Math.min(260, Math.max(30, bpm)));
    if (clamped === this.state.song.bpm) return;
    this.updateSong((s) => ({ ...s, bpm: clamped }), { history, coalesce: 'tempo' });
  }

  /** Change time signature; chords lasting whole bars keep lasting whole bars. */
  setMeter(meter: 3 | 4) {
    const old = this.state.song.meter;
    if (meter === old) return;
    this.updateSong((s) => ({
      ...s,
      meter,
      chords: s.chords.map((c) => (c.beats % old === 0 ? { ...c, beats: (c.beats / old) * meter } : c)),
      drumStyle: meter === 3 && s.drumStyle !== 'off' ? 'waltz' : meter === 4 && s.drumStyle === 'waltz' ? 'ballad' : s.drumStyle,
    }));
  }

  patchSong(patch: Partial<Song>, coalesce?: string) {
    this.updateSong((s) => ({ ...s, ...patch }), { coalesce });
  }

  setLoopRange(startIndex: number | null, endIndex?: number) {
    const chords = this.state.song.chords;
    if (startIndex === null) {
      this.patchSong({ loopRange: null });
      return;
    }
    const a = chords[startIndex];
    const b = chords[endIndex ?? startIndex];
    if (!a || !b) return;
    this.patchSong({ loopRange: { startId: a.id, endId: b.id } });
  }

  loadPreset(preset: Preset) {
    const s = this.state.song;
    const applyStyle = this.state.settings.applyPresetStyle;
    const tonic = s.tonic;
    const meter = preset.meter ?? 4;
    const chords = parseProgression(preset.numerals, { tonic, mode: preset.mode }, meter).chords;
    this.updateSong((song) => ({
      ...song,
      chords,
      mode: preset.mode,
      meter,
      loopRange: null,
      ...(applyStyle
        ? {
            bpm: preset.bpm,
            patternId: preset.patternId,
            bassStyle: preset.bassStyle,
            swing: preset.swing ?? 0,
            instrumentId: (preset.instrumentId as InstrumentId) ?? song.instrumentId,
            drumStyle: meter === 3 && song.drumStyle !== 'off' ? 'waltz' : meter === 4 && song.drumStyle === 'waltz' ? 'ballad' : song.drumStyle,
          }
        : {}),
    }));
    this.set({ selected: null });
  }

  /** Replace the progression with generated chords (undoable). */
  loadGenerated(chords: ChordStep[], mode: ModeId) {
    this.updateSong((song) => ({ ...song, chords, mode, loopRange: null }));
    this.set({ selected: null });
  }

  // --- library ------------------------------------------------------------

  openSong(id: string) {
    const song = this.state.library.find((s) => s.id === id);
    if (!song) return;
    this.past = [];
    this.future = [];
    this.set({ song: normalizeSong(song), selected: null, canUndo: false, canRedo: false, version: this.state.version + 1 });
    this.scheduleSave();
  }

  newSong(fromPreset?: Preset) {
    const base = this.state.song;
    const song = fromPreset
      ? songFromPreset(fromPreset, { tonic: base.tonic, instrumentId: base.instrumentId })
      : {
          ...songFromPreset(PRESETS[0], { tonic: base.tonic }),
          name: 'Untitled',
          chords: [makeChord(0, 'maj', base.meter), makeChord(5, 'maj', base.meter), makeChord(7, 'maj', base.meter), makeChord(0, 'maj', base.meter)],
          mode: 'major' as ModeId,
          patternId: base.patternId,
          instrumentId: base.instrumentId,
          bpm: base.bpm,
          meter: base.meter,
        };
    this.past = [];
    this.future = [];
    this.set({
      song,
      library: [song, ...this.state.library],
      selected: null,
      canUndo: false,
      canRedo: false,
      version: this.state.version + 1,
    });
    this.scheduleSave();
  }

  duplicateSong(id: string) {
    const src = this.state.library.find((s) => s.id === id);
    if (!src) return;
    const now = Date.now();
    const copy: Song = { ...src, id: newId(), name: `${src.name} (copy)`, createdAt: now, updatedAt: now, chords: src.chords.map((c) => ({ ...c, id: newId() })), loopRange: null };
    const idx = this.state.library.findIndex((s) => s.id === id);
    const library = [...this.state.library];
    library.splice(idx + 1, 0, copy);
    this.set({ library });
    this.scheduleSave();
  }

  deleteSong(id: string) {
    const library = this.state.library.filter((s) => s.id !== id);
    if (library.length === 0) {
      const fresh = songFromPreset(PRESETS[0], { name: 'My First Progression' });
      library.push(fresh);
    }
    const patch: Partial<AppState> = { library };
    if (this.state.song.id === id) {
      patch.song = normalizeSong(library[0]);
      patch.selected = null;
      patch.version = this.state.version + 1;
      this.past = [];
      this.future = [];
      patch.canUndo = false;
      patch.canRedo = false;
    }
    this.set(patch);
    this.scheduleSave();
  }

  renameSong(id: string, name: string) {
    const trimmed = name.trim() || 'Untitled';
    if (id === this.state.song.id) {
      this.updateSong((s) => ({ ...s, name: trimmed }), { history: false });
    } else {
      this.set({ library: this.state.library.map((s) => (s.id === id ? { ...s, name: trimmed, updatedAt: Date.now() } : s)) });
      this.scheduleSave();
    }
  }

  importSong(song: Song) {
    const now = Date.now();
    const s = normalizeSong({ ...song, id: newId(), createdAt: now, updatedAt: now });
    this.past = [];
    this.future = [];
    this.set({ song: s, library: [s, ...this.state.library], selected: null, canUndo: false, canRedo: false, version: this.state.version + 1 });
    this.scheduleSave();
  }

  // --- settings & UI ----------------------------------------------------------

  setSettings(patch: Partial<Settings>) {
    this.set({ settings: { ...this.state.settings, ...patch }, version: this.state.version + 1 });
    save(STORAGE_SETTINGS, this.state.settings);
  }

  select(index: number | null) {
    this.set({ selected: index });
  }

  openSheet(sheet: SheetId | null) {
    this.set({ sheet });
  }

  setTransport(t: Partial<TransportView>) {
    const cur = this.state.transport;
    const next = { ...cur, ...t };
    if (next.playing === cur.playing && next.chordIndex === cur.chordIndex && next.beat === cur.beat && next.countIn === cur.countIn && next.loop === cur.loop) return;
    this.set({ transport: next });
  }

  toast(message: string, action?: Toast['action']) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    const id = ++this.toastId;
    this.set({ toast: { id, message, action } });
    this.toastTimer = setTimeout(() => {
      if (this.state.toast?.id === id) this.set({ toast: null });
    }, action ? 4500 : 2200);
  }

  dismissToast() {
    this.set({ toast: null });
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    save(STORAGE_SONGS, this.state.library);
    save(STORAGE_CURRENT, this.state.song.id);
  }
}

function upsert(list: Song[], song: Song): Song[] {
  const i = list.findIndex((s) => s.id === song.id);
  if (i < 0) return [song, ...list];
  const copy = [...list];
  copy[i] = song;
  return copy;
}

export const store = new Store();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flush();
  });
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.state), () => selector(store.state));
}
