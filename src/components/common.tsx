import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { store, useStore } from '../state/store';
import type { Song } from '../state/types';
import { analyzeChord, type ChordAnalysis, type HarmonicFunction } from '../theory/chords';
import type { Key } from '../theory/scales';
import { Icon } from './Icon';

export function songKey(song: Song): Key {
  return { tonic: song.tonic, mode: song.mode };
}

const analysisCache = new WeakMap<Song, ChordAnalysis[]>();

/** Per-chord names, numerals and functions (next chord wraps for loops). */
export function analyzeSong(song: Song): ChordAnalysis[] {
  let a = analysisCache.get(song);
  if (!a) {
    const key = songKey(song);
    a = song.chords.map((c, i) => analyzeChord(c, key, song.chords[i + 1] ?? song.chords[0] ?? null));
    analysisCache.set(song, a);
  }
  return a;
}

export function useAnalysis(): ChordAnalysis[] {
  const song = useStore((s) => s.song);
  return useMemo(() => analyzeSong(song), [song]);
}

export function fnClass(fn: HarmonicFunction | undefined, colorByFunction: boolean) {
  if (!colorByFunction || !fn) return 'fn-none';
  return `fn-${fn}`;
}

// ---------------------------------------------------------------------------

interface SheetProps {
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Cover the transport bar (for sheets that don't need play/stop). */
  cover?: boolean;
  label?: string;
}

export function Sheet({ title, children, actions, cover, label }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const close = () => store.openSheet(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    if (!drag.current || !ref.current) return;
    if (drag.current.dy > 70) close();
    else ref.current.style.transform = '';
    drag.current = null;
  };

  return (
    <>
      <div className="backdrop" onClick={close} style={cover ? { zIndex: 70 } : undefined} />
      <div
        ref={ref}
        className={`sheet ${cover ? 'no-transport' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === 'string' ? title : undefined)}
        tabIndex={-1}
        style={cover ? { zIndex: 75 } : undefined}
      >
        <div className="sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        <div className="sheet-head">
          <h3>{title}</h3>
          {actions}
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function ToggleRow({ title, desc, on, onChange }: { title: string; desc?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="toggle-row">
      <div className="grow">
        <div className="title">{title}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  full,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  full?: boolean;
  label?: string;
}) {
  return (
    <div className={`seg-ctl ${full ? 'full' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      style={{ ['--pct' as string]: `${pct}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}
