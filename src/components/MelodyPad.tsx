import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { useStore } from '../state/store';
import { chordPcs } from '../theory/chords';
import { mod12, noteName, plainName } from '../theory/notes';
import { getMode, keyPrefersFlat, scaleNotes, tonicPc } from '../theory/scales';
import { fnClass, Segmented, songKey, useAnalysis } from './common';
import { Icon } from './Icon';

type PadMode = 'scale' | 'penta' | 'chord';

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

interface Pad {
  midi: number;
  name: string;
  degree: string;
  /** Relative pitch class (to tonic). */
  rel: number;
}

/**
 * Playable scale pad for finding melodies over the loop. Notes belonging to
 * the chord that is sounding right now are highlighted as "safe" landing notes.
 */
export function MelodyPad() {
  const song = useStore((s) => s.song);
  const transport = useStore((s) => s.transport);
  const selected = useStore((s) => s.selected);
  const colorByFunction = useStore((s) => s.settings.colorByFunction);
  const analysis = useAnalysis();
  const [open, setOpen] = useState(() => loadPref('cp.pad.open', false));
  const [mode, setMode] = useState<PadMode>(() => loadPref('cp.pad.mode', 'scale'));
  const [octave, setOctave] = useState(0);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const voices = useRef(new Map<number, () => void>());

  useEffect(() => () => voices.current.forEach((stop) => stop()), []);

  const key = songKey(song);
  const mode7 = getMode(song.mode);
  const t = tonicPc(key);
  const n = song.chords.length;
  const idx = transport.playing && transport.chordIndex >= 0 ? transport.chordIndex : selected !== null && selected < n ? selected : n ? 0 : -1;
  const chord = idx >= 0 ? song.chords[idx] : null;
  const chordRel = new Set(chord ? chordPcs(chord) : []);
  const chordRoot = chord?.root ?? -1;
  const a = idx >= 0 ? analysis[idx] : null;

  let base = 60 + t;
  if (base > 66) base -= 12;
  base += octave * 12;

  const spelled = scaleNotes(key);
  const flat = keyPrefersFlat(key);
  let degrees: number[];
  if (mode === 'penta') degrees = mode7.minorish ? [0, 2, 3, 4, 6] : [0, 1, 2, 4, 5];
  else degrees = [0, 1, 2, 3, 4, 5, 6];

  const rows: Pad[][] = [];
  for (const o of [1, 0]) {
    if (mode === 'chord' && chord) {
      const rels = [...chordRel].sort((x, y) => mod12(x - chordRoot) - mod12(y - chordRoot));
      rows.push(
        rels.map((rel) => {
          const fromRoot = mod12(rel - chordRoot);
          const midi = base + mod12(chordRoot) + fromRoot + 12 * o;
          const degIdx = mode7.steps.indexOf(rel);
          return { midi, rel, name: degIdx >= 0 ? noteName(spelled[degIdx]) : plainName(t + rel, flat), degree: ['R', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♯5', '6', '♭7', '7'][fromRoot] };
        }),
      );
    } else {
      rows.push(degrees.map((d) => ({ midi: base + mode7.steps[d] + 12 * o, rel: mode7.steps[d], name: noteName(spelled[d]), degree: String(d + 1) })));
    }
  }

  const down = (p: Pad, e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    voices.current.get(p.midi)?.();
    voices.current.set(p.midi, engine.leadOn(p.midi, 0.85));
    setPressed((s) => new Set(s).add(p.midi));
  };
  const up = (p: Pad) => {
    voices.current.get(p.midi)?.();
    voices.current.delete(p.midi);
    setPressed((s) => {
      const next = new Set(s);
      next.delete(p.midi);
      return next;
    });
  };

  const toggle = () => {
    setOpen(!open);
    savePref('cp.pad.open', !open);
  };

  return (
    <section className={`card pad-card ${fnClass(a?.fn, colorByFunction)}`} aria-label="Melody pad">
      <div className="section-head" style={{ marginBottom: open ? 10 : 0 }}>
        <button className="pad-toggle" onClick={toggle} aria-expanded={open}>
          <h2>
            Melody pad
            <span className="meta">{open ? (chord ? `highlighting ${a?.name}` : '') : 'find a tune over the loop'}</span>
          </h2>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} />
        </button>
      </div>
      {open && (
        <>
          <div className="pad-controls">
            <Segmented
              label="Pad notes"
              value={mode}
              onChange={(m) => {
                setMode(m);
                savePref('cp.pad.mode', m);
              }}
              options={[
                { value: 'scale', label: 'Scale' },
                { value: 'penta', label: 'Pentatonic' },
                { value: 'chord', label: 'Chord tones' },
              ]}
            />
            <div className="octave">
              <button className="icon-btn" onClick={() => setOctave(Math.max(-1, octave - 1))} disabled={octave <= -1} aria-label="Octave down">
                <Icon name="minus" />
              </button>
              <span className="num">Oct {octave >= 0 ? `+${octave}` : octave}</span>
              <button className="icon-btn" onClick={() => setOctave(Math.min(1, octave + 1))} disabled={octave >= 1} aria-label="Octave up">
                <Icon name="plus" />
              </button>
            </div>
          </div>
          {rows.map((row, r) => (
            <div className="pad-row" key={r} style={{ gridTemplateColumns: `repeat(${Math.max(row.length, 3)}, minmax(0, 1fr))` }}>
              {row.map((p) => {
                const tone = chordRel.has(p.rel);
                const root = p.rel === mod12(chordRoot);
                return (
                  <button
                    key={p.midi}
                    className={`pad ${tone ? 'tone' : ''} ${root ? 'root' : ''} ${pressed.has(p.midi) ? 'down' : ''} ${p.rel === 0 ? 'tonic' : ''}`}
                    onPointerDown={(e) => down(p, e)}
                    onPointerUp={() => up(p)}
                    onPointerCancel={() => up(p)}
                    onLostPointerCapture={() => up(p)}
                    onContextMenu={(e) => e.preventDefault()}
                    aria-label={`${p.name}${tone ? ', chord tone' : ''}`}
                  >
                    <span className="pn">{p.name}</span>
                    <span className="pd">{p.degree}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <p className="hint">Highlighted pads are in the current chord — strong notes to land on. {transport.playing ? '' : 'Press play and improvise along.'}</p>
        </>
      )}
    </section>
  );
}
