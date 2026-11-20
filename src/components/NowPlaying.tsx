import { useMemo } from 'react';
import { loopBounds, songVoicings } from '../audio/transport';
import { store, useStore } from '../state/store';
import { chordToneNames, getQuality } from '../theory/chords';
import { scalePcs } from '../theory/suggest';
import { fnClass, songKey, useAnalysis } from './common';
import { Keyboard } from './Keyboard';

function intervalLabel(semi: number, step: number): string {
  const s = semi % 12;
  switch (step) {
    case 0:
      return semi === 12 ? '8' : 'R';
    case 1:
      return semi >= 12 ? '9' : '2';
    case 2:
      return s === 3 ? '♭3' : '3';
    case 3:
      return '4';
    case 4:
      return s === 6 ? '♭5' : s === 8 ? '♯5' : '5';
    case 5:
      return '6';
    case 6:
      return s === 9 ? '°7' : s === 10 ? '♭7' : '7';
  }
  return '';
}

export function NowPlaying() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const transport = useStore((s) => s.transport);
  const selected = useStore((s) => s.selected);
  const analysis = useAnalysis();
  const voicings = useMemo(() => songVoicings(song, settings), [song, settings]);

  const n = song.chords.length;
  const playingIdx = transport.playing && transport.chordIndex >= 0 ? transport.chordIndex : null;
  const idx = playingIdx ?? (selected !== null && selected < n ? selected : n ? 0 : null);
  const chord = idx !== null ? song.chords[idx] : null;
  const a = idx !== null ? analysis[idx] : null;
  const v = idx !== null ? voicings[idx] : null;

  const [rs, re] = loopBounds(song);
  let nextIdx: number | null = null;
  if (idx !== null && n > 1) {
    nextIdx = idx >= re ? (settings.loop ? rs : null) : idx + 1;
  }
  const next = nextIdx !== null ? analysis[nextIdx] : null;

  const key = songKey(song);
  const tones = chord ? chordToneNames(chord, key) : [];
  const intervals = chord ? getQuality(chord.quality).tones.filter(([s]) => s < 12 || s === 14).map(([s, st]) => intervalLabel(s, st)) : [];

  const cls = fnClass(a?.fn, settings.colorByFunction);
  const beats = chord?.beats ?? song.meter;

  let status: React.ReactNode;
  if (transport.playing) {
    status = (
      <span className="state">
        <span className="live-dot" />
        {transport.countIn > 0 ? 'Count-in' : `Chord ${(playingIdx ?? 0) + 1} of ${n}`}
      </span>
    );
  } else if (n === 0) {
    status = 'Add chords below to get started';
  } else {
    status = selected !== null ? `Chord ${(idx ?? 0) + 1} of ${n} · tap again to edit` : 'Tap a chord to hear it';
  }

  return (
    <section className={`card now ${cls}`} aria-label="Now playing">
      {transport.playing && transport.countIn > 0 && (
        <div className="countin" key={transport.countIn} aria-live="assertive">
          {transport.countIn}
        </div>
      )}
      <div className="now-top">
        {status}
        <span className="num">{transport.playing && settings.loop && transport.loop > 0 ? `Loop ${transport.loop + 1}` : `${song.bpm} BPM · ${song.meter}/4`}</span>
      </div>
      <div className="now-main">
        <div className="now-chord">
          <div className="now-name pop" key={`${idx}-${transport.loop}-${a?.name}`} aria-live="polite">
            {a?.name ?? '—'}
          </div>
          <div className="now-sub">
            {a && <span className="numeral">{a.numeral}</span>}
            {a && <span>{a.role}</span>}
          </div>
        </div>
        {next && (
          <button className="now-next" onClick={() => nextIdx !== null && store.select(nextIdx)} aria-label={`Next chord ${next.name}`}>
            <div className="lbl">Next</div>
            <div className="nm">{next.name}</div>
          </button>
        )}
      </div>
      <div className="beats" aria-hidden>
        {Array.from({ length: beats }, (_, i) => (
          <div key={i} className={`beat ${i === 0 ? 'down' : ''} ${transport.playing && playingIdx === idx && i <= transport.beat ? 'on' : ''}`} />
        ))}
      </div>
      <Keyboard upper={v?.upper ?? []} bass={v?.bass ?? null} rootPc={v?.rootPc ?? null} scalePcs={settings.showScale ? scalePcs(key) : null} />
      {chord && (
        <div className="tones">
          <span>
            {tones.map((t, i) => (
              <span key={i}>
                <b>{t}</b>
                {i < tones.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </span>
          <span>{intervals.join(' ')}</span>
        </div>
      )}
    </section>
  );
}
