import { useEffect, useState } from 'react';
import { addChordFromPalette, ChordPalette } from './components/Palette';
import { Header, ControlChips } from './components/Header';
import { Icon } from './components/Icon';
import { NowPlaying } from './components/NowPlaying';
import { ProgressionGrid } from './components/ProgressionGrid';
import { TransportBar } from './components/TransportBar';
import { ChordSheet } from './components/sheets/ChordSheet';
import { KeySheet } from './components/sheets/KeySheet';
import { AddSheet, LibrarySheet, PresetsSheet, RenameSheet } from './components/sheets/LibrarySheets';
import { HelpSheet, SettingsSheet } from './components/sheets/SettingsSheet';
import { SoundSheet } from './components/sheets/SoundSheet';
import { TempoSheet } from './components/sheets/TempoSheet';
import { TextSheet } from './components/sheets/TextSheet';
import { auditionIndex, stop, togglePlay } from './audio/playback';
import { consumeShareHash } from './state/share';
import { store, useStore } from './state/store';
import { diatonicChords } from './theory/chords';
import { onUpdateReady } from './sw-register';

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f3f4f7' : '#0b0c10');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const { song, selected, sheet, settings } = store.state;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === ' ') {
        // Let focused buttons/cards handle Space themselves.
        if (t.closest('button, [role="listitem"], [role="switch"]')) return;
        e.preventDefault();
        togglePlay();
        return;
      }
      if (sheet && sheet !== 'tempo' && sheet !== 'sound') return;
      const n = song.chords.length;
      switch (e.key) {
        case 'l':
        case 'L':
          store.setSettings({ loop: !settings.loop });
          break;
        case 'm':
        case 'M':
          store.setSettings({ metronome: !settings.metronome });
          break;
        case 'ArrowRight':
          if (!n) break;
          e.preventDefault();
          store.select(selected === null ? 0 : (selected + 1) % n);
          auditionIndex(store.state.selected ?? 0);
          break;
        case 'ArrowLeft':
          if (!n) break;
          e.preventDefault();
          store.select(selected === null ? n - 1 : (selected - 1 + n) % n);
          auditionIndex(store.state.selected ?? 0);
          break;
        case 'ArrowUp':
          e.preventDefault();
          store.setTempo(song.bpm + (e.shiftKey ? 5 : 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          store.setTempo(song.bpm - (e.shiftKey ? 5 : 1));
          break;
        case 'Enter':
          if (selected !== null) store.openSheet('chord');
          break;
        case 'Escape':
          store.select(null);
          break;
        case 'Delete':
        case 'Backspace':
          if (selected !== null) {
            store.removeChord(selected);
            store.toast('Chord deleted', { label: 'Undo', run: store.undo });
          }
          break;
        default:
          if (/^[1-7]$/.test(e.key)) {
            const d = diatonicChords(song.mode, false)[Number(e.key) - 1];
            addChordFromPalette(d.root, d.quality);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function MoreMenu() {
  const [open, setOpen] = useState(false);
  const hasRange = useStore((s) => !!s.song.loopRange);
  const n = useStore((s) => s.song.chords.length);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const item = (label: string, icon: string, run: () => void, disabled = false) => (
    <button
      className="row-item"
      style={{ padding: '10px 12px', background: 'transparent' }}
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      <Icon name={icon} />
      <span className="grow">{label}</span>
    </button>
  );
  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" onClick={() => setOpen(!open)} aria-label="More progression actions" aria-expanded={open} onPointerDown={(e) => e.stopPropagation()}>
        <Icon name="more" />
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 42, zIndex: 30, width: 240, padding: 6, boxShadow: 'var(--shadow)' }} onPointerDown={(e) => e.stopPropagation()}>
          {item('Fit all chords to the scale', 'wand', () => {
            store.fitToMode();
            store.toast('Chords fitted to the scale', { label: 'Undo', run: store.undo });
          }, !n)}
          {item('Double the progression', 'copy', () => {
            const chords = store.state.song.chords;
            store.setChords([...chords, ...chords.map((c) => ({ ...c, id: `${c.id}x${Math.random().toString(36).slice(2, 6)}` }))]);
          }, !n)}
          {item('Clear loop section', 'loop', () => store.setLoopRange(null), !hasRange)}
          {item('Clear all chords', 'trash', () => {
            stop();
            store.setChords([]);
            store.select(null);
            store.toast('Progression cleared', { label: 'Undo', run: store.undo });
          }, !n)}
        </div>
      )}
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run();
            store.dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function UpdateBanner() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => onUpdateReady((fn) => setApply(() => fn)), []);
  if (!apply) return null;
  return (
    <div className="update-banner" role="status">
      New version available
      <button className="mini-btn" onClick={apply}>
        Update
      </button>
    </div>
  );
}

const SHEETS = {
  key: KeySheet,
  tempo: TempoSheet,
  sound: SoundSheet,
  chord: ChordSheet,
  add: AddSheet,
  presets: PresetsSheet,
  library: LibrarySheet,
  text: TextSheet,
  settings: SettingsSheet,
  rename: RenameSheet,
  help: HelpSheet,
} as const;

export function App() {
  useTheme();
  useShortcuts();
  const sheet = useStore((s) => s.sheet);
  const count = useStore((s) => s.song.chords.length);
  const colorByFunction = useStore((s) => s.settings.colorByFunction);
  const SheetView = sheet ? SHEETS[sheet] : null;

  useEffect(() => {
    const shared = consumeShareHash();
    if (shared) {
      store.importSong(shared);
      store.toast(`Imported “${shared.name}”`);
    }
  }, []);

  return (
    <>
      <div className="app">
        <Header />
        <ControlChips />
        <main className="main" style={{ marginTop: 10 }}>
          <div className="area-now">
            <NowPlaying />
          </div>
          <section className="card area-prog" aria-label="Progression">
            <div className="section-head">
              <h2>Progression</h2>
              <button className="mini-btn" onClick={() => store.openSheet('presets')}>
                <Icon name="sparkles" /> Presets
              </button>
              <button className="mini-btn" onClick={() => store.openSheet('text')} aria-label="Type or share">
                <Icon name="text" />
              </button>
              <MoreMenu />
            </div>
            <ProgressionGrid />
            {count === 0 && (
              <div className="empty">
                Empty progression. Tap chords below, load a preset, or type one in.
                <div className="btn-row" style={{ justifyContent: 'center', marginTop: 12 }}>
                  <button className="btn primary" onClick={() => store.openSheet('presets')}>
                    <Icon name="sparkles" /> Browse presets
                  </button>
                </div>
              </div>
            )}
            {count > 0 && <p className="hint grid-hint">Tap to hear · tap again to edit · hold &amp; drag to reorder</p>}
            {colorByFunction && count > 0 && (
              <div className="legend" aria-hidden>
                <span className="fn-tonic">
                  <i /> Tonic
                </span>
                <span className="fn-predominant">
                  <i /> Predominant
                </span>
                <span className="fn-dominant">
                  <i /> Dominant
                </span>
                <span className="fn-chromatic">
                  <i /> Borrowed / chromatic
                </span>
              </div>
            )}
          </section>
          <div className="area-palette">
            <ChordPalette />
          </div>
        </main>
      </div>
      <TransportBar />
      {SheetView && <SheetView />}
      <Toast />
      <UpdateBanner />
    </>
  );
}

