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

  return (
    <Sheet title="Type or share">
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
        <div className="field-label">Export</div>
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
    </Sheet>
  );
}
