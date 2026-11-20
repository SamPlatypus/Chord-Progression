import { useState } from 'react';
import { auditionIndex } from '../../audio/playback';
import { INSTRUMENTS, type InstrumentId } from '../../audio/instruments';
import { engine } from '../../audio/engine';
import { DRUM_STYLES } from '../../music/drums';
import { BASS_STYLES, getPattern, type Pattern, PATTERN_KINDS, PATTERNS, type PatternKind } from '../../music/patterns';
import { store, useStore } from '../../state/store';
import { Segmented, Sheet, Slider, ToggleRow } from '../common';
import { Icon } from '../Icon';

const INST_ICON: Record<InstrumentId, string> = {
  guitar: 'guitar',
  nylon: 'guitar',
  piano: 'piano',
  ep: 'bell',
  pad: 'wave',
  organ: 'organ',
};

const GLYPH: Record<string, string> = { D: '↓', d: '↓', U: '↑', u: '↑', x: '×', '.': '', b: 'B', '●': '●', '•': '•' };

function PatternPreview({ p }: { p: Pattern }) {
  const perBeat = Math.max(1, Math.round(1 / p.step));
  const chars = [...p.preview].slice(0, 16);
  return (
    <div className="preview" aria-hidden>
      {chars.map((ch, i) => (
        <span key={i} className={`${ch !== '.' ? 'hit' : ''} ${i > 0 && i % perBeat === 0 ? 'beat-start' : ''}`} style={ch === 'd' || ch === 'u' ? { opacity: 0.65 } : undefined}>
          {GLYPH[ch] ?? ch}
        </span>
      ))}
    </div>
  );
}

export function SoundSheet() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const playing = useStore((s) => s.transport.playing);
  const selected = useStore((s) => s.selected);
  const current = getPattern(song.patternId);
  const [kind, setKind] = useState<PatternKind>(current.kind);
  const vol = settings.volumes;

  const setInstrument = (id: InstrumentId) => {
    store.patchSong({ instrumentId: id });
    engine.warm(id);
    if (!playing) setTimeout(() => auditionIndex(selected ?? 0), 30);
  };

  const setVol = (k: keyof typeof vol, v: number) => store.setSettings({ volumes: { ...vol, [k]: v } });

  return (
    <Sheet title="Sound & style">
      <div className="field">
        <div className="field-label">Instrument</div>
        <div className="inst-grid" role="radiogroup" aria-label="Instrument">
          {INSTRUMENTS.map((i) => (
            <button key={i.id} role="radio" aria-checked={song.instrumentId === i.id} className={`inst ${song.instrumentId === i.id ? 'on' : ''}`} onClick={() => setInstrument(i.id)} title={i.description}>
              <Icon name={INST_ICON[i.id]} />
              {i.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Pattern <span className="val">{current.name}</span>
        </div>
        <Segmented full label="Pattern type" value={kind} onChange={setKind} options={PATTERN_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
        <div className="row-list" style={{ marginTop: 10 }} role="radiogroup" aria-label="Pattern">
          {PATTERNS.filter((p) => p.kind === kind).map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={p.id === song.patternId}
              className={`row-item pattern-row ${p.id === song.patternId ? 'on' : ''}`}
              onClick={() => store.patchSong({ patternId: p.id })}
            >
              <div className="grow">
                <div className="title">
                  {p.name}
                  {p.meter === 3 && <span className="badge">3/4</span>}
                </div>
                <div className="desc">{p.description}</div>
                <PatternPreview p={p} />
              </div>
              {p.id === song.patternId && <Icon name="check" />}
            </button>
          ))}
        </div>
        {!playing && <p className="hint">Press play to hear patterns change live while you browse.</p>}
      </div>

      <div className="field">
        <div className="field-label">Bass line</div>
        <div className="opt-grid">
          {BASS_STYLES.map((b) => (
            <button key={b.id} className={`opt ${song.bassStyle === b.id ? 'on' : ''}`} onClick={() => store.patchSong({ bassStyle: b.id })} title={b.description}>
              {b.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Drums</div>
        <div className="opt-grid">
          {DRUM_STYLES.map((d) => (
            <button key={d.id} className={`opt ${song.drumStyle === d.id ? 'on' : ''}`} onClick={() => store.patchSong({ drumStyle: d.id })} title={d.description}>
              {d.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field-label">Mix</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {(
            [
              ['master', 'Master'],
              ['chords', 'Chords'],
              ['bass', 'Bass'],
              ['drums', 'Drums'],
              ['click', 'Click'],
            ] as const
          ).map(([k, label]) => (
            <div className="slider-row" key={k}>
              <span>{label}</span>
              <Slider label={`${label} volume`} value={vol[k]} min={0} max={1} onChange={(v) => setVol(k, v)} />
              <span className="num">{Math.round(vol[k] * 100)}</span>
            </div>
          ))}
          <div className="slider-row">
            <span>Reverb</span>
            <Slider label="Reverb" value={settings.reverb} min={0} max={1} onChange={(v) => store.setSettings({ reverb: v })} />
            <span className="num">{Math.round(settings.reverb * 100)}</span>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">Voicing</div>
        <ToggleRow title="Smooth voice leading" desc="Choose inversions that move as little as possible between chords" on={settings.voiceLeading} onChange={(v) => store.setSettings({ voiceLeading: v })} />
        <ToggleRow title="Humanize" desc="Tiny timing and velocity variations" on={settings.humanize} onChange={(v) => store.setSettings({ humanize: v })} />
        <div className="toggle-row">
          <div className="grow">
            <div className="title">Register</div>
            <div className="desc">Where the chords sit on the keyboard</div>
          </div>
          <Segmented
            label="Register"
            value={settings.register}
            onChange={(v) => store.setSettings({ register: v })}
            options={[
              { value: -1, label: 'Low' },
              { value: 0, label: 'Mid' },
              { value: 1, label: 'High' },
            ]}
          />
        </div>
      </div>
    </Sheet>
  );
}
