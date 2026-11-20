import { store, useStore } from '../../state/store';
import { noteName, pcOf } from '../../theory/notes';
import { defaultTonic, enharmonicTonic, getMode, type Key, keyName, MODES, type ModeId, scaleNotes } from '../../theory/scales';
import { capoOptions } from '../../theory/suggest';
import { Sheet, ToggleRow } from '../common';
import { Icon } from '../Icon';

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS: { pc: number; boundary: number }[] = [
  { pc: 1, boundary: 1 },
  { pc: 3, boundary: 2 },
  { pc: 6, boundary: 4 },
  { pc: 8, boundary: 5 },
  { pc: 10, boundary: 6 },
];

function stepPattern(steps: readonly number[]): string {
  const all = [...steps, 12];
  return all
    .slice(1)
    .map((s, i) => {
      const d = s - all[i];
      return d === 1 ? 'H' : d === 2 ? 'W' : 'W+H';
    })
    .join('–');
}

export function KeySheet() {
  const song = useStore((s) => s.song);
  const adapt = useStore((s) => s.settings.adaptOnModeChange);
  const tonicPc = pcOf(song.tonic);
  const minorish = getMode(song.mode).minorish;
  const enh = enharmonicTonic(song.tonic);

  const pickTonic = (pc: number) => {
    const tonic = pc === tonicPc ? song.tonic : defaultTonic(pc, minorish);
    store.setKey(tonic, song.mode);
  };

  const pickMode = (mode: ModeId) => {
    let tonic = song.tonic;
    // Respell awkward tonics for the new mode (e.g. D♭ minor → C♯ minor).
    if (tonic.acc !== 0 && getMode(mode).minorish !== minorish) tonic = defaultTonic(tonicPc, getMode(mode).minorish);
    store.setKey(tonic, mode);
    if (adapt && mode !== song.mode) store.toast(`Chords adapted to ${getMode(mode).name}`, { label: 'Undo', run: store.undo });
  };

  const transpose = (d: number) => store.setKey(defaultTonic(tonicPc + d + 12, minorish), song.mode);

  const label = (pc: number) => (pc === tonicPc ? noteName(song.tonic) : noteName(defaultTonic(pc, minorish)));
  const capos = capoOptions(song.chords, { tonic: song.tonic, mode: song.mode }).filter((c) => c.capo > 0 && c.open > 0);
  const capo0 = capoOptions(song.chords, { tonic: song.tonic, mode: song.mode }).find((c) => c.capo === 0);

  return (
    <Sheet title={`Key · ${keyName({ tonic: song.tonic, mode: song.mode })}`}>
      <div className="field">
        <div className="field-label">
          Tonic
          <span className="val" style={{ display: 'flex', gap: 6 }}>
            <button className="mini-btn" onClick={() => transpose(-1)} aria-label="Transpose down a semitone">
              <Icon name="minus" /> ½
            </button>
            <button className="mini-btn" onClick={() => transpose(1)} aria-label="Transpose up a semitone">
              <Icon name="plus" /> ½
            </button>
            {enh && (
              <button className="mini-btn" onClick={() => store.setKey(enh, song.mode)} aria-label={`Spell as ${noteName(enh)}`}>
                {noteName(song.tonic)} → {noteName(enh)}
              </button>
            )}
          </span>
        </div>
        <div className="key-piano" role="radiogroup" aria-label="Tonic">
          {WHITE_PCS.map((pc, i) => (
            <button
              key={pc}
              role="radio"
              aria-checked={pc === tonicPc}
              className={`w ${pc === tonicPc ? 'on' : ''}`}
              style={{ left: `calc(${(i * 100) / 7}% + 2px)` }}
              onClick={() => pickTonic(pc)}
            >
              {label(pc)}
            </button>
          ))}
          {BLACK_KEYS.map(({ pc, boundary }) => (
            <button
              key={pc}
              role="radio"
              aria-checked={pc === tonicPc}
              className={`b ${pc === tonicPc ? 'on' : ''}`}
              style={{ left: `calc(${(boundary * 100) / 7}% - ${(100 / 7) * 0.35}%)` }}
              onClick={() => pickTonic(pc)}
            >
              {label(pc)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Scale / mode</div>
        <div className="row-list" role="radiogroup" aria-label="Mode">
          {MODES.map((m) => {
            const key: Key = { tonic: song.tonic, mode: m.id };
            return (
              <button key={m.id} role="radio" aria-checked={m.id === song.mode} className={`row-item mode-row ${m.id === song.mode ? 'on' : ''}`} onClick={() => pickMode(m.id)}>
                <div className="grow">
                  <div className="title">{m.name}</div>
                  <div className="desc">{m.mood}</div>
                  <div className="notes">{scaleNotes(key).map(noteName).join('  ')}</div>
                </div>
                <div className="right steps">{stepPattern(m.steps)}</div>
              </button>
            );
          })}
        </div>
        <ToggleRow
          title="Adapt chords to the new mode"
          desc="Switching Major → Minor turns I–V–vi–IV into i–v–VI–iv. Off keeps the exact chords."
          on={adapt}
          onChange={(v) => store.setSettings({ adaptOnModeChange: v })}
        />
      </div>

      {song.chords.length > 0 && (
        <div className="field">
          <div className="field-label">Guitar capo helper</div>
          {capo0 && (
            <div className="capo">
              <b>No capo:</b> {capo0.open} of {capo0.total} chords are open shapes
            </div>
          )}
          {capos.map((c) => (
            <div className="capo" key={c.capo}>
              <b>Capo {c.capo}:</b> {c.open} of {c.total} open shapes
              <div className="shapes">Play: {c.shapes.join('  ')}</div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
