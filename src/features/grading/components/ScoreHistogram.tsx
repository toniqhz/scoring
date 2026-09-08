import { useMemo, useState } from 'react';
import type { GradingResult } from '../../../types/gradingResult';
import './ScoreHistogram.css';

interface Props {
  results: GradingResult[];
  maxScore?: number;
}

interface Bucket {
  index: number;
  label: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
}

function buildBuckets(results: GradingResult[], maxScore: number): Bucket[] {
  const buckets: Bucket[] = Array.from({ length: maxScore }, (_, i) => ({
    index: i,
    label: `${i}-${i + 1}`,
    rangeStart: i,
    rangeEnd: i + 1,
    count: 0,
  }));
  for (const r of results) {
    if (r.score === null) continue;
    const idx = Math.min(maxScore - 1, Math.max(0, Math.floor(r.score)));
    buckets[idx].count++;
  }
  return buckets;
}

const CHART_HEIGHT = 180;
const BAR_MAX_WIDTH = 24;
const BAR_GAP = 2;

/** Cột bo góc trên 4px, đáy vuông neo vào baseline (đúng spec mark trong dataviz skill). */
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number): string {
  if (height <= 0) return '';
  const r = Math.min(radius, width / 2, height);
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    'Z',
  ].join(' ');
}

export function ScoreHistogram({ results, maxScore = 10 }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const buckets = useMemo(() => buildBuckets(results, maxScore), [results, maxScore]);
  const gradedCount = results.filter((r) => r.score !== null).length;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const peakIndex = buckets.reduce((best, b, i) => (b.count > buckets[best].count ? i : best), 0);

  if (gradedCount === 0) {
    return null;
  }

  const chartWidth = buckets.length * (BAR_MAX_WIDTH + BAR_GAP);

  return (
    <div className="score-histogram">
      <h3>Phổ điểm ({gradedCount} bài đã có điểm)</h3>
      <div className="score-histogram-plot-wrap">
        <svg
          className="score-histogram-plot"
          viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 24}`}
          role="img"
          aria-label={`Biểu đồ phổ điểm: ${buckets.map((b) => `${b.label} điểm: ${b.count} sinh viên`).join(', ')}`}
        >
          {[0, 0.5, 1].map((frac) => (
            <line
              key={frac}
              x1={0}
              x2={chartWidth}
              y1={CHART_HEIGHT * (1 - frac)}
              y2={CHART_HEIGHT * (1 - frac)}
              className="score-histogram-gridline"
            />
          ))}
          {buckets.map((b, i) => {
            const barHeight = (b.count / maxCount) * (CHART_HEIGHT - 4);
            const x = i * (BAR_MAX_WIDTH + BAR_GAP);
            const isHover = hoverIndex === i;
            const isPeak = i === peakIndex && b.count > 0;
            const drawnHeight = Math.max(barHeight, b.count > 0 ? 2 : 0);
            const drawnY = CHART_HEIGHT - drawnHeight;
            return (
              <g key={b.index}>
                <path
                  d={roundedTopBarPath(x, drawnY, BAR_MAX_WIDTH, drawnHeight, 4)}
                  className={`score-histogram-bar${isHover ? ' is-hover' : ''}`}
                  tabIndex={0}
                  onPointerEnter={() => setHoverIndex(i)}
                  onPointerLeave={() => setHoverIndex(null)}
                  onFocus={() => setHoverIndex(i)}
                  onBlur={() => setHoverIndex(null)}
                  role="img"
                  aria-label={`${b.label} điểm: ${b.count} sinh viên`}
                />
                {isPeak && (
                  <text x={x + BAR_MAX_WIDTH / 2} y={drawnY - 6} className="score-histogram-peak-label">
                    {b.count}
                  </text>
                )}
                <text x={x + BAR_MAX_WIDTH / 2} y={CHART_HEIGHT + 16} className="score-histogram-axis-label">
                  {b.label}
                </text>
              </g>
            );
          })}
          {hoverIndex !== null &&
            (() => {
              const b = buckets[hoverIndex];
              const barHeight = (b.count / maxCount) * (CHART_HEIGHT - 4);
              const drawnHeight = Math.max(barHeight, b.count > 0 ? 2 : 0);
              const text = `${b.count} SV · ${b.label} điểm`;
              const tooltipWidth = Math.max(60, text.length * 6 + 16);
              const tooltipHeight = 20;
              const centerX = hoverIndex * (BAR_MAX_WIDTH + BAR_GAP) + BAR_MAX_WIDTH / 2;
              const tooltipX = Math.min(Math.max(centerX - tooltipWidth / 2, 0), chartWidth - tooltipWidth);
              const tooltipY = Math.max(0, CHART_HEIGHT - drawnHeight - tooltipHeight - 8);
              return (
                <g className="score-histogram-tooltip-g" pointerEvents="none">
                  <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx={4} />
                  <text x={tooltipX + tooltipWidth / 2} y={tooltipY + tooltipHeight / 2 + 4} textAnchor="middle">
                    {text}
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      <details className="score-histogram-table-details">
        <summary>Xem dạng bảng số liệu</summary>
        <table className="score-histogram-table">
          <thead>
            <tr>
              <th>Khoảng điểm</th>
              <th>Số sinh viên</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.index}>
                <td>{b.label}</td>
                <td>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
