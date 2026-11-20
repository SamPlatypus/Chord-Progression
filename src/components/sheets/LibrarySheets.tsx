import { useMemo, useState } from 'react';
import { PRESET_CATEGORIES, PRESETS, type Preset } from '../../music/presets';
import { store, useStore } from '../../state/store';
import type { Song } from '../../state/types';
import { analyzeChord, chordName } from '../../theory/chords';
import { parseProgression } from '../../theory/parse';
import { getMode, keyName } from '../../theory/scales';
import { ChordPalette } from '../Palette';
import { fnClass, relativeTime, Sheet, songKey, ToggleRow } from '../common';
import { Icon } from '../Icon';

// ---------------------------------------------------------------------------
// Add chord

export function AddSheet() {
  return (
    <Sheet title="Add chords">
      <ChordPalette compact />
      <p className="hint">Tap chords to add them in order — each one plays as you add it. Chords are added after the selected chord.</p>
      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => store.openSheet('text')}>
          <Icon name="text" /> Type a progression
        </button>
        <button className="btn" onClick={() => store.openSheet('presets')}>
          <Icon name="sparkles" /> Browse presets
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Presets

function signature(song: Pick<Song, 'chords'>) {
  return song.chords.map((c) => `${c.root}.${c.quality}.${c.bass}.${c.beats}`).join('|');
}

export function PresetsSheet() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const [cat, setCat] = useState<string>('All');
  const key = songKey(song);
  const current = signature(song);

  const rows = useMemo(
    () =>
      PRESETS.filter((p) => cat === 'All' || p.category === cat).map((p) => {
        const pkey = { tonic: song.tonic, mode: p.mode };
        const chords = parseProgression(p.numerals, pkey, p.meter ?? 4).chords;
        const analyses = chords.map((c, i) => analyzeChord(c, pkey, chords[i + 1] ?? chords[0]));
        return { p, chords, analyses, loaded: signature({ chords }) === current && song.mode === p.mode };
      }),
    [cat, song.tonic, song.mode, current],
  );

  const load = (p: Preset) => {
    store.loadPreset(p);
    store.toast(`Loaded “${p.name}”`, { label: 'Undo', run: store.undo });
  };

  return (
    <Sheet title="Progression presets">
      <div className="chips" style={{ marginBottom: 10 }}>
        {['All', ...PRESET_CATEGORIES].map((c) => (
          <button key={c} className={`chip ${cat === c ? 'accent' : ''}`} onClick={() => setCat(c)} aria-pressed={cat === c}>
            {c}
          </button>
        ))}
      </div>
      <ToggleRow
        title="Use the preset’s tempo & sound"
        desc="Off keeps your current tempo, pattern and instrument"
        on={settings.applyPresetStyle}
        onChange={(v) => store.setSettings({ applyPresetStyle: v })}
      />
      <div className="row-list" style={{ marginTop: 10 }}>
        {rows.map(({ p, analyses, loaded }) => (
          <div key={p.id} className={`row-item ${loaded ? 'on' : ''}`} style={{ alignItems: 'flex-start' }}>
            <button className="grow" style={{ textAlign: 'left' }} onClick={() => load(p)} aria-label={`Load ${p.name}`}>
              <div className="title">
                {p.name}
                {p.mode !== 'major' && <span className="badge">{getMode(p.mode).name}</span>}
                {loaded && <span className="badge">Loaded</span>}
              </div>
              <div className="preset-numerals numeral">
                {analyses.map((a, i) => (
                  <span key={i} className={fnClass(a.fn, settings.colorByFunction)}>
                    {a.numeral}
                  </span>
                ))}
              </div>
              <div className="preset-chords">
                {analyses.map((a) => a.name).join(' – ')} <span style={{ color: 'var(--text-3)' }}>in {keyName({ tonic: key.tonic, mode: p.mode })}</span>
              </div>
              <div className="desc">{p.note}</div>
            </button>
            <button
              className="mini-btn"
              onClick={() => {
                store.newSong(p);
                store.toast(`New progression: ${p.name}`);
              }}
              title="Start a new progression from this preset"
            >
              <Icon name="plus" /> New
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Library

export function LibrarySheet() {
  const library = useStore((s) => s.library);
  const currentId = useStore((s) => s.song.id);
  const [open, setOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = [...library].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Sheet title="My progressions">
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button
          className="btn primary"
          onClick={() => {
            store.newSong();
            store.openSheet(null);
            store.toast('New progression created');
          }}
        >
          <Icon name="plus" /> New progression
        </button>
        <button className="btn" onClick={() => store.openSheet('presets')}>
          <Icon name="sparkles" /> From preset
        </button>
      </div>
      <div className="row-list">
        {sorted.map((s) => {
          const key = songKey(s);
          const names = s.chords.slice(0, 8).map((c) => chordName(c, key));
          return (
            <div key={s.id} className={`row-item ${s.id === currentId ? 'on' : ''}`} style={{ display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {renaming === s.id ? (
                  <form
                    className="grow"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = new FormData(e.currentTarget).get('name');
                      store.renameSong(s.id, String(v ?? ''));
                      setRenaming(null);
                    }}
                  >
                    <input className="text-field" name="name" defaultValue={s.name} autoFocus onBlur={(e) => { store.renameSong(s.id, e.target.value); setRenaming(null); }} aria-label="Progression name" />
                  </form>
                ) : (
                  <button
                    className="grow"
                    style={{ textAlign: 'left' }}
                    onClick={() => {
                      store.openSong(s.id);
                      store.openSheet(null);
                    }}
                  >
                    <div className="title">
                      {s.name}
                      {s.id === currentId && <span className="badge">Open</span>}
                    </div>
                    <div className="desc">
                      {keyName(key)} · {s.bpm} BPM · {s.chords.length} chords · {relativeTime(s.updatedAt)}
                    </div>
                    <div className="lib-chords">{names.join('  ') + (s.chords.length > 8 ? '  …' : '')}</div>
                  </button>
                )}
                <button className="icon-btn" onClick={() => setOpen(open === s.id ? null : s.id)} aria-label={`Actions for ${s.name}`} aria-expanded={open === s.id}>
                  <Icon name="more" />
                </button>
              </div>
              {open === s.id && (
                <div className="lib-actions">
                  <button className="mini-btn" onClick={() => setRenaming(s.id)}>
                    <Icon name="edit" /> Rename
                  </button>
                  <button className="mini-btn" onClick={() => store.duplicateSong(s.id)}>
                    <Icon name="copy" /> Duplicate
                  </button>
                  <button
                    className="mini-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => {
                      if (confirmDelete === s.id) {
                        store.deleteSong(s.id);
                        setConfirmDelete(null);
                        setOpen(null);
                        store.toast(`Deleted “${s.name}”`);
                      } else setConfirmDelete(s.id);
                    }}
                  >
                    <Icon name="trash" /> {confirmDelete === s.id ? 'Tap to confirm' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">Progressions save automatically on this device and work fully offline.</p>
    </Sheet>
  );
}

export function RenameSheet() {
  const song = useStore((s) => s.song);
  return (
    <Sheet title="Rename progression" cover>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          store.renameSong(song.id, String(new FormData(e.currentTarget).get('name') ?? ''));
          store.openSheet(null);
        }}
      >
        <input className="text-field" name="name" defaultValue={song.name} autoFocus maxLength={60} aria-label="Progression name" onFocus={(e) => e.target.select()} />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn" onClick={() => store.openSheet(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}
