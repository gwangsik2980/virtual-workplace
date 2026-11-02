import { useMemo, useRef, useState } from 'react';

export interface Series {
  name: string;
  /** CSS 색상 (예: 'var(--series-1)') */
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

interface LineChartProps {
  series: Series[];
  /** x축 레이블 (values와 같은 길이) */
  labels: string[];
  height?: number;
  format?: (v: number) => string;
  /** y축을 0부터 시작 */
  zeroBased?: boolean;
  /** 세로 기준선 (x 인덱스) */
  markers?: { index: number; label: string }[];
}

/**
 * 의존성 없는 SVG 선 그래프. viewBox로 그려 컨테이너 폭에 맞춰 늘어난다.
 */
export function LineChart({ series, labels, height = 180, format = (v) => v.toLocaleString('ko-KR'), zeroBased, markers }: LineChartProps) {
  const W = 640;
  const H = height;
  const pad = { l: 56, r: 12, t: 10, b: 22 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  const { min, max, n } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null && Number.isFinite(v)));
    let mn = all.length ? Math.min(...all) : 0;
    let mx = all.length ? Math.max(...all) : 1;
    if (zeroBased) mn = Math.min(0, mn);
    if (mx === mn) {
      mx += 1;
      mn -= zeroBased ? 0 : 1;
    }
    const span = mx - mn;
    return { min: zeroBased ? mn : mn - span * 0.08, max: mx + span * 0.08, n: Math.max(...series.map((s) => s.values.length), 1) };
  }, [series, zeroBased]);

  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const xTickEvery = Math.max(1, Math.ceil(n / 6));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };

  if (n === 0 || series.every((s) => s.values.length === 0)) {
    return <div className="empty">아직 데이터가 없습니다. 하루를 진행해 보세요.</div>;
  }

  return (
    <div>
      <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {yTicks.map((v, i) => (
          <g key={i}>
            <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end">
              {format(v)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % xTickEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
        {markers?.map((m) => (
          <g key={m.index + m.label}>
            <line x1={x(m.index)} x2={x(m.index)} y1={pad.t} y2={H - pad.b} stroke="var(--warn)" strokeDasharray="3 3" />
            <text x={x(m.index) + 4} y={pad.t + 10} style={{ fill: 'var(--warn)' }}>
              {m.label}
            </text>
          </g>
        ))}
        {series.map((s) => {
          let d = '';
          s.values.forEach((v, i) => {
            if (v === null || !Number.isFinite(v)) return;
            d += `${d === '' || s.values[i - 1] === null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />;
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--text-3)" strokeWidth={1} />
            {series.map((s) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : <circle key={s.name} cx={x(hover)} cy={y(v)} r={3.5} fill={s.color} />;
            })}
          </g>
        )}
      </svg>
      <div className="chart-tip">
        {hover !== null
          ? `${labels[hover] ?? ''}  ·  ` +
            series
              .map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : `${s.name} ${format(v)}`;
              })
              .filter(Boolean)
              .join('  ·  ')
          : ' '}
      </div>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.name} style={{ ['--swatch' as string]: s.color }}>
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface BarItem {
  label: string;
  value: number;
  color?: string;
  note?: string;
}

/** 가로 막대 비교 */
export function BarList({ items, format = (v) => v.toLocaleString('ko-KR'), max }: { items: BarItem[]; format?: (v: number) => string; max?: number }) {
  const m = max ?? Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="stack" style={{ gap: 10 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="row between" style={{ fontSize: 12.5, marginBottom: 3 }}>
            <span>{it.label}</span>
            <span className="num" style={{ fontWeight: 700 }}>
              {format(it.value)}
              {it.note ? <span className="faint"> {it.note}</span> : null}
            </span>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div style={{ width: `${Math.min(100, (Math.abs(it.value) / m) * 100)}%`, background: it.color ?? 'var(--accent)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
