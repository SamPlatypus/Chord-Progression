import { useState } from 'react';
import { auditionChord } from '../audio/playback';
import { store, useStore } from '../state/store';
import { analyzeChord, chordName, diatonicChords, makeChord, numeral, type QualityId } from '../theory/chords';
import { keyName } from '../theory/scales';
import { borrowedPalette } from '../theory/suggest';
import { fnClass, Segmented, songKey } from './common';

export function addChordFromPalette(root: number, quality: QualityId) {
  const { song, selected } = store.state;
  const chord = makeChord(root, quality, song.meter);
  const at = selected !== null ? selected + 1 : song.chords.length;
  store.insertChord(chord, at);
  store.select(at);
  auditionChord(chord);
  store.toast(`Added ${chordName(chord, songKey(song))}`, { label: 'Undo', run: store.undo });
}

export function usePaletteSevenths() {
  return useState<boolean>(() => {
    try {
      return localStorage.getItem('cp.palette7') === '1';
    } catch {
      return false;
    }
  });
}

export function ChordPalette({ compact = false }: { compact?: boolean }) {
  const song = useStore((s) => s.song);
  const colorByFunction = useStore((s) => s.settings.colorByFunction);
  const selected = useStore((s) => s.selected);
  const [sevenths, setSevenths] = usePaletteSevenths();
  const key = songKey(song);
  const diatonic = diatonicChords(song.mode, sevenths);
  const borrowed = borrowedPalette(song.mode, sevenths);

  const setSev = (v: boolean) => {
    setSevenths(v);
    try {
      localStorage.setItem('cp.palette7', v ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const chip = (root: number, quality: QualityId, k: string) => {
    const c = makeChord(root, quality);
    const a = analyzeChord(c, key, null);
    return (
      <button
        key={k}
        className={`pc ${fnClass(a.fn, colorByFunction)}`}
        onClick={() => addChordFromPalette(root, quality)}
        aria-label={`Add ${a.name} (${numeral(c, song.mode)})`}
      >
        <span className="n numeral">{numeral(c, song.mode)}</span>
        <span className={`c ${a.name.length > 3 ? 'long' : ''}`}>{a.name}</span>
      </button>
    );
  };

  return (
    <section className={compact ? '' : 'card'} aria-label="Chord palette">
      <div className="section-head">
        <h2>
          Add chord<span className="meta">{keyName(key)}{selected !== null ? ` · after #${selected + 1}` : ''}</span>
        </h2>
        <Segmented
          label="Chord size"
          value={sevenths ? '7' : '3'}
          onChange={(v) => setSev(v === '7')}
          options={[
            { value: '3', label: 'Triads' },
            { value: '7', label: '7ths' },
          ]}
        />
      </div>
      <div className={`palette ${sevenths ? 'wide' : ''}`}>{diatonic.map((d) => chip(d.root, d.quality, `d${d.degree}`))}</div>
      {borrowed.length > 0 && (
        <>
          <div className="sub-label">Borrowed & chromatic</div>
          <div className="palette scroll">{borrowed.map((b, i) => chip(b.root, b.quality, `b${i}`))}</div>
        </>
      )}
    </section>
  );
}
