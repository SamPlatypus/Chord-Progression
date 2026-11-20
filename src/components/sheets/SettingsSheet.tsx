import { useEffect, useState } from 'react';
import { store, useStore } from '../../state/store';
import { Segmented, Sheet, ToggleRow } from '../common';
import { Icon } from '../Icon';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

let deferredInstall: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e as InstallPrompt;
    installListeners.forEach((l) => l());
  });
}

function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    return () => {
      installListeners.delete(l);
    };
  }, []);
  return deferredInstall;
}

export function SettingsSheet() {
  const s = useStore((st) => st.settings);
  const install = useInstall();
  const [confirmReset, setConfirmReset] = useState(false);
  const standalone = typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;

  return (
    <Sheet title="Settings" cover>
      <div className="field">
        <div className="field-label">Appearance</div>
        <Segmented
          full
          label="Theme"
          value={s.theme}
          onChange={(theme) => store.setSettings({ theme })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'System' },
          ]}
        />
      </div>
      <div className="field">
        <div className="field-label">Chord labels</div>
        <Segmented
          full
          label="Chord labels"
          value={s.labels}
          onChange={(labels) => store.setSettings({ labels })}
          options={[
            { value: 'both', label: 'Both' },
            { value: 'names', label: 'Names (Am)' },
            { value: 'numerals', label: 'Numerals (vi)' },
          ]}
        />
      </div>
      <div className="field">
        <ToggleRow title="Colour by function" desc="Blue tonic · green predominant · orange dominant · purple chromatic" on={s.colorByFunction} onChange={(v) => store.setSettings({ colorByFunction: v })} />
        <ToggleRow title="Show scale on keyboard" desc="Dots mark the notes of the key — handy for finding melodies" on={s.showScale} onChange={(v) => store.setSettings({ showScale: v })} />
        <ToggleRow title="Keep screen awake while playing" on={s.keepAwake} onChange={(v) => store.setSettings({ keepAwake: v })} />
        <ToggleRow title="Adapt chords when changing mode" on={s.adaptOnModeChange} onChange={(v) => store.setSettings({ adaptOnModeChange: v })} />
        <ToggleRow title="Presets set tempo & sound" on={s.applyPresetStyle} onChange={(v) => store.setSettings({ applyPresetStyle: v })} />
      </div>

      <div className="field">
        <div className="field-label">App</div>
        <div className="btn-row">
          <button className="btn" onClick={() => store.openSheet('help')}>
            <Icon name="help" /> How to use
          </button>
          {install && !standalone && (
            <button
              className="btn primary"
              onClick={async () => {
                await install.prompt();
                deferredInstall = null;
              }}
            >
              <Icon name="download" /> Install app
            </button>
          )}
        </div>
        {!install && !standalone && (
          <p className="hint">
            Install for offline use: on iPhone tap Share → <b>Add to Home Screen</b>; on Android use the browser menu → <b>Install app</b>.
          </p>
        )}
        {standalone && <p className="hint">Installed — everything works offline.</p>}
      </div>

      <div className="field">
        <div className="field-label">Data</div>
        <button
          className="btn danger"
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            try {
              localStorage.clear();
            } catch {
              /* ignore */
            }
            location.reload();
          }}
        >
          <Icon name="trash" /> {confirmReset ? 'Tap again to erase everything' : 'Reset app & delete all progressions'}
        </button>
        <p className="hint">Chord Loop · v{__APP_VERSION__} · all audio is synthesized on your device.</p>
      </div>
    </Sheet>
  );
}

export function HelpSheet() {
  return (
    <Sheet title="How to use" cover>
      <div className="help">
        <h4>Build a progression</h4>
        <ul>
          <li>Tap chords in <b>Add chord</b> to append them — each one plays as it's added. Switch to <b>7ths</b> for richer chords.</li>
          <li>
            <b>Presets</b> load 30+ classic progressions in your key; <b>Type</b> lets you enter <code>I V vi IV</code> or <code>| C G | Am F |</code>.
          </li>
          <li>Tap a chord to hear it; tap it again to edit root, quality, bass note, length, or try a substitution.</li>
          <li>Long-press (or drag with a mouse) a chord to reorder it.</li>
        </ul>
        <h4>Play & practice</h4>
        <ul>
          <li>The playing chord lights up and its beats fill in; the keyboard shows the exact voicing.</li>
          <li>Set a <b>loop section</b> from the chord editor to drill a tricky change.</li>
          <li>Tempo sheet: tap tempo, swing, count-in, metronome and a <b>tempo trainer</b> that speeds up as you loop.</li>
          <li>Changing the key transposes everything; changing the mode re-harmonises (try Major → Dorian).</li>
        </ul>
        <h4>Colours</h4>
        <p>
          <span style={{ color: 'var(--tonic)' }}>Tonic</span> chords feel like home, <span style={{ color: 'var(--predominant)' }}>predominant</span> chords move away,{' '}
          <span style={{ color: 'var(--dominant)' }}>dominant</span> chords pull back home, <span style={{ color: 'var(--chromatic)' }}>chromatic</span> chords are borrowed colour.
        </p>
        <h4>Keyboard shortcuts</h4>
        <p>
          <kbd>Space</kbd> play/stop · <kbd>L</kbd> loop · <kbd>M</kbd> metronome · <kbd>⌘/Ctrl Z</kbd> undo · <kbd>⇧⌘Z</kbd> redo · <kbd>←</kbd>
          <kbd>→</kbd> select · <kbd>1</kbd>–<kbd>7</kbd> add scale chord · <kbd>Delete</kbd> remove · <kbd>↑</kbd>/<kbd>↓</kbd> tempo
        </p>
      </div>
    </Sheet>
  );
}
