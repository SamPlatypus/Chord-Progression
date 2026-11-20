import { memo, useEffect, useRef, useState } from 'react';
import { auditionIndex } from '../audio/playback';
import { loopBounds } from '../audio/transport';
import { store, useStore } from '../state/store';
import type { ChordAnalysis, ChordStep } from '../theory/chords';
import { fnClass, useAnalysis } from './common';
import { Icon } from './Icon';

interface DragState {
  from: number;
  over: number | null;
  after: boolean;
  x: number;
  y: number;
  w: number;
}

const LONG_PRESS_MS = 320;

export function ProgressionGrid() {
  const song = useStore((s) => s.song);
  const settings = useStore((s) => s.settings);
  const transport = useStore((s) => s.transport);
  const selected = useStore((s) => s.selected);
  const analysis = useAnalysis();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  // While dragging on touch screens, stop the page from scrolling.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const block = (e: TouchEvent) => {
      if (dragRef.current) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);

  const [rs, re] = loopBounds(song);
  const hasRange = !!song.loopRange;

  const onTap = (i: number) => {
    if (selected === i) {
      store.openSheet('chord');
      return;
    }
    store.select(i);
    auditionIndex(i);
  };

  const startDrag = (i: number, x: number, y: number, w: number) => {
    store.select(null);
    const d = { from: i, over: i, after: false, x, y, w };
    dragRef.current = d; // set immediately so the touchmove blocker sees it
    setDrag(d);
    navigator.vibrate?.(12);
  };

  const moveDrag = (x: number, y: number) => {
    const d = dragRef.current;
    if (!d) return;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-idx]');
    let over = d.over;
    let after = d.after;
    if (el) {
      over = Number(el.dataset.idx);
      const r = el.getBoundingClientRect();
      after = x > r.left + r.width / 2;
    }
    const next = { ...d, x, y, over, after };
    dragRef.current = next;
    setDrag(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!d || d.over === null) return;
    let to = d.over + (d.after ? 1 : 0);
    if (to > d.from) to -= 1;
    if (to !== d.from) {
      store.moveChord(d.from, to);
      store.toast('Chord moved', { label: 'Undo', run: store.undo });
    }
  };

  const playingIdx = transport.playing ? transport.chordIndex : -1;

  return (
    <div className="grid" ref={gridRef} role="list" aria-label="Chord progression">
      {song.chords.map((c, i) => (
        <ChordCard
          key={c.id}
          chord={c}
          index={i}
          a={analysis[i]}
          labels={settings.labels}
          colorByFunction={settings.colorByFunction}
          active={playingIdx === i}
          beat={playingIdx === i ? transport.beat : -1}
          selected={selected === i}
          dim={hasRange && (i < rs || i > re)}
          loopEdge={hasRange && (i === rs ? 'start' : i === re ? 'end' : null)}
          dragging={drag?.from === i}
          dropSide={drag && drag.over === i && drag.from !== i ? (drag.after ? 'after' : 'before') : null}
          onTap={onTap}
          onDragStart={startDrag}
          onDragMove={moveDrag}
          onDragEnd={endDrag}
        />
      ))}
      <button className="cc-add" onClick={() => store.openSheet('add')} aria-label="Add chord">
        <Icon name="plus" />
      </button>
      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y, width: drag.w }}>
          <CardFace chord={song.chords[drag.from]} a={analysis[drag.from]} labels={settings.labels} colorByFunction={settings.colorByFunction} beat={-1} ghost />
        </div>
      )}
    </div>
  );
}

interface CardProps {
  chord: ChordStep;
  index: number;
  a: ChordAnalysis;
  labels: 'both' | 'names' | 'numerals';
  colorByFunction: boolean;
  active: boolean;
  beat: number;
  selected: boolean;
  dim: boolean;
  loopEdge: 'start' | 'end' | null | false;
  dragging: boolean;
  dropSide: 'before' | 'after' | null;
  onTap(i: number): void;
  onDragStart(i: number, x: number, y: number, w: number): void;
  onDragMove(x: number, y: number): void;
  onDragEnd(): void;
}

const ChordCard = memo(function ChordCard(p: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; timer: number; dragging: boolean; moved: boolean; type: string } | null>(null);

  // Keep the playing chord on screen during long progressions.
  useEffect(() => {
    if (!p.active || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const bottomLimit = window.innerHeight - 110;
    if (r.top < 60 || r.bottom > bottomLimit) ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [p.active]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x = e.clientX;
    const y = e.clientY;
    const w = ref.current?.offsetWidth ?? 80;
    const timer = window.setTimeout(() => {
      if (press.current && !press.current.moved) {
        press.current.dragging = true;
        p.onDragStart(p.index, x, y, w);
      }
    }, LONG_PRESS_MS);
    press.current = { x, y, timer, dragging: false, moved: false, type: e.pointerType };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pr = press.current;
    if (!pr) return;
    const dist = Math.hypot(e.clientX - pr.x, e.clientY - pr.y);
    if (pr.dragging) {
      p.onDragMove(e.clientX, e.clientY);
      return;
    }
    if (dist > 8) {
      pr.moved = true;
      clearTimeout(pr.timer);
      // Mouse users can drag straight away; touch users must long-press first.
      if (pr.type === 'mouse') {
        pr.dragging = true;
        p.onDragStart(p.index, e.clientX, e.clientY, ref.current?.offsetWidth ?? 80);
      }
    }
  };

  const finish = (cancelled: boolean) => {
    const pr = press.current;
    press.current = null;
    if (!pr) return;
    clearTimeout(pr.timer);
    if (pr.dragging) p.onDragEnd();
    else if (!pr.moved && !cancelled) p.onTap(p.index);
  };

  const cls = [
    'cc',
    fnClass(p.a?.fn, p.colorByFunction),
    `labels-${p.labels}`,
    p.active && 'active',
    p.selected && 'selected',
    p.dim && 'dim',
    p.dragging && 'dragging',
    p.dropSide && `drop-${p.dropSide}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      className={cls}
      data-idx={p.index}
      role="listitem"
      tabIndex={0}
      aria-label={`${p.a?.name}, ${p.a?.numeral}, ${p.chord.beats} beats${p.active ? ', playing' : ''}`}
      aria-current={p.active ? 'true' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finish(false)}
      onPointerCancel={() => finish(true)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          p.onTap(p.index);
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          store.removeChord(p.index);
        } else if (e.key === 'ArrowLeft' && e.altKey) {
          store.moveChord(p.index, p.index - 1);
        } else if (e.key === 'ArrowRight' && e.altKey) {
          store.moveChord(p.index, p.index + 1);
        }
      }}
    >
      <CardFace chord={p.chord} a={p.a} labels={p.labels} colorByFunction={p.colorByFunction} beat={p.beat} loopEdge={p.loopEdge} />
    </div>
  );
});

function CardFace({
  chord,
  a,
  labels,
  beat,
  loopEdge,
  ghost,
  colorByFunction,
}: {
  chord: ChordStep;
  a: ChordAnalysis;
  labels: 'both' | 'names' | 'numerals';
  beat: number;
  loopEdge?: 'start' | 'end' | null | false;
  ghost?: boolean;
  colorByFunction: boolean;
}) {
  const name = a?.name ?? '';
  const inner = (
    <>
      {labels !== 'names' && <span className="cc-num numeral">{a?.numeral}</span>}
      <span className={`cc-name ${name.length > 6 ? 'xlong' : name.length > 4 ? 'long' : ''}`}>{name}</span>
      {loopEdge && (
        <span className="loop-tag" title={loopEdge === 'start' ? 'Loop start' : 'Loop end'}>
          <Icon name={loopEdge === 'start' ? 'chevronRight' : 'chevronLeft'} />
        </span>
      )}
      <span className="segs" aria-hidden>
        {Array.from({ length: Math.min(chord.beats, 8) }, (_, i) => (
          <span key={i} className={`seg ${beat >= 0 && i <= (chord.beats > 8 ? Math.floor((beat * 8) / chord.beats) : beat) ? 'on' : ''}`} />
        ))}
      </span>
    </>
  );
  if (ghost) return <div className={`cc ${fnClass(a?.fn, colorByFunction)} labels-${labels}`}>{inner}</div>;
  return inner;
}
