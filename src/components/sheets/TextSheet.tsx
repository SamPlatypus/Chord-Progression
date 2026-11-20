import { useMemo, useState } from 'react';
import { shareUrl } from '../../state/share';
import { store, useStore } from '../../state/store';
import { chordName, numeralText } from '../../theory/chords';
import { formatChordText, parseProgression } from '../../theory/parse';
import { keyName } from '../../theory/scales';
import { analyzeSong, Segmented, Sheet, songKey } from '../common';
import { Icon } from '../Icon';

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    store.toast(`${what} copied`);
  } catch {
    store.toast('Copy not available — select the text manually');
  }
}

export function TextSheet() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const [loops, setLoops] = useState<1 | 2 | 4>(2);
  const [busy, setBusy] = useState<string | null>(null);
  const key = songKey(song);
  const [format, setFormat] = useState<'names' | 'numerals'>('names');
  const initial = useMemo(() => {
    const names = format === 'names' ? song.chords.map((c) => chordName(c, key)) : song.chords.map((c) => numeralText(c, song.mode));
    return song.chords.length ? formatChordText(names, song.chords.map((c) => c.beats), song.meter) : '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);
  const [text, setText] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setText(initial);
  }

  const parsed = useMemo(() => parseProgression(text, key, song.meter), [text, key.tonic, key.mode, song.meter]);
  const preview = parsed.chords.map((c) => chordName(c, key));

  const apply = (mode: 'replace' | 'append') => {
    if (!parsed.chords.length) return;
    const chords = mode === 'replace' ? parsed.chords : [...song.chords, ...parsed.chords];
    store.updateSong((s) => ({ ...s, chords, loopRange: mode === 'replace' ? null : s.loopRange }));
    store.select(null);
    store.openSheet(null);
    store.toast(mode === 'replace' ? `Progression replaced (${parsed.chords.length} chords)` : `Added ${parsed.chords.length} chords`, { label: 'Undo', run: store.undo });
  };

  const exportText = () => {
    const names = formatChordText(song.chords.map((c) => chordName(c, key)), song.chords.map((c) => c.beats), song.meter);
    const nums = analyzeSong(song)
      .map((a) => a.numeral)
      .join(' – ');
    return `${song.name}\nKey: ${keyName(key)} · ${song.bpm} BPM · ${song.meter}/4\n${names}\n${nums}`;
  };

  const share = async () => {
    const url = shareUrl(song);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: song.name, text: exportText(), url });
        return;
      } catch {
        /* cancelled — fall through to copy */
      }
    }
    await copy(url, 'Share link');
  };

  const exportMidiFile = async () => {
    setBusy('midi');
    try {
      const { exportMidi, exportFileName, saveFile } = await import('../../audio/export');
      const r = await saveFile(exportMidi(song, settings, loops), exportFileName(song, 'mid'), 'audio/midi');
      if (r !== 'cancelled') store.toast(r === 'shared' ? 'MIDI shared' : 'MIDI file saved');
    } finally {
      setBusy(null);
    }
  };

  const exportWavFile = async () => {
    setBusy('wav');
    try {
      const { encodeWav, exportFileName, renderAudio, saveFile } = await import('../../audio/export');
      const buffer = await renderAudio(song, settings, loops);
      const r = await saveFile(encodeWav(buffer), exportFileName(song, 'wav'), 'audio/wav');
      if (r !== 'cancelled') store.toast(r === 'shared' ? 'Audio shared' : `Audio saved (${Math.round(buffer.duration)} s)`);
    } catch {
      store.toast('Audio export failed on this device');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet title="Type, share & export">
      <div className="field">
        <div className="field-label">
          Progression text
          <Segmented
            label="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'names', label: 'Chord names' },
              { value: 'numerals', label: 'Numerals' },
            ]}
          />
        </div>
        <textarea
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Progression text"
          placeholder="| C | G | Am | F |   or   I V vi IV"
        />
        <p className="hint">
          Chord names <code>C G/B Am7 Fmaj7</code> or numerals <code>I V vi IV</code>, <code>ii7 V7 Imaj7</code>, <code>bVII</code>, <code>V7/vi</code>, <code>I/3</code>. Bars:{' '}
          <code>| C G | Am |</code> splits a bar; <code>C:2</code> sets beats.
        </p>
        {parsed.errors.length > 0 && <div className="error">Didn’t understand: {parsed.errors.join(', ')}</div>}
        {preview.length > 0 && (
          <p className="hint">
            {preview.length} chords in {keyName(key)}: <b style={{ color: 'var(--text)' }}>{preview.join('  ')}</b>
          </p>
        )}
      </div>
      <div className="btn-row field">
        <button className="btn primary" disabled={!parsed.chords.length} onClick={() => apply('replace')}>
          <Icon name="check" /> Replace progression
        </button>
        <button className="btn" disabled={!parsed.chords.length} onClick={() => apply('append')}>
          <Icon name="plus" /> Append
        </button>
      </div>
      <div className="field">
        <div className="field-label">Share</div>
        <div className="btn-row">
          <button className="btn" onClick={() => copy(exportText(), 'Chord chart')}>
            <Icon name="copy" /> Copy chart
          </button>
          <button className="btn" onClick={share}>
            <Icon name="share" /> Share link
          </button>
        </div>
        <p className="hint">Share links contain the whole progression — anyone who opens one gets a copy in their library.</p>
      </div>
      <div className="field">
        <div className="field-label">
          Export for your DAW
          <Segmented
            label="Repeats"
            value={loops}
            onChange={setLoops}
            options={[
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
              { value: 4, label: '4×' },
            ]}
          />
        </div>
        <div className="btn-row">
          <button className="btn" disabled={!song.chords.length || !!busy} onClick={() => exportMidiFile()}>
            <Icon name="download" /> {busy === 'midi' ? 'Saving…' : 'MIDI file'}
          </button>
          <button className="btn" disabled={!song.chords.length || !!busy} onClick={() => exportWavFile()}>
            <Icon name="download" /> {busy === 'wav' ? 'Rendering…' : 'Audio (WAV)'}
          </button>
        </div>
        <p className="hint">MIDI has separate chords, bass and drum tracks with chord-name markers. WAV is rendered with the current sound settings.</p>
      </div>
    </Sheet>
  );
}
