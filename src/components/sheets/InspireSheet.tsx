import { useState } from 'react';
import { play } from '../../audio/playback';
import { store, useStore } from '../../state/store';
import { GEN_STYLES, type GenStyle, generateProgression } from '../../theory/generate';
import { getMode } from '../../theory/scales';
import { analyzeSong, fnClass, Segmented, Sheet, Slider } from '../common';
import { Icon } from '../Icon';

export function InspireSheet() {
  const song = useStore((s) => s.song);
  const colorByFunction = useStore((s) => s.settings.colorByFunction);
  const playing = useStore((s) => s.transport.playing);
  const [style, setStyle] = useState<GenStyle>('pop');
  const [length, setLength] = useState<4 | 8>(4);
  const [spice, setSpice] = useState(0.3);
  const [generated, setGenerated] = useState(0);

  const generate = () => {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const result = generateProgression({ style, length, spice, seed, mode: song.mode, meter: song.meter });
    store.loadGenerated(result.chords, result.mode);
    setGenerated((n) => n + 1);
    if (!playing) play();
  };

  const analysis = analyzeSong(song);
  const spiceLabel = spice < 0.15 ? 'Diatonic only' : spice < 0.45 ? 'A little colour' : spice < 0.75 ? 'Adventurous' : 'Wild';

  return (
    <Sheet title="Inspire me">
      <div className="field">
        <div className="field-label">Style</div>
        <div className="opt-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {GEN_STYLES.map((s) => (
            <button key={s.id} className={`opt ${style === s.id ? 'on' : ''}`} onClick={() => setStyle(s.id)}>
              {s.name}
              <small>{s.hint}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field-label">Length</div>
        <Segmented
          full
          label="Length"
          value={length}
          onChange={setLength}
          options={[
            { value: 4, label: '4 chords' },
            { value: 8, label: '8 chords' },
          ]}
        />
      </div>
      <div className="field">
        <div className="field-label">
          Spice <span className="val">{spiceLabel}</span>
        </div>
        <Slider label="Spice" value={spice} min={0} max={1} step={0.05} onChange={setSpice} />
      </div>
      <button className="btn primary" style={{ width: '100%', height: 52, fontSize: 16 }} onClick={generate}>
        <Icon name="wand" /> {generated ? 'Generate another' : 'Generate & play'}
      </button>
      {generated > 0 && (
        <div className="field" style={{ marginTop: 16 }}>
          <div className="field-label">
            Result <span className="val">{getMode(song.mode).name}</span>
          </div>
          <div className="preset-numerals numeral" style={{ fontSize: 18 }}>
            {analysis.map((a, i) => (
              <span key={i} className={fnClass(a.fn, colorByFunction)}>
                {a.numeral}
              </span>
            ))}
          </div>
          <div className="preset-chords">{analysis.map((a) => a.name).join(' – ')}</div>
          <p className="hint">Like it? Close this sheet and keep editing — or press Undo to go back to what you had.</p>
        </div>
      )}
    </Sheet>
  );
}
