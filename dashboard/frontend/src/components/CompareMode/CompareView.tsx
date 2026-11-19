/**
 * CompareView - Side-by-side comparison of two TCEs
 * - Default: confident planet (high prob PC) + confident eclipsing binary (high prob AFP)
 * - Each side: global/local views, probability, period, depth
 * - Selector dropdowns to pick any two TCEs
 * - Sync zoom/pan between views
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Panel } from '../Panel';
import { useCompareTces } from '../../api/queries';
import { useTces } from '../../api/queries';
import { useCompareTceIds, useAddCompare, useClearCompare } from '../../store/useAppStore';
import { useSelectTce } from '../../store/useAppStore';
import type { TCESummary, TCEDetail, Split } from '../../api/types';
import './CompareView.css';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface CompareViewProps {
  /** Panel tag letter (default: 'C') */
  tag?: string;
  /** Panel title (default: 'COMPARE MODE') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
  /** Default split for fetching TCEs (default: 'test') */
  defaultSplit?: Split;
}

interface TCEOption {
  tce_id: string;
  kepid: number;
  label: number;
  label_name: string;
  cnn_prob: number | null;
  period: number;
  depth: number;
}

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────

function formatLabelName(label: number): string {
  switch (label) {
    case 0:
      return 'NTP';
    case 1:
      return 'PC';
    case 2:
      return 'AFP';
    default:
      return 'UNK';
  }
}

function formatPeriod(period: number): string {
  if (period >= 100) return period.toFixed(1);
  if (period >= 10) return period.toFixed(2);
  return period.toFixed(3);
}

function formatDepth(depth: number): string {
  const ppm = depth * 1e6;
  if (ppm >= 1000) return `${(ppm / 1000).toFixed(1)} ppt`;
  return `${ppm.toFixed(0)} ppm`;
}

function formatProbability(prob: number | null): string {
  if (prob === null) return '—';
  return (prob * 100).toFixed(1);
}

/** Light curve point for rendering */
interface CurvePoint {
  x: number;
  y: number;
  phase: number;
  flux: number;
}

/** Transformed chart data for a light curve view */
interface ChartData {
  points: CurvePoint[];
  plotWidth: number;
  plotHeight: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  transitCenter: number;
  transitDuration: number;
}

const COMPARE_CHART_HEIGHT = 180;
const COMPARE_MARGIN = { top: 16, right: 12, bottom: 32, left: 44 };

/** Transform light curve array into chart coordinates */
function transformLightCurve(
  fluxArray: number[],
  _t0: number,
  period: number,
  duration: number,
  plotWidth: number,
  plotHeight: number,
  isGlobal: boolean
): ChartData {
  const n = fluxArray.length;
  let phaseMin: number, phaseMax: number;

  if (isGlobal) {
    phaseMin = -1.0;
    phaseMax = 1.0;
  } else {
    const durationInPhase = duration / 24 / period;
    phaseMin = -durationInPhase * 2;
    phaseMax = durationInPhase * 2;
  }

  const points: CurvePoint[] = fluxArray.map((flux, i) => {
    const phase = phaseMin + (i / (n - 1)) * (phaseMax - phaseMin);
    return { x: 0, y: 0, phase, flux };
  });

  const [fluxMin, fluxMax] = [Math.min(...fluxArray), Math.max(...fluxArray)];
  const fluxRange = fluxMax - fluxMin;
  const padding = fluxRange * 0.1;
  const yMin = fluxMin - padding;
  const yMax = fluxMax + padding;

  const xScale = (phase: number) => COMPARE_MARGIN.left + ((phase - phaseMin) / (phaseMax - phaseMin)) * plotWidth;
  const yScale = (flux: number) => COMPARE_MARGIN.top + (1 - (flux - yMin) / (yMax - yMin)) * plotHeight;

  const pointsWithCoords = points.map(p => ({
    ...p,
    x: xScale(p.phase),
    y: yScale(p.flux),
  }));

  return {
    points: pointsWithCoords,
    plotWidth,
    plotHeight,
    xMin: phaseMin,
    xMax: phaseMax,
    yMin,
    yMax,
    transitCenter: xScale(0),
    transitDuration: xScale(duration / 24 / period) - COMPARE_MARGIN.left,
  };
}

/** Generate SVG path for a line curve */
function getLinePath(points: CurvePoint[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

/** Generate gridlines for light curve chart */
function generateGridlines(chart: ChartData) {
  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; className: string }> = [];
  const { plotWidth, plotHeight, xMin, xMax } = chart;

  // Horizontal gridlines
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    const y = COMPARE_MARGIN.top + frac * plotHeight;
    lines.push({
      x1: COMPARE_MARGIN.left,
      y1: y,
      x2: COMPARE_MARGIN.left + plotWidth,
      y2: y,
      className: i === 0 || i === 4 ? 'gridline--major' : 'gridline--minor',
    });
  }

  // Vertical gridlines
  const xTicks = [-1, -0.5, 0, 0.5, 1].filter(t => t >= xMin && t <= xMax);
  for (const tick of xTicks) {
    const x = COMPARE_MARGIN.left + ((tick - xMin) / (xMax - xMin)) * plotWidth;
    lines.push({
      x1: x,
      y1: COMPARE_MARGIN.top,
      x2: x,
      y2: COMPARE_MARGIN.top + plotHeight,
      className: tick === 0 || tick === -1 || tick === 1 ? 'gridline--major' : 'gridline--minor',
    });
  }

  return lines;
}

/** Generate axis ticks */
function generateXTicks(chart: ChartData) {
  const ticks = [-1, -0.5, 0, 0.5, 1].filter(t => t >= chart.xMin && t <= chart.xMax);
  return ticks.map(tick => ({
    value: tick,
    x: COMPARE_MARGIN.left + ((tick - chart.xMin) / (chart.xMax - chart.xMin)) * chart.plotWidth,
    label: tick === 0 ? '0' : tick.toFixed(1),
  }));
}

function generateYTicks(chart: ChartData) {
  return Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const flux = chart.yMin + (1 - frac) * (chart.yMax - chart.yMin);
    const y = COMPARE_MARGIN.top + frac * chart.plotHeight;
    return { value: flux, y, label: flux.toFixed(4) };
  });
}

// ──────────────────────────────────────────────────────────────
// LightCurveChart Component (reusable for both sides)
// ──────────────────────────────────────────────────────────────

interface LightCurveChartProps {
  title: string;
  data: ChartData | null;
  showSecondaryEclipse?: boolean;
  secondaryEclipsePhase?: number;
  /** Sync zoom/pan state */
  syncState?: {
    xDomain: [number, number];
    yDomain: [number, number];
  };
  onSyncChange?: (xDomain: [number, number], yDomain: [number, number]) => void;
  className?: string;
}

function LightCurveChart({
  title,
  data,
  showSecondaryEclipse = false,
  secondaryEclipsePhase = 0.5,
  syncState,
  onSyncChange,
  className = '',
}: LightCurveChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; phase: number; flux: number } | null>(null);

  // Apply sync state to chart scales
  const effectiveXMin = syncState?.xDomain[0] ?? data?.xMin ?? -1;
  const effectiveXMax = syncState?.xDomain[1] ?? data?.xMax ?? 1;
  const effectiveYMin = syncState?.yDomain[0] ?? data?.yMin ?? 0.9;
  const effectiveYMax = syncState?.yDomain[1] ?? data?.yMax ?? 1.1;

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !data) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is within plot area
    if (
      mouseX < COMPARE_MARGIN.left ||
      mouseX > COMPARE_MARGIN.left + data.plotWidth ||
      mouseY < COMPARE_MARGIN.top ||
      mouseY > COMPARE_MARGIN.top + data.plotHeight
    ) {
      setTooltip(null);
      return;
    }

    // Find nearest point
    let nearestPoint: CurvePoint | null = null;
    let minDist = Infinity;

    for (const point of data.points) {
      const dist = Math.hypot(point.x - mouseX, point.y - mouseY);
      if (dist < minDist && dist < 30) {
        minDist = dist;
        nearestPoint = point;
      }
    }

    if (nearestPoint) {
      setTooltip({
        visible: true,
        x: nearestPoint.x,
        y: nearestPoint.y,
        phase: nearestPoint.phase,
        flux: nearestPoint.flux,
      });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // Wheel zoom handler
  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (!data || !onSyncChange) return;

    const zoomFactor = event.deltaY > 0 ? 1.2 : 0.833;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if in plot area
    if (
      mouseX < COMPARE_MARGIN.left ||
      mouseX > COMPARE_MARGIN.left + data.plotWidth ||
      mouseY < COMPARE_MARGIN.top ||
      mouseY > COMPARE_MARGIN.top + data.plotHeight
    ) return;

    // Convert mouse position to data coordinates
    const xData = effectiveXMin + ((mouseX - COMPARE_MARGIN.left) / data.plotWidth) * (effectiveXMax - effectiveXMin);
    const yData = effectiveYMax - ((mouseY - COMPARE_MARGIN.top) / data.plotHeight) * (effectiveYMax - effectiveYMin);

    // Calculate new domain
    const newXRange = (effectiveXMax - effectiveXMin) * zoomFactor;
    const newYRange = (effectiveYMax - effectiveYMin) * zoomFactor;

    const newXMin = xData - ((mouseX - COMPARE_MARGIN.left) / data.plotWidth) * newXRange;
    const newXMax = newXMin + newXRange;
    const newYMin = yData - ((data.plotHeight - (mouseY - COMPARE_MARGIN.top)) / data.plotHeight) * newYRange;
    const newYMax = newYMin + newYRange;

    onSyncChange([newXMin, newXMax], [newYMin, newYMax]);
  };

  // Pan handler
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; xDomain: [number, number]; yDomain: [number, number] } | null>(null);

  const handleMouseDown = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!data || !onSyncChange) return;
    if (event.button !== 0) return; // Only left click

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if in plot area
    if (
      mouseX < COMPARE_MARGIN.left ||
      mouseX > COMPARE_MARGIN.left + data.plotWidth ||
      mouseY < COMPARE_MARGIN.top ||
      mouseY > COMPARE_MARGIN.top + data.plotHeight
    ) return;

    setIsPanning(true);
    setPanStart({
      x: mouseX,
      y: mouseY,
      xDomain: [effectiveXMin, effectiveXMax],
      yDomain: [effectiveYMin, effectiveYMax],
    });
    event.preventDefault();
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setPanStart(null);
  };

  const handleMouseMovePan = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning || !panStart || !data || !onSyncChange) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const dx = (panStart.x - mouseX) / data.plotWidth * (panStart.xDomain[1] - panStart.xDomain[0]);
    const dy = (mouseY - panStart.y) / data.plotHeight * (panStart.yDomain[1] - panStart.yDomain[0]);

    onSyncChange(
      [panStart.xDomain[0] + dx, panStart.xDomain[1] + dx],
      [panStart.yDomain[0] + dy, panStart.yDomain[1] + dy]
    );
  };

  if (!data) {
    return (
      <div className={`compare-chart ${className}`} style={{ height: COMPARE_CHART_HEIGHT }} role="status" aria-label="Loading chart">
        <svg width="100%" height="100%" viewBox={`0 0 ${COMPARE_CHART_HEIGHT + COMPARE_MARGIN.left + COMPARE_MARGIN.right} ${COMPARE_CHART_HEIGHT}`} className="compare-chart-svg">
          <text
            x={(COMPARE_CHART_HEIGHT + COMPARE_MARGIN.left + COMPARE_MARGIN.right) / 2}
            y={COMPARE_CHART_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="compare-chart-empty"
            fill="var(--text-dim)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            No data
          </text>
        </svg>
      </div>
    );
  }

  const gridlines = generateGridlines(data);
  const xTicks = generateXTicks(data);
  const yTicks = generateYTicks(data);
  const path = getLinePath(data.points);

  // Secondary eclipse window positions
  const secEclipseX1 = COMPARE_MARGIN.left + ((-secondaryEclipsePhase - effectiveXMin) / (effectiveXMax - effectiveXMin)) * data.plotWidth;
  const secEclipseX2 = COMPARE_MARGIN.left + ((secondaryEclipsePhase - effectiveXMin) / (effectiveXMax - effectiveXMin)) * data.plotWidth;

  // Calculate viewBox based on sync state
  const viewBoxWidth = data.plotWidth + COMPARE_MARGIN.left + COMPARE_MARGIN.right;

  // Combined handlers for tooltip + pan (defined before return)
  const handleMouseMoveCombined = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    handleMouseMove(event);
    if (isPanning) handleMouseMovePan(event);
  }, [handleMouseMove, handleMouseMovePan, isPanning]);

  const handleMouseLeaveCombined = useCallback(() => {
    handleMouseLeave();
    handleMouseUp();
  }, [handleMouseLeave, handleMouseUp]);

  const handleMouseUpCombined = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  return (
    <div className={`compare-chart ${className}`} style={{ height: COMPARE_CHART_HEIGHT }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxWidth} ${COMPARE_CHART_HEIGHT}`}
        className="compare-chart-svg"
        onMouseMove={handleMouseMoveCombined}
        onMouseLeave={handleMouseLeaveCombined}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUpCombined}
        role="img"
        aria-label={`${title} light curve`}
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
      >
        <defs>
          <linearGradient id="compare-gradient-curve" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.5" />
            <stop offset="50%" stopColor="var(--semantic-amber)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--text-dim)" stopOpacity="0.5" />
          </linearGradient>

          <filter id="compare-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--bg-canvas)" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Gridlines */}
        <g className="compare-gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`compare-gridline ${line.className}`}
            />
          ))}
        </g>

        {/* Secondary eclipse window (global view only) */}
        {showSecondaryEclipse && secEclipseX1 >= COMPARE_MARGIN.left && secEclipseX2 <= COMPARE_MARGIN.left + data.plotWidth && (
          <g className="compare-secondary-eclipse" aria-hidden="true">
            <rect
              x={secEclipseX1}
              y={COMPARE_MARGIN.top}
              width={secEclipseX2 - secEclipseX1}
              height={data.plotHeight}
              className="compare-secondary-eclipse-window"
              fill="var(--semantic-red)"
              opacity="0.08"
            />
            <line
              x1={secEclipseX1}
              y1={COMPARE_MARGIN.top}
              x2={secEclipseX1}
              y2={COMPARE_MARGIN.top + data.plotHeight}
              className="compare-secondary-eclipse-edge"
              stroke="var(--semantic-red)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <line
              x1={secEclipseX2}
              y1={COMPARE_MARGIN.top}
              x2={secEclipseX2}
              y2={COMPARE_MARGIN.top + data.plotHeight}
              className="compare-secondary-eclipse-edge"
              stroke="var(--semantic-red)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <text
              x={(secEclipseX1 + secEclipseX2) / 2}
              y={COMPARE_MARGIN.top - 4}
              textAnchor="middle"
              dominantBaseline="alphabetic"
              className="compare-secondary-eclipse-label"
              fill="var(--semantic-red)"
              fontSize="var(--font-size-xs)"
              fontFamily="var(--font-mono)"
            >
              SEC ECLIPSE ±0.5
            </text>
          </g>
        )}

        {/* Transit window highlight (local view) */}
        {!showSecondaryEclipse && data.transitDuration > 0 && (
          <g className="compare-transit-window" aria-hidden="true">
            <rect
              x={data.transitCenter - data.transitDuration}
              y={COMPARE_MARGIN.top}
              width={data.transitDuration * 2}
              height={data.plotHeight}
              className="compare-transit-window-bg"
              fill="var(--semantic-amber)"
              opacity="0.08"
            />
          </g>
        )}

        {/* Axes */}
        <g className="compare-axes" aria-hidden="true">
          {/* X axis */}
          <line
            x1={COMPARE_MARGIN.left}
            y1={COMPARE_MARGIN.top + data.plotHeight}
            x2={COMPARE_MARGIN.left + data.plotWidth}
            y2={COMPARE_MARGIN.top + data.plotHeight}
            className="compare-axis compare-axis--x"
          />
          {/* Y axis */}
          <line
            x1={COMPARE_MARGIN.left}
            y1={COMPARE_MARGIN.top}
            x2={COMPARE_MARGIN.left}
            y2={COMPARE_MARGIN.top + data.plotHeight}
            className="compare-axis compare-axis--y"
          />
        </g>

        {/* X axis ticks and labels */}
        <g className="compare-x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={COMPARE_MARGIN.top + data.plotHeight}
                x2={tick.x}
                y2={COMPARE_MARGIN.top + data.plotHeight + 5}
                className={`compare-tick ${tick.value === 0 || Math.abs(tick.value) === 1 ? 'compare-tick--major' : ''}`}
              />
              <text
                x={tick.x}
                y={COMPARE_MARGIN.top + data.plotHeight + 14}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="compare-tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Y axis ticks and labels */}
        <g className="compare-y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={COMPARE_MARGIN.left - 5}
                y1={tick.y}
                x2={COMPARE_MARGIN.left}
                y2={tick.y}
                className={`compare-tick ${i === 0 || i === 4 ? 'compare-tick--major' : ''}`}
              />
              <text
                x={COMPARE_MARGIN.left - 8}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="compare-tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <g className="compare-axis-labels" aria-hidden="true">
          <text
            x={COMPARE_MARGIN.left + data.plotWidth / 2}
            y={COMPARE_CHART_HEIGHT - 4}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            className="compare-axis-label"
          >
            PHASE
          </text>
          <text
            x={10}
            y={COMPARE_MARGIN.top + data.plotHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, 10, ${COMPARE_MARGIN.top + data.plotHeight / 2})`}
            className="compare-axis-label"
          >
            NORMALIZED FLUX
          </text>
        </g>

        {/* Transit center line */}
        <line
          x1={data.transitCenter}
          y1={COMPARE_MARGIN.top}
          x2={data.transitCenter}
          y2={COMPARE_MARGIN.top + data.plotHeight}
          className="compare-transit-center"
          stroke="var(--semantic-amber)"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.5"
        />

        {/* Light curve */}
        <path
          d={path}
          className="compare-curve"
          stroke="url(#compare-gradient-curve)"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Chart title */}
        <text
          x={COMPARE_MARGIN.left}
          y={COMPARE_MARGIN.top - 4}
          textAnchor="start"
          dominantBaseline="alphabetic"
          className="compare-chart-title"
          fill="var(--text-secondary)"
          fontSize="var(--font-size-xs)"
          fontFamily="var(--font-heading)"
        >
          {title.toUpperCase()}
        </text>

        {/* Tooltip */}
        {tooltip && (
          <g className="compare-tooltip" filter="url(#compare-tooltip-shadow)">
            <rect
              x={tooltip.x + 10}
              y={tooltip.y - 44}
              width={140}
              height={38}
              rx={3}
              className="compare-tooltip-bg"
            />
            <text
              x={tooltip.x + 16}
              y={tooltip.y - 32}
              className="compare-tooltip-title"
              fill="var(--text-primary)"
              fontSize="var(--font-size-xs)"
            >
              PHASE {tooltip.phase.toFixed(3)}
            </text>
            <text
              x={tooltip.x + 16}
              y={tooltip.y - 18}
              className="compare-tooltip-row"
              fontSize="var(--font-size-xs)"
            >
              <tspan className="compare-tooltip-label">FLUX:</tspan>
              <tspan className="compare-tooltip-value" dx="4">{tooltip.flux.toFixed(5)}</tspan>
            </text>
            <text
              x={tooltip.x + 16}
              y={tooltip.y - 4}
              className="compare-tooltip-row"
              fontSize="var(--font-size-xs)"
            >
              <tspan className="compare-tooltip-label">Δ:</tspan>
              <tspan className="compare-tooltip-value" dx="4">{(tooltip.flux - 1) * 1e6 | 0} ppm</tspan>
            </text>
          </g>
        )}

        {/* Sync indicator */}
        {syncState && (
          <text
            x={viewBoxWidth - 8}
            y={14}
            textAnchor="end"
            dominantBaseline="hanging"
            className="compare-sync-indicator"
            fill="var(--semantic-green)"
            fontSize="var(--font-size-xs)"
            fontFamily="var(--font-mono)"
          >
            ⟳ SYNCED
          </text>
        )}
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// TCE Selector Dropdown
// ──────────────────────────────────────────────────────────────

interface TceSelectorProps {
  label: string;
  value: string | null;
  options: TCEOption[];
  onChange: (tceId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function TceSelector({ label, value, options, onChange, placeholder = 'Select TCE...', disabled = false }: TceSelectorProps) {
  return (
    <div className="compare-selector">
      <label className="compare-selector-label" htmlFor={`compare-select-${label.toLowerCase()}`}>
        {label}
      </label>
      <select
        id={`compare-select-${label.toLowerCase()}`}
        className="compare-selector-select"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.tce_id} value={opt.tce_id}>
            {opt.tce_id} • KepID {opt.kepid} • P={formatPeriod(opt.period)} • {formatLabelName(opt.label)} • CNN={formatProbability(opt.cnn_prob)}%
          </option>
        ))}
      </select>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// TCE Detail Panel (one side of comparison)
// ──────────────────────────────────────────────────────────────

interface TceDetailPanelProps {
  title: string;
  tce: TCEDetail | null;
  isLoading: boolean;
  isError: boolean;
  plotWidth: number;
  syncState: {
    xDomain: [number, number];
    yDomain: [number, number];
  };
  onSyncChange: (xDomain: [number, number], yDomain: [number, number]) => void;
  onSelect?: () => void;
}

function TceDetailPanel({
  title,
  tce,
  isLoading,
  isError,
  plotWidth,
  syncState,
  onSyncChange,
  onSelect,
}: TceDetailPanelProps) {
  const cnnProb = tce?.cnn_prob ?? 0;
  const gbProb = tce?.gb_prob ?? 0;
  const labelName = tce?.label_name ?? 'NTP';

  // Transform light curves for charts
  const globalChartData = useMemo(() => {
    if (!tce || !tce.global_view.length) return null;
    return transformLightCurve(
      tce.global_view,
      tce.t0_bkjd,
      tce.period,
      tce.duration,
      plotWidth,
      COMPARE_CHART_HEIGHT - COMPARE_MARGIN.top - COMPARE_MARGIN.bottom,
      true
    );
  }, [tce, plotWidth]);

  const localChartData = useMemo(() => {
    if (!tce || !tce.local_view.length) return null;
    return transformLightCurve(
      tce.local_view,
      tce.t0_bkjd,
      tce.period,
      tce.duration,
      plotWidth,
      COMPARE_CHART_HEIGHT - COMPARE_MARGIN.top - COMPARE_MARGIN.bottom,
      false
    );
  }, [tce, plotWidth]);

  if (isLoading) {
    return (
      <div className="compare-panel-side compare-panel-side--loading" onClick={onSelect}>
        <div className="compare-panel-loading">
          <div className="compare-panel-spinner" />
          <span>Loading {title.toLowerCase()}...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="compare-panel-side compare-panel-side--error" onClick={onSelect}>
        <div className="compare-panel-error">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>Failed to load {title.toLowerCase()}</p>
        </div>
      </div>
    );
  }

  if (!tce) {
    return (
      <div className="compare-panel-side compare-panel-side--empty" onClick={onSelect}>
        <div className="compare-panel-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <p>Select a TCE to compare</p>
        </div>
      </div>
    );
  }

  return (
    <article className="compare-panel-side" onClick={onSelect}>
      {/* Header with TCE ID and label */}
      <header className="compare-panel-header">
        <div className="compare-panel-title-group">
          <h3 className="compare-panel-title">{title.toUpperCase()}</h3>
          <span className="compare-panel-tce-id">{tce.tce_id}</span>
        </div>
        <span className={`compare-panel-label-badge compare-panel-label-badge--${labelName.toLowerCase().replace('/', '-')}`}>
          {labelName === 'AFP/NTP' ? 'AFP / NTP' : labelName}
        </span>
      </header>

      {/* Probability readouts */}
      <section className="compare-panel-probability">
        <div className="compare-probability-row">
          <div className="compare-probability-item compare-probability-item--cnn">
            <span className="compare-probability-label">CNN</span>
            <span className="compare-probability-value">{cnnProb.toFixed(3)}</span>
            <div className="compare-probability-bar">
              <div className="compare-probability-fill" style={{ width: `${cnnProb * 100}%` }} />
            </div>
          </div>
          <div className="compare-probability-item compare-probability-item--baseline">
            <span className="compare-probability-label">BASELINE</span>
            <span className="compare-probability-value">{gbProb.toFixed(3)}</span>
            <div className="compare-probability-bar">
              <div className="compare-probability-fill compare-probability-fill--baseline" style={{ width: `${gbProb * 100}%` }} />
            </div>
          </div>
        </div>
      </section>

      {/* Orbital parameters */}
      <section className="compare-panel-params">
        <div className="compare-params-grid">
          <div className="compare-param">
            <span className="compare-param-label">KEPID</span>
            <span className="compare-param-value">{tce.kepid}</span>
          </div>
          <div className="compare-param">
            <span className="compare-param-label">PERIOD</span>
            <span className="compare-param-value">{formatPeriod(tce.period)}</span>
            <span className="compare-param-unit">d</span>
          </div>
          <div className="compare-param">
            <span className="compare-param-label">DURATION</span>
            <span className="compare-param-value">{tce.duration >= 24 ? `${(tce.duration / 24).toFixed(1)} d` : tce.duration >= 1 ? `${tce.duration.toFixed(1)} h` : `${(tce.duration * 60).toFixed(0)} m`}</span>
          </div>
          <div className="compare-param">
            <span className="compare-param-label">DEPTH</span>
            <span className="compare-param-value">{formatDepth(tce.depth)}</span>
          </div>
          {tce.secondary_eclipse_depth && (
            <div className="compare-param">
              <span className="compare-param-label">SEC ECLIPSE</span>
              <span className="compare-param-value">{formatDepth(tce.secondary_eclipse_depth)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Global View Chart */}
      <section className="compare-panel-chart-section">
        <LightCurveChart
          title="Global View"
          data={globalChartData}
          showSecondaryEclipse={true}
          secondaryEclipsePhase={0.5}
          syncState={syncState}
          onSyncChange={onSyncChange}
        />
      </section>

      {/* Local View Chart */}
      <section className="compare-panel-chart-section">
        <LightCurveChart
          title="Local View"
          data={localChartData}
          showSecondaryEclipse={false}
          syncState={syncState}
          onSyncChange={onSyncChange}
        />
      </section>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────
// Main CompareView Component
// ──────────────────────────────────────────────────────────────

export const CompareView: React.FC<CompareViewProps> = ({
  tag = 'C',
  title = 'COMPARE MODE',
  subtitle = 'Side-by-side TCE comparison',
  className = '',
  cornerColor = 'amber',
  defaultSplit = 'test',
}) => {
  const compareTceIds = useCompareTceIds();
  const addCompare = useAddCompare();
  const clearCompare = useClearCompare();
  const selectTce = useSelectTce();

  // Fetch all TCEs for dropdown options
  const { data: allTces, isLoading: tcesLoading } = useTces({
    split: defaultSplit,
    limit: 5000,
  });

  // Fetch details for the two TCEs being compared
  const [tceIdA, setTceIdA] = useState<string | null>(compareTceIds[0] || null);
  const [tceIdB, setTceIdB] = useState<string | null>(compareTceIds[1] || null);

  const { tceA, tceB, isLoading, isError, refetch } = useCompareTces(tceIdA, tceIdB);

  // Sync state for zoom/pan
  const [syncState, setSyncState] = useState<{
    xDomain: [number, number];
    yDomain: [number, number];
  }>({
    xDomain: [-1, 1],
    yDomain: [0.9, 1.1],
  });

  // Reset sync when TCEs change
  useEffect(() => {
    setSyncState({ xDomain: [-1, 1], yDomain: [0.9, 1.1] });
  }, [tceIdA, tceIdB]);

  // Prepare TCE options for dropdowns
  const tceOptions = useMemo(() => {
    if (!allTces) return [];
    return allTces.map((tce: TCESummary) => ({
      tce_id: tce.tce_id,
      kepid: tce.kepid,
      label: tce.label,
      label_name: tce.label_name,
      cnn_prob: tce.cnn_prob,
      period: tce.period,
      depth: tce.depth,
    }));
  }, [allTces]);

  // Find default confident planet (high prob PC) and confident binary (high prob AFP)
  const [defaultTceA, defaultTceB] = useMemo(() => {
    if (!tceOptions.length) return [null, null] as [string | null, string | null];

    // Confident planet: label=1 (PC), high CNN prob
    const confidentPlanets = tceOptions
      .filter(t => t.label === 1 && t.cnn_prob !== null && t.cnn_prob > 0.9)
      .sort((a, b) => (b.cnn_prob || 0) - (a.cnn_prob || 0));

    // Confident eclipsing binary: label=2 (AFP), high CNN prob (model thinks it's a planet but it's actually AFP)
    const confidentBinaries = tceOptions
      .filter(t => t.label === 2 && t.cnn_prob !== null && t.cnn_prob > 0.9)
      .sort((a, b) => (b.cnn_prob || 0) - (a.cnn_prob || 0));

    return [
      confidentPlanets[0]?.tce_id || null,
      confidentBinaries[0]?.tce_id || null,
    ];
  }, [tceOptions]);

  // Initialize defaults on mount
  useEffect(() => {
    if (!tceIdA && defaultTceA) {
      setTceIdA(defaultTceA);
      addCompare(defaultTceA);
    }
    if (!tceIdB && defaultTceB) {
      setTceIdB(defaultTceB);
      addCompare(defaultTceB);
    }
  }, []); // Only run once on mount

  // Handle TCE selection from dropdown
  const handleSelectA = useCallback((id: string | null) => {
    setTceIdA(id);
    if (id) {
      addCompare(id);
      selectTce(id);
    } else {
      // Remove from compare list if deselected
      const current = compareTceIds.filter(tid => tid !== tceIdA);
      if (current.length !== compareTceIds.length) {
        // Need to update store - but we don't have a direct setter for array
        // We'll just clear and re-add the remaining
        clearCompare();
        current.forEach(tid => addCompare(tid));
      }
    }
  }, [tceIdA, compareTceIds, addCompare, clearCompare, selectTce]);

  const handleSelectB = useCallback((id: string | null) => {
    setTceIdB(id);
    if (id) {
      addCompare(id);
      selectTce(id);
    } else {
      const current = compareTceIds.filter(tid => tid !== tceIdB);
      if (current.length !== compareTceIds.length) {
        clearCompare();
        current.forEach(tid => addCompare(tid));
      }
    }
  }, [tceIdB, compareTceIds, addCompare, clearCompare, selectTce]);

  // Handle sync change (zoom/pan)
  const handleSyncChange = useCallback((xDomain: [number, number], yDomain: [number, number]) => {
    setSyncState({ xDomain, yDomain });
  }, []);

  // Calculate plot width (half of panel width minus margins)
  const plotWidth = 320; // Fixed width for each chart

  // Loading state
  if (tcesLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} compare-view--loading`}
        cornerColor={cornerColor}
      >
        <div className="compare-view__skeleton">
          <div className="compare-view__selectors-skeleton">
            <div className="compare-view__selector-skeleton" />
            <div className="compare-view__selector-skeleton" />
          </div>
          <div className="compare-view__panels-skeleton">
            <div className="compare-view__panel-skeleton" />
            <div className="compare-view__panel-skeleton" />
          </div>
        </div>
      </Panel>
    );
  }

  // Error state
  if (isError) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} compare-view--error`}
        cornerColor="red"
      >
        <div className="compare-view__error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>Failed to load comparison data</p>
          <button className="compare-view__retry-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      tag={tag}
      title={title}
      subtitle={subtitle}
      className={className}
      cornerColor={cornerColor}
    >
      {/* Selector dropdowns */}
      <div className="compare-view__selectors" role="group" aria-label="Select TCEs to compare">
        <TceSelector
          label="TCE A"
          value={tceIdA}
          options={tceOptions}
          onChange={handleSelectA}
          placeholder="Select confident planet (PC)..."
          disabled={tcesLoading}
        />
        <TceSelector
          label="TCE B"
          value={tceIdB}
          options={tceOptions}
          onChange={handleSelectB}
          placeholder="Select confident binary (AFP)..."
          disabled={tcesLoading}
        />
        {(tceIdA || tceIdB) && (
          <button
            type="button"
            className="compare-view__clear-btn"
            onClick={() => {
              setTceIdA(null);
              setTceIdB(null);
              clearCompare();
              selectTce(null);
            }}
            title="Clear comparison"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Default hint */}
      {!tceIdA && !tceIdB && defaultTceA && defaultTceB && (
        <div className="compare-view__default-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span>Defaults: <strong>{defaultTceA}</strong> (confident planet) + <strong>{defaultTceB}</strong> (confident binary)</span>
        </div>
      )}

      {/* Sync indicator */}
      <div className="compare-view__sync-status">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
        <span>Zoom/pan synced between views — use scroll to zoom, drag to pan</span>
      </div>

      {/* Comparison panels */}
      <div className="compare-view__panels">
        <TceDetailPanel
          title="TCE A"
          tce={tceA ?? null}
          isLoading={isLoading && !tceA}
          isError={isError}
          plotWidth={plotWidth}
          syncState={syncState}
          onSyncChange={handleSyncChange}
          onSelect={() => selectTce(tceA?.tce_id || null)}
        />
        <TceDetailPanel
          title="TCE B"
          tce={tceB ?? null}
          isLoading={isLoading && !tceB}
          isError={isError}
          plotWidth={plotWidth}
          syncState={syncState}
          onSyncChange={handleSyncChange}
          onSelect={() => selectTce(tceB?.tce_id || null)}
        />
      </div>

      {/* Empty state when no TCEs selected */}
      {!tceIdA && !tceIdB && tceOptions.length === 0 && (
        <div className="compare-view__empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <p>No TCEs available for comparison</p>
        </div>
      )}
    </Panel>
  );
};

export default CompareView;