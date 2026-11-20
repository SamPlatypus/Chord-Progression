import { memo } from 'react';

const BLACK = new Set([1, 3, 6, 8, 10]);
const WW = 10; // white key width (viewBox units)
const WH = 50;
const BW = 6.2;
const BH = 31;

interface Props {
  upper: number[];
  bass: number | null;
  rootPc: number | null;
  scalePcs: number[] | null;
  low?: number;
  high?: number;
}

/** Piano view of the current voicing: chord tones lit, bass marked, scale dots. */
export const Keyboard = memo(function Keyboard({ upper, bass, rootPc, scalePcs, low = 36, high = 84 }: Props) {
  const whites: { midi: number; x: number }[] = [];
  const blacks: { midi: number; x: number }[] = [];
  let wi = 0;
  for (let m = low; m <= high; m++) {
    if (BLACK.has(m % 12)) blacks.push({ midi: m, x: wi * WW - BW / 2 });
    else whites.push({ midi: m, x: wi++ * WW });
  }
  const width = wi * WW;
  const lit = new Set(upper);
  const scale = new Set(scalePcs ?? []);

  const fillFor = (midi: number, black: boolean) => {
    if (lit.has(midi)) return 'var(--fn, var(--accent))';
    if (bass === midi) return 'color-mix(in srgb, var(--fn, var(--accent)) 55%, ' + (black ? 'var(--black-key)' : 'var(--white-key)') + ')';
    return undefined;
  };

  const marker = (midi: number, x: number, w: number, y: number, black: boolean) => {
    const on = lit.has(midi) || bass === midi;
    const pc = midi % 12;
    if (on && pc === rootPc) {
      return <circle cx={x + w / 2} cy={y} r={1.9} fill={black ? '#fff' : 'rgba(0,0,0,.55)'} />;
    }
    if (!on && scale.has(pc)) {
      return <circle className="scale-dot" cx={x + w / 2} cy={y} r={1.1} />;
    }
    return null;
  };

  const label = upper.length ? `Keyboard showing ${upper.length + (bass !== null ? 1 : 0)} notes` : 'Keyboard';

  return (
    <svg className="kbd" viewBox={`0 0 ${width} ${WH + 7}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {whites.map(({ midi, x }) => (
        <g key={midi}>
          <rect className="wk" x={x + 0.35} y={0} width={WW - 0.7} height={WH} rx={1.6} style={{ fill: fillFor(midi, false) }} />
          {marker(midi, x, WW, WH - 6, false)}
          {midi % 12 === 0 && (
            <text x={x + WW / 2} y={WH + 5.5} textAnchor="middle" fontSize={4.4} fill="var(--text-3)" fontWeight={600}>
              C{Math.floor(midi / 12) - 1}
            </text>
          )}
        </g>
      ))}
      {blacks.map(({ midi, x }) => (
        <g key={midi}>
          <rect className="bk" x={x} y={0} width={BW} height={BH} rx={1.2} style={{ fill: fillFor(midi, true) }} />
          {marker(midi, x, BW, BH - 5, true)}
        </g>
      ))}
    </svg>
  );
});
