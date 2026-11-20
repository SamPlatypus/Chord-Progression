import { memo } from 'react';
import { type GuitarShape, TUNING } from '../theory/guitar';
import { plainName } from '../theory/notes';

const X0 = 16;
const DX = 14;
const Y0 = 24;
const DY = 19;
const ROWS = 4;

interface Props {
  shape: GuitarShape | undefined;
  rootPc: number;
  /** Absolute pitch class of the bass, highlighted like the root. */
  label?: string;
  showNotes?: boolean;
  preferFlat?: boolean;
  className?: string;
}

/** Standard chord-box diagram: strings vertical, nut on top, dots for fingers. */
export const ChordDiagram = memo(function ChordDiagram({ shape, rootPc, label, showNotes = true, preferFlat = false, className = '' }: Props) {
  const width = X0 * 2 + DX * 5;
  const height = Y0 + DY * ROWS + (showNotes ? 16 : 6);
  if (!shape) {
    return (
      <svg className={`diagram ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="No guitar shape">
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize={9} fill="var(--text-3)">
          —
        </text>
      </svg>
    );
  }
  const { frets, baseFret, barre } = shape;
  const nut = baseFret === 1;
  const fy = (f: number) => Y0 + (f - baseFret + 0.5) * DY;
  const sx = (s: number) => X0 + s * DX;
  const desc = frets.map((f) => (f < 0 ? 'x' : f)).join(' ');
  return (
    <svg className={`diagram ${className}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label ?? 'Chord'} guitar shape ${desc}`}>
      {/* frets */}
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <line key={`f${i}`} x1={sx(0)} x2={sx(5)} y1={Y0 + i * DY} y2={Y0 + i * DY} stroke="var(--line-strong)" strokeWidth={i === 0 && nut ? 3.4 : 1} strokeLinecap="round" />
      ))}
      {/* strings */}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`s${s}`} x1={sx(s)} x2={sx(s)} y1={Y0} y2={Y0 + ROWS * DY} stroke="var(--text-3)" strokeWidth={0.6 + (5 - s) * 0.14} />
      ))}
      {!nut && (
        <text x={X0 - 6} y={fy(baseFret) + 3} textAnchor="end" fontSize={8} fontWeight={700} fill="var(--text-2)">
          {baseFret}
        </text>
      )}
      {barre && (
        <rect
          x={sx(barre.from) - 5}
          y={fy(barre.fret) - 5}
          width={sx(barre.to) - sx(barre.from) + 10}
          height={10}
          rx={5}
          fill="var(--text)"
          opacity={0.9}
        />
      )}
      {frets.map((f, s) => {
        const x = sx(s);
        if (f < 0)
          return (
            <text key={s} x={x} y={Y0 - 7} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--text-3)">
              ×
            </text>
          );
        const pc = (TUNING[s] + f) % 12;
        const isRoot = pc === rootPc;
        if (f === 0)
          return <circle key={s} cx={x} cy={Y0 - 10} r={3.6} fill="none" stroke={isRoot ? 'var(--fn, var(--accent))' : 'var(--text-2)'} strokeWidth={1.4} />;
        if (barre && f === barre.fret && s >= barre.from && s <= barre.to && !isRoot) return null;
        return <circle key={s} cx={x} cy={fy(f)} r={5.4} fill={isRoot ? 'var(--fn, var(--accent))' : 'var(--text)'} stroke={isRoot ? 'none' : 'none'} />;
      })}
      {showNotes &&
        frets.map((f, s) =>
          f < 0 ? null : (
            <text key={`n${s}`} x={sx(s)} y={Y0 + ROWS * DY + 12} textAnchor="middle" fontSize={7} fontWeight={600} fill="var(--text-3)">
              {plainName((TUNING[s] + f) % 12, preferFlat)}
            </text>
          ),
        )}
    </svg>
  );
});
