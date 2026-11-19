/**
 * CurveChart - Shared SVG chart component for PR and ROC curves.
 * Fixed viewBox="0 0 400 300" with aspect-ratio 4/3 wrapper.
 * No ResizeObserver, no parent-size dependence.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import './CurveChart.css';

export interface CurveSeries {
  name: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  dashed?: boolean;
}

export interface ReadoutItem {
  label: string;
  value: string | number;
  color?: string;
}

export interface CurveChartProps {
  series: CurveSeries[];
  xLabel: string;
  yLabel: string;
  diagonal?: boolean;
  readouts?: ReadoutItem[];
  thresholdX?: number;
  className?: string;
  splitLabel?: string;
  ariaLabel?: string;
}

const MARGIN = { top: 20, right: 120, bottom: 40, left: 50 };
const VIEWBOX_WIDTH = 400;
const VIEWBOX_HEIGHT = 300;
const PLOT_WIDTH = VIEWBOX_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - MARGIN.top - MARGIN.bottom;

function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

function getPathData(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';
  return points.map((p, i) => (i === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
}

function findNearestPoint(points: Array<{ x: number; y: number }>, x: number): { x: number; y: number } | null {
  if (points.length === 0) return null;
  let closest = points[0];
  let minDist = Math.abs(points[0].x - x);
  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(points[i].x - x);
    if (dist < minDist) {
      minDist = dist;
      closest = points[i];
    }
  }
  return closest;
}

export const CurveChart: React.FC<CurveChartProps> = ({
  series,
  xLabel,
  yLabel,
  diagonal = false,
  readouts = [],
  thresholdX,
  className = '',
  splitLabel = 'TEST',
  ariaLabel,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; seriesName: string; seriesColor: string } | null>(null);

  const chartSeries = useMemo(() => {
    return series.map(s => ({
      ...s,
      svgPoints: s.points.map(p => ({
        x: MARGIN.left + p.x * PLOT_WIDTH,
        y: MARGIN.top + (1 - p.y) * PLOT_HEIGHT,
      })),
    }));
  }, [series]);

  const gridlines = useMemo(() => {
    const lines = [];
    for (let i = 0; i <= 5; i++) {
      const v = i / 5;
      const y = MARGIN.top + (1 - v) * PLOT_HEIGHT;
      lines.push({ x1: MARGIN.left, y1: y, x2: MARGIN.left + PLOT_WIDTH, y2: y, isMajor: i === 0 || i === 5 });
      const x = MARGIN.left + v * PLOT_WIDTH;
      lines.push({ x1: x, y1: MARGIN.top, x2: x, y2: MARGIN.top + PLOT_HEIGHT, isMajor: i === 0 || i === 5 });
    }
    return lines;
  }, []);

  const xTicks = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const v = i / 5;
    return { value: v, x: MARGIN.left + v * PLOT_WIDTH, label: formatNumber(v, 1) };
  }), []);

  const yTicks = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const v = 1 - i / 5;
    return { value: v, y: MARGIN.top + (1 - v) * PLOT_HEIGHT, label: formatNumber(v, 1) };
  }), []);

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (
      mouseX < MARGIN.left ||
      mouseX > MARGIN.left + PLOT_WIDTH ||
      mouseY < MARGIN.top ||
      mouseY > MARGIN.top + PLOT_HEIGHT
    ) {
      setHoveredPoint(null);
      return;
    }

    const dataX = (mouseX - MARGIN.left) / PLOT_WIDTH;

    let nearest = null;
    let minDist = Infinity;

    for (const s of chartSeries) {
      const pt = findNearestPoint(s.svgPoints, mouseX);
      if (pt) {
        const dist = Math.hypot(pt.x - mouseX, pt.y - mouseY);
        if (dist < minDist) {
          minDist = dist;
          nearest = { x: pt.x, y: pt.y, seriesName: s.name, seriesColor: s.color };
        }
      }
    }

    if (nearest) {
      setHoveredPoint(nearest);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  if (series.length === 0) {
    return (
      <div className={'curve-chart ' + className} style={{ width: '100%', aspectRatio: '4 / 3', minHeight: '220px' }} role="status" aria-label="Loading curve chart">
        <svg width="100%" height="100%" viewBox={'0 0 ' + VIEWBOX_WIDTH + ' ' + VIEWBOX_HEIGHT} className="curve-chart__svg" preserveAspectRatio="xMidYMid meet">
          <defs>
            <style>{'.curve-chart__gridline { stroke: var(--border-subtle); stroke-width: 0.5; } .curve-chart__gridline--major { stroke: var(--border-default); }'}</style>
          </defs>
          {gridlines.map((line, i) => (
            <line key={'grid-' + i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className={'curve-chart__gridline ' + (line.isMajor ? 'curve-chart__gridline--major' : '')} />
          ))}
        </svg>
      </div>
    );
  }

  return (
    <div className={'curve-chart ' + className} style={{ width: '100%', aspectRatio: '4 / 3', minHeight: '220px' }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={'0 0 ' + VIEWBOX_WIDTH + ' ' + VIEWBOX_HEIGHT}
        className="curve-chart__svg"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={ariaLabel || (xLabel + ' vs ' + yLabel + ' chart')}
      >
        <defs>
          <style>{
            .curve-chart__gridline { stroke: var(--border-subtle); stroke-width: 0.5; }
            .curve-chart__gridline--major { stroke: var(--border-default); }
            .curve-chart__axis { stroke: var(--border-default); stroke-width: 1; }
            .curve-chart__tick { stroke: var(--border-default); stroke-width: 1; }
            .curve-chart__tick-label { fill: var(--text-dim); font-family: var(--font-mono); font-size: 10px; }
            .curve-chart__axis-label { fill: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; font-weight: 500; }
            .curve-chart__split-label { fill: var(--text-dim); font-family: var(--font-mono); font-size: 9px; }
            .curve-chart__readout-label { fill: var(--text-dim); font-family: var(--font-mono); font-size: 10px; }
            .curve-chart__readout-value { fill: var(--text-primary); font-family: var(--font-mono); font-size: 10px; font-weight: 600; }
            .curve-chart__legend-row { display: flex; align-items: center; gap: 6px; }
            .curve-chart__legend-color { width: 12px; height: 12px; border-radius: 2px; }
            .curve-chart__legend-label { fill: var(--text-primary); font-family: var(--font-mono); font-size: 10px; }
            .curve-chart__crosshair { stroke: var(--text-dim); stroke-width: 0.5; stroke-dasharray: 4 4; pointer-events: none; }
            .curve-chart__hover-point { stroke: var(--bg-panel); stroke-width: 2; }
            .curve-chart__threshold-line { stroke: var(--semantic-red); stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.8; }
            .curve-chart__diagonal { stroke: var(--text-dim); stroke-width: 0.5; stroke-dasharray: 2 4; opacity: 0.5; }
          }</style>
        </defs>

        <g className="curve-chart__gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line key={'grid-' + i} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} className={'curve-chart__gridline ' + (line.isMajor ? 'curve-chart__gridline--major' : '')} />
          ))}
        </g>

        {diagonal && (
          <line x1={MARGIN.left} y1={MARGIN.top + PLOT_HEIGHT} x2={MARGIN.left + PLOT_WIDTH} y2={MARGIN.top} className="curve-chart__diagonal" aria-hidden="true" />
        )}

        {thresholdX !== undefined && thresholdX >= 0 && thresholdX <= 1 && (
          <line x1={MARGIN.left + thresholdX * PLOT_WIDTH} y1={MARGIN.top} x2={MARGIN.left + thresholdX * PLOT_WIDTH} y2={MARGIN.top + PLOT_HEIGHT} className="curve-chart__threshold-line" aria-hidden="true" />
        )}

        <g className="curve-chart__axes" aria-hidden="true">
          <line x1={MARGIN.left} y1={MARGIN.top + PLOT_HEIGHT} x2={MARGIN.left + PLOT_WIDTH} y2={MARGIN.top + PLOT_HEIGHT} className="curve-chart__axis curve-chart__axis--x" />
          <line x1={MARGIN.left} y1={MARGIN.top} x2={MARGIN.left} y2={MARGIN.top + PLOT_HEIGHT} className="curve-chart__axis curve-chart__axis--y" />
        </g>

        <g className="curve-chart__x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={'xtick-' + i}>
              <line x1={tick.x} y1={MARGIN.top + PLOT_HEIGHT} x2={tick.x} y2={MARGIN.top + PLOT_HEIGHT + 6} className={'curve-chart__tick ' + (i === 0 || i === 5 ? 'curve-chart__tick--major' : '')} />
              <text x={tick.x} y={MARGIN.top + PLOT_HEIGHT + 18} textAnchor="middle" dominantBaseline="hanging" className="curve-chart__tick-label">{tick.label}</text>
            </g>
          ))}
        </g>

        <g className="curve-chart__y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={'ytick-' + i}>
              <line x1={MARGIN.left - 6} y1={tick.y} x2={MARGIN.left} y2={tick.y} className={'curve-chart__tick ' + (i === 0 || i === 5 ? 'curve-chart__tick--major' : '')} />
              <text x={MARGIN.left - 10} y={tick.y} textAnchor="end" dominantBaseline="middle" className="curve-chart__tick-label">{tick.label}</text>
            </g>
          ))}
        </g>

        <g className="curve-chart__axis-labels" aria-hidden="true">
          <text x={MARGIN.left + PLOT_WIDTH / 2} y={VIEWBOX_HEIGHT - 6} textAnchor="middle" dominantBaseline="alphabetic" className="curve-chart__axis-label">{xLabel}</text>
          <text x={14} y={MARGIN.top + PLOT_HEIGHT / 2} textAnchor="middle" dominantBaseline="middle" transform={'rotate(-90, 14, ' + (MARGIN.top + PLOT_HEIGHT / 2) + ')'} className="curve-chart__axis-label">{yLabel}</text>
        </g>

        <g className="curve-chart__curves" aria-hidden="true">
          {chartSeries.map((s, si) => (
            <g key={'series-' + si} className="curve-chart__series">
              <path d={getPathData(s.svgPoints)} stroke={s.color} fill="none" strokeWidth={s.name === 'CNN' ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '4 3' : 'none'} opacity={0.9} />
              {hoveredPoint && hoveredPoint.seriesName === s.name && (
                <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={4} className="curve-chart__hover-point" fill={hoveredPoint.seriesColor} />
              )}
            </g>
          ))}
        </g>

        {hoveredPoint && (
          <g className="curve-chart__crosshair-group" aria-hidden="true">
            <line x1={hoveredPoint.x} y1={MARGIN.top} x2={hoveredPoint.x} y2={MARGIN.top + PLOT_HEIGHT} className="curve-chart__crosshair" />
            <line x1={MARGIN.left} y1={hoveredPoint.y} x2={MARGIN.left + PLOT_WIDTH} y2={hoveredPoint.y} className="curve-chart__crosshair" />
          </g>
        )}

        {readouts.length > 0 && (
          <g className="curve-chart__readouts" aria-hidden="true">
            {readouts.map((r, i) => (
              <g key={'readout-' + i} transform={'translate(' + (MARGIN.left + PLOT_WIDTH + 10) + ', ' + (MARGIN.top + i * 22) + ')'}>
                <text x="0" y="0" className="curve-chart__readout-label">{r.label}:</text>
                <text x="0" y="14" className="curve-chart__readout-value" fill={r.color || 'var(--text-primary)'}>{String(r.value)}</text>
              </g>
            ))}
          </g>
        )}

        <g className="curve-chart__legend" aria-hidden="true">
          {chartSeries.map((s, i) => (
            <g key={'legend-' + i} transform={'translate(' + (MARGIN.left + PLOT_WIDTH + 10) + ', ' + (MARGIN.top + readouts.length * 22 + 10 + i * 20) + ')'}>
              <rect x="0" y="-8" width="12" height="12" className="curve-chart__legend-color" fill={s.color} rx={2} />
              <text x="18" y="2" className="curve-chart__legend-label">{s.name}</text>
            </g>
          ))}
        </g>

        {hoveredPoint && (
          <g className="curve-chart__hover-readout" aria-hidden="true">
            <rect x={hoveredPoint.x + 10} y={hoveredPoint.y - 36} width="120" height="30" rx={3} fill="var(--bg-panel)" stroke="var(--border-default)" strokeWidth="0.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))" />
            <text x={hoveredPoint.x + 14} y={hoveredPoint.y - 24} className="curve-chart__hover-title" fill={hoveredPoint.seriesColor} fontFamily="var(--font-mono)" fontSize="10" fontWeight="600">{hoveredPoint.seriesName}</text>
            <text x={hoveredPoint.x + 14} y={hoveredPoint.y - 12} className="curve-chart__hover-coords" fill="var(--text-primary)" fontFamily="var(--font-mono)" fontSize="9">{xLabel}: {formatNumber((hoveredPoint.x - MARGIN.left) / PLOT_WIDTH, 3)}  {yLabel}: {formatNumber(1 - (hoveredPoint.y - MARGIN.top) / PLOT_HEIGHT, 3)}</text>
          </g>
        )}

        <text x={VIEWBOX_WIDTH - MARGIN.right + 10} y={VIEWBOX_HEIGHT - 8} textAnchor="end" dominantBaseline="alphabetic" className="curve-chart__split-label">{splitLabel.toUpperCase()} SPLIT</text>
      </svg>
    </div>
  );
};

export default CurveChart;