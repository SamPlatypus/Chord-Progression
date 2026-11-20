import { auditionChord, auditionIndex, play } from '../../audio/playback';
import { loopBounds } from '../../audio/transport';
import { store, useStore } from '../../state/store';
import {
  analyzeChord,
  bassToneIndex,
  type ChordStep,
  chordName,
  diatonicQuality,
  getQuality,
  isInScale,
  numeral,
  QUALITY_GROUPS,
  type QualityId,
  rootSpelling,
} from '../../theory/chords';
import { mod12, noteName } from '../../theory/notes';
import { getMode } from '../../theory/scales';
import { substitutions } from '../../theory/suggest';
import { fnClass, Sheet, songKey } from '../common';
import { Icon } from '../Icon';

export function ChordSheet() {
  const song = useStore((s) => s.song);
  const selected = useStore((s) => s.selected);
  const colorByFunction = useStore((s) => s.settings.colorByFunction);
  const playing = useStore((s) => s.transport.playing);
  const loop = useStore((s) => s.settings.loop);
  const idx = selected ?? -1;
  const chord = song.chords[idx];
  const key = songKey(song);

  if (!chord) {
    return (
      <Sheet title="Edit chord">
        <div className="empty">Select a chord in the progression to edit it.</div>
      </Sheet>
    );
  }

  const n = song.chords.length;
  const next = song.chords[idx + 1] ?? song.chords[0] ?? null;
  const a = analyzeChord(chord, key, next);
  const steps = getMode(song.mode).steps;
  const q = getQuality(chord.quality);

  const apply = (patch: Partial<ChordStep>) => {
    store.replaceChord(idx, patch);
    if (!playing) auditionChord({ ...chord, ...patch });
  };

  const setRoot = (root: number) => {
    const oldDeg = steps.indexOf(chord.root);
    const wasDiatonic = oldDeg >= 0 && isInScale(chord, song.mode);
    const newDeg = steps.indexOf(root);
    let quality = chord.quality;
    if (wasDiatonic && newDeg >= 0 && (q.family === 'triad' || q.family === 'seventh')) {
      quality = diatonicQuality(song.mode, newDeg, q.family === 'seventh');
    }
    const inv = bassToneIndex(chord);
    const tones = getQuality(quality).tones;
    const bass = chord.bass === null ? null : inv > 0 && inv < tones.length ? mod12(tones[inv][0]) : null;
    apply({ root, quality, bass });
  };

  const setQuality = (quality: QualityId) => {
    const inv = bassToneIndex(chord);
    const tones = getQuality(quality).tones;
    const bass = chord.bass === null ? null : inv > 0 && inv < tones.length ? mod12(tones[inv][0]) : inv < 0 ? chord.bass : null;
    apply({ quality, bass });
  };

  const bassOptions: { label: string; value: number | null }[] = [{ label: 'Root', value: null }];
  const invNames = ['', '3rd · 1st inv', '5th · 2nd inv', '7th · 3rd inv'];
  q.tones.slice(1, 4).forEach(([semi, step], i) => {
    if (step === 1 || semi >= 12) return;
    bassOptions.push({ label: invNames[i + 1] ?? `${semi}`, value: mod12(semi) });
  });

  const [rs, re] = loopBounds(song);
  const inRange = !!song.loopRange && idx >= rs && idx <= re;
  const suggestions = substitutions(chord, song.chords[idx + 1] ?? null, song.mode);

  const go = (d: number) => {
    const j = (idx + d + n) % n;
    store.select(j);
    if (!playing) auditionIndex(j);
  };

  return (
    <Sheet
      title={`Chord ${idx + 1} of ${n}`}
      actions={
        <>
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous chord">
            <Icon name="chevronLeft" />
          </button>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Next chord">
            <Icon name="chevronRight" />
          </button>
        </>
      }
    >
      <div className={`chord-head ${fnClass(a.fn, colorByFunction)}`}>
        <div className="meta">
          <div className="big">{a.name}</div>
          <div>
            <span className="numeral">{a.numeral}</span> <span className="role">· {a.role}</span>
          </div>
        </div>
        <button className="btn primary" onClick={() => auditionIndex(idx)} disabled={playing} aria-label="Hear chord">
          <Icon name="play" /> Hear
        </button>
      </div>

      <div className="field">
        <div className="field-label">Root</div>
        <div className="root-grid" role="radiogroup" aria-label="Root">
          {Array.from({ length: 12 }, (_, r) => {
            const inScale = steps.includes(r);
            const sample = { root: r, quality: inScale ? diatonicQuality(song.mode, steps.indexOf(r), false) : ('maj' as QualityId), bass: null };
            return (
              <button key={r} role="radio" aria-checked={chord.root === r} className={`opt ${chord.root === r ? 'on' : ''} ${inScale ? '' : 'out'}`} onClick={() => setRoot(r)}>
                {noteName(rootSpelling(r, key, sample.quality))}
                <small className="numeral">{numeral(sample, song.mode).replace(/[°+]/g, '')}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Quality <span className="val">{q.name}</span>
        </div>
        {QUALITY_GROUPS.map((g) => (
          <div key={g.label} className="opt-grid" style={{ marginBottom: 6 }}>
            {g.ids.map((id) => (
              <button key={id} className={`opt ${chord.quality === id ? 'on' : ''}`} onClick={() => setQuality(id)} title={getQuality(id).name}>
                {noteName(rootSpelling(chord.root, key, id))}
                {getQuality(id).symbol}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="field">
        <div className="field-label">Bass note</div>
        <div className="opt-grid">
          {bassOptions.map((o) => (
            <button key={String(o.value)} className={`opt ${chord.bass === o.value || (o.value === null && chord.bass === 0) ? 'on' : ''}`} onClick={() => apply({ bass: o.value })}>
              {o.label}
              <small>{chordName({ ...chord, bass: o.value }, key)}</small>
            </button>
          ))}
          <label className="opt" style={{ display: 'grid', placeItems: 'center', position: 'relative' }}>
            Other…
            <small>{chord.bass !== null && bassToneIndex(chord) < 0 ? chordName(chord, key) : 'pedal / slash'}</small>
            <select
              aria-label="Other bass note"
              value={chord.bass === null ? '' : String(chord.bass)}
              onChange={(e) => apply({ bass: e.target.value === '' ? null : Number(e.target.value) || null })}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            >
              <option value="">Root</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((iv) => (
                <option key={iv} value={iv}>
                  {chordName({ ...chord, bass: iv }, key)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Length <span className="val">{chord.beats} beat{chord.beats > 1 ? 's' : ''}</span>
        </div>
        <div className="stepper">
          <button className="icon-btn" onClick={() => apply({ beats: Math.max(1, chord.beats - 1) })} aria-label="Shorter" disabled={chord.beats <= 1}>
            <Icon name="minus" />
          </button>
          <div className="opt-grid" style={{ flex: 1, gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {[1, 2, song.meter, song.meter * 2, song.meter * 4].map((b, i) => (
              <button key={i} className={`opt ${chord.beats === b ? 'on' : ''}`} onClick={() => store.replaceChord(idx, { beats: b })}>
                {b === song.meter ? '1 bar' : b === song.meter * 2 ? '2 bars' : b === song.meter * 4 ? '4 bars' : `${b} beat${b > 1 ? 's' : ''}`}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={() => store.replaceChord(idx, { beats: Math.min(16, chord.beats + 1) })} aria-label="Longer" disabled={chord.beats >= 16}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="field">
          <div className="field-label">Try instead</div>
          <div className="sugg">
            {suggestions.map((s, i) => {
              const c = { ...chord, ...s };
              const sa = analyzeChord(c, key, song.chords[idx + 1] ?? null);
              return (
                <button key={i} className={fnClass(sa.fn, colorByFunction)} onClick={() => apply({ root: s.root, quality: s.quality, bass: s.bass })}>
                  <span className="nm">
                    {sa.name}
                    <span className="numeral">{sa.numeral}</span>
                  </span>
                  <span className="why">{s.reason}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="field">
        <div className="field-label">
          Loop section <span className="val">{song.loopRange ? `chords ${rs + 1}–${re + 1}` : 'whole progression'}</span>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => store.setLoopRange(Math.min(idx, song.loopRange ? re : n - 1), Math.max(idx, song.loopRange ? re : n - 1))}>
            Start here
          </button>
          <button className="btn" onClick={() => store.setLoopRange(Math.min(idx, song.loopRange ? rs : 0), Math.max(idx, song.loopRange ? rs : 0))}>
            End here
          </button>
          <button className="btn" onClick={() => store.setLoopRange(idx, idx)}>
            Only this
          </button>
          {song.loopRange && (
            <button className="btn" onClick={() => store.setLoopRange(null)}>
              Clear
            </button>
          )}
        </div>
        {song.loopRange && !loop && <p className="hint">Turn on Loop in the transport bar to repeat this section.</p>}
        {inRange && <p className="hint">This chord is inside the loop section.</p>}
      </div>

      <div className="btn-row">
        <button className="btn" onClick={() => { store.select(null); play(idx); store.openSheet(null); }}>
          <Icon name="play" /> Play from here
        </button>
        <button className="btn" onClick={() => store.duplicateChord(idx)}>
          <Icon name="copy" /> Duplicate
        </button>
        <button className="btn" onClick={() => store.moveChord(idx, idx - 1)} disabled={idx === 0} aria-label="Move left">
          <Icon name="chevronLeft" /> Move
        </button>
        <button className="btn" onClick={() => store.moveChord(idx, idx + 1)} disabled={idx === n - 1} aria-label="Move right">
          Move <Icon name="chevronRight" />
        </button>
        <button
          className="btn danger"
          onClick={() => {
            const name = a.name;
            store.removeChord(idx);
            if (store.state.song.chords.length === 0) store.openSheet(null);
            store.toast(`Deleted ${name}`, { label: 'Undo', run: store.undo });
          }}
        >
          <Icon name="trash" /> Delete
        </button>
      </div>
    </Sheet>
  );
}
