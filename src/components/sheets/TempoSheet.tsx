import { useRef, useState } from 'react';
import { store, useStore } from '../../state/store';
import { Segmented, Sheet, Slider, ToggleRow } from '../common';
import { Icon } from '../Icon';

function tempoName(bpm: number): string {
  if (bpm < 60) return 'Largo · very slow';
  if (bpm < 76) return 'Adagio · slow';
  if (bpm < 108) return 'Andante · walking';
  if (bpm < 120) return 'Moderato · moderate';
  if (bpm < 156) return 'Allegro · fast';
  if (bpm < 176) return 'Vivace · lively';
  return 'Presto · very fast';
}

export function TempoSheet() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const taps = useRef<number[]>([]);
  const [tapFlash, setTapFlash] = useState(false);
  const t = settings.trainer;

  const tap = () => {
    const now = performance.now();
    const list = taps.current.filter((x) => now - x < 2500);
    list.push(now);
    taps.current = list.slice(-6);
    setTapFlash(true);
    setTimeout(() => setTapFlash(false), 90);
    if (taps.current.length >= 2) {
      const intervals = taps.current.slice(1).map((x, i) => x - taps.current[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      store.setTempo(60000 / avg, true);
    }
  };

  const swingLabel = song.swing === 0 ? 'Straight' : song.swing < 0.4 ? 'Light' : song.swing < 0.75 ? 'Shuffle' : 'Hard swing';

  return (
    <Sheet title="Tempo & feel">
      <div className="field">
        <div className="bpm-display num" aria-live="polite">
          {song.bpm}
          <small>BPM</small>
        </div>
        <div className="tempo-name">{tempoName(song.bpm)}</div>
      </div>
      <div className="field stepper">
        <button className="icon-btn" onClick={() => store.setTempo(song.bpm - 5, true)} aria-label="Slower by 5">
          −5
        </button>
        <button className="icon-btn" onClick={() => store.setTempo(song.bpm - 1, true)} aria-label="Slower by 1">
          <Icon name="minus" />
        </button>
        <div className="value" style={{ flex: 1 }}>
          <Slider label="Tempo" value={song.bpm} min={30} max={240} step={1} onChange={(v) => store.setTempo(v, true)} />
        </div>
        <button className="icon-btn" onClick={() => store.setTempo(song.bpm + 1, true)} aria-label="Faster by 1">
          <Icon name="plus" />
        </button>
        <button className="icon-btn" onClick={() => store.setTempo(song.bpm + 5, true)} aria-label="Faster by 5">
          +5
        </button>
      </div>
      <div className="field tempo-quick">
        <button className={`btn ${tapFlash ? 'primary' : ''}`} onPointerDown={tap} aria-label="Tap tempo">
          <Icon name="tap" /> Tap tempo
        </button>
        {[60, 80, 100, 120].map((b) => (
          <button key={b} className="btn" onClick={() => store.setTempo(b, true)}>
            {b}
          </button>
        ))}
      </div>

      <div className="field">
        <div className="field-label">Time signature</div>
        <Segmented
          full
          label="Time signature"
          value={song.meter}
          onChange={(m) => store.setMeter(m)}
          options={[
            { value: 4, label: '4/4 · common time' },
            { value: 3, label: '3/4 · waltz' },
          ]}
        />
      </div>

      <div className="field">
        <div className="field-label">
          Swing <span className="val">{swingLabel} · {Math.round(song.swing * 100)}%</span>
        </div>
        <Slider label="Swing amount" value={song.swing} min={0} max={1} step={0.05} onChange={(v) => store.patchSong({ swing: v }, 'swing')} />
      </div>

      <div className="field">
        <div className="field-label">Practice</div>
        <ToggleRow title="Metronome click" desc="Accent on the first beat of each bar" on={settings.metronome} onChange={(v) => store.setSettings({ metronome: v })} />
        <ToggleRow title="Count-in" desc="One bar of clicks before playback starts" on={settings.countIn} onChange={(v) => store.setSettings({ countIn: v })} />
        <ToggleRow
          title="Tempo trainer"
          desc={`Speed up ${t.step} BPM every ${t.every} loop${t.every > 1 ? 's' : ''} until ${t.target} BPM`}
          on={t.enabled}
          onChange={(v) => {
            store.setSettings({ trainer: { ...t, enabled: v }, loop: v ? true : settings.loop });
            if (v && t.target <= song.bpm) store.setSettings({ trainer: { ...t, enabled: true, target: Math.min(240, song.bpm + 30) } });
          }}
        />
        {t.enabled && (
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            <div className="slider-row">
              <span>+{t.step} BPM</span>
              <Slider label="Tempo step" value={t.step} min={1} max={20} step={1} onChange={(v) => store.setSettings({ trainer: { ...t, step: v } })} />
              <span className="num">step</span>
            </div>
            <div className="slider-row">
              <span>Every {t.every}</span>
              <Slider label="Loops between steps" value={t.every} min={1} max={8} step={1} onChange={(v) => store.setSettings({ trainer: { ...t, every: v } })} />
              <span className="num">loops</span>
            </div>
            <div className="slider-row">
              <span>To {t.target}</span>
              <Slider label="Target tempo" value={t.target} min={40} max={240} step={1} onChange={(v) => store.setSettings({ trainer: { ...t, target: v } })} />
              <span className="num">BPM</span>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
