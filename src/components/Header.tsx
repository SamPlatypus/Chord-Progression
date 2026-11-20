import { store, useStore } from '../state/store';
import { totalBeats } from '../theory/chords';
import { keyName } from '../theory/scales';
import { getInstrument } from '../audio/instruments';
import { getPattern } from '../music/patterns';
import { songKey } from './common';
import { Icon } from './Icon';

export function Header() {
  const song = useStore((s) => s.song);
  const canUndo = useStore((s) => s.canUndo);
  const canRedo = useStore((s) => s.canRedo);
  const bars = totalBeats(song.chords) / song.meter;

  return (
    <header className="header">
      <button className="icon-btn" onClick={() => store.openSheet('library')} aria-label="My progressions">
        <Icon name="library" />
      </button>
      <button className="header-title" onClick={() => store.openSheet('rename')} aria-label={`Rename ${song.name}`}>
        <span className="t">{song.name}</span>
        <span className="s">
          {song.chords.length} chords · {Number.isInteger(bars) ? bars : bars.toFixed(1)} bars
        </span>
      </button>
      <button className="icon-btn" onClick={store.undo} disabled={!canUndo} aria-label="Undo">
        <Icon name="undo" />
      </button>
      <button className="icon-btn" onClick={store.redo} disabled={!canRedo} aria-label="Redo">
        <Icon name="redo" />
      </button>
      <button className="icon-btn" onClick={() => store.openSheet('settings')} aria-label="Settings">
        <Icon name="settings" />
      </button>
    </header>
  );
}

export function ControlChips() {
  const song = useStore((s) => s.song);
  const pattern = getPattern(song.patternId);
  const inst = getInstrument(song.instrumentId);
  return (
    <div className="chips" role="toolbar" aria-label="Song settings">
      <button className="chip accent" onClick={() => store.openSheet('key')}>
        <span className="lbl">Key</span>
        {keyName(songKey(song))}
        <Icon name="chevronDown" />
      </button>
      <button className="chip" onClick={() => store.openSheet('tempo')}>
        <span className="num">{song.bpm}</span>
        <span className="lbl">bpm</span>
        <span className="lbl">·</span>
        {song.meter}/4
        {song.swing > 0 && <span className="lbl">· swing</span>}
      </button>
      <button className="chip" onClick={() => store.openSheet('sound')}>
        <span className="lbl">{pattern.kind === 'arp' ? 'Arp' : pattern.kind === 'strum' ? 'Strum' : 'Block'}</span>
        {pattern.name}
      </button>
      <button className="chip" onClick={() => store.openSheet('sound')}>
        {inst.name}
      </button>
    </div>
  );
}
