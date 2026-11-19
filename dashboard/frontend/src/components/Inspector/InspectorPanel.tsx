/**
 * InspectorPanel - Slide-in panel from right showing TCE detail
 * Triggered when store.selectedTceId is set
 * - Global view line plot (full light curve, transit centered)
 * - Local view line plot (zoomed transit window)
 * - Model probability large readout + baseline probability
 * - True label badge (PC=amber, AFP/NTP=red)
 * - Period, duration, depth readouts
 * - Mark secondary-eclipse window (phase +/-0.5) on global view
 * - Close button, click outside to dismiss
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSelectedTceId, useSelectTce } from '../../store/useAppStore';
import { useTceDetail, type TCEDetail } from './useTceDetail';
import './InspectorPanel.css';

export interface InspectorPanelProps {
  /** Custom className */
  className?: string;
  /** Width of the panel in pixels (default: 400) */
  width?: number;
  /** Callback when panel closes */
  onClose?: () => void;
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

const PANEL_WIDTH = 400;
const CHART_HEIGHT = 200;
const MARGIN = { top: 20, right: 16, bottom: 36, left: 50 };

/** Format a number for display with consistent precision */
function formatNumber(value: number, decimals = 3): string {
  if (value >= 1000) return value.toExponential(2);
  if (value >= 1) return value.toFixed(decimals);
  if (value >= 0.001) return value.toFixed(4);
  return value.toExponential(2);
}

/** Format duration in hours */
function formatDuration(hours: number): string {
  if (hours >= 24) return `${(hours / 24).toFixed(1)} d`;
  if (hours >= 1) return `${hours.toFixed(1)} h`;
  return `${(hours * 60).toFixed(0)} m`;
}

/** Format depth in ppm */
function formatDepth(depth: number): string {
  const ppm = depth * 1e6;
  if (ppm >= 1000) return `${(ppm / 1000).toFixed(1)} ppt`;
  return `${ppm.toFixed(0)} ppm`;
}

/** Format period in days */
function formatPeriod(days: number): string {
  if (days >= 365) return `${(days / 365).toFixed(2)} yr`;
  return `${days.toFixed(3)} d`;
}

/** Find min/max of array */
function getMinMax(arr: number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

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
  // Convert flux to phase
  // The array represents phase from -0.5 to +0.5 (global) or narrower (local)
  // For global view: assume uniform sampling across ~2 periods centered on transit
  // For local view: assume uniform sampling across ~2x duration

  const n = fluxArray.length;
  let phaseMin: number, phaseMax: number;

  if (isGlobal) {
    // Global view: show ~2 periods worth of phase
    // The transit is at phase 0 (or t0), so we show from -period to +period
    // But the array is centered on the transit
    phaseMin = -1.0; // ~1 period before transit
    phaseMax = 1.0;  // ~1 period after transit
  } else {
    // Local view: zoom to ~2x transit duration
    const durationInPhase = duration / 24 / period; // duration in days / period in days
    phaseMin = -durationInPhase * 2;
    phaseMax = durationInPhase * 2;
  }

  const points: CurvePoint[] = fluxArray.map((flux, i) => {
    const phase = phaseMin + (i / (n - 1)) * (phaseMax - phaseMin);
    return { x: 0, y: 0, phase, flux };
  });

  const [fluxMin, fluxMax] = getMinMax(fluxArray);
  const fluxRange = fluxMax - fluxMin;
  const padding = fluxRange * 0.1;
  const yMin = fluxMin - padding;
  const yMax = fluxMax + padding;

  const xScale = (phase: number) => MARGIN.left + ((phase - phaseMin) / (phaseMax - phaseMin)) * plotWidth;
  const yScale = (flux: number) => MARGIN.top + (1 - (flux - yMin) / (yMax - yMin)) * plotHeight;

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
    transitDuration: xScale(duration / 24 / period) - MARGIN.left, // duration in phase units
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
    const y = MARGIN.top + frac * plotHeight;
    lines.push({
      x1: MARGIN.left,
      y1: y,
      x2: MARGIN.left + plotWidth,
      y2: y,
      className: i === 0 || i === 4 ? 'gridline--major' : 'gridline--minor',
    });
  }

  // Vertical gridlines
  const xTicks = [-1, -0.5, 0, 0.5, 1].filter(t => t >= xMin && t <= xMax);
  for (const tick of xTicks) {
    const x = MARGIN.left + ((tick - xMin) / (xMax - xMin)) * plotWidth;
    lines.push({
      x1: x,
      y1: MARGIN.top,
      x2: x,
      y2: MARGIN.top + plotHeight,
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
    x: MARGIN.left + ((tick - chart.xMin) / (chart.xMax - chart.xMin)) * chart.plotWidth,
    label: tick === 0 ? '0' : tick.toFixed(1),
  }));
}

function generateYTicks(chart: ChartData) {
  return Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const flux = chart.yMin + (1 - frac) * (chart.yMax - chart.yMin);
    const y = MARGIN.top + frac * chart.plotHeight;
    return { value: flux, y, label: formatNumber(flux, 4) };
  });
}

/** Label component for readout display */
function Readout({ label, value, unit = '', className = '' }: {
  label: string;
  value: string | number;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={`inspector__readout ${className}`}>
      <span className="inspector__readout-label">{label}</span>
      <span className="inspector__readout-value">
        <span className="inspector__readout-number">{value}</span>
        {unit && <span className="inspector__readout-unit">{unit}</span>}
      </span>
    </div>
  );
}

/** Label badge for true label */
function LabelBadge({ labelName }: { labelName: TCEDetail['label_name'] }) {
  const badgeClass = `inspector__label-badge inspector__label-badge--${labelName.toLowerCase().replace('/', '-')}`;
  const displayLabel = labelName === 'AFP/NTP' ? 'AFP / NTP' : labelName;

  return (
    <span className={badgeClass}>
      {displayLabel}
    </span>
  );
}

/** Light curve chart component */
function LightCurveChart({
  title,
  data,
  showSecondaryEclipse = false,
  secondaryEclipsePhase = 0.5,
  className = '',
}: {
  title: string;
  data: ChartData | null;
  showSecondaryEclipse?: boolean;
  secondaryEclipsePhase?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; phase: number; flux: number } | null>(null);

  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !data) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is within plot area
    if (
      mouseX < MARGIN.left ||
      mouseX > MARGIN.left + data.plotWidth ||
      mouseY < MARGIN.top ||
      mouseY > MARGIN.top + data.plotHeight
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

  if (!data) {
    return (
      <div className={`inspector__chart ${className}`} style={{ height: CHART_HEIGHT }} role="status" aria-label="Loading chart">
        <svg width="100%" height="100%" viewBox={`0 0 ${CHART_HEIGHT + MARGIN.left + MARGIN.right} ${CHART_HEIGHT}`} className="inspector__chart-svg">
          <text
            x={(CHART_HEIGHT + MARGIN.left + MARGIN.right) / 2}
            y={CHART_HEIGHT / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="inspector__chart-empty"
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
  const secEclipseX1 = MARGIN.left + ((-secondaryEclipsePhase - data.xMin) / (data.xMax - data.xMin)) * data.plotWidth;
  const secEclipseX2 = MARGIN.left + ((secondaryEclipsePhase - data.xMin) / (data.xMax - data.xMin)) * data.plotWidth;

  return (
    <div className={`inspector__chart ${className}`} style={{ height: CHART_HEIGHT }}>
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${data.plotWidth + MARGIN.left + MARGIN.right} ${CHART_HEIGHT}`}
        className="inspector__chart-svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`${title} light curve`}
      >
        <defs>
          <linearGradient id="inspector-gradient-curve" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.5" />
            <stop offset="50%" stopColor="var(--semantic-amber)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--text-dim)" stopOpacity="0.5" />
          </linearGradient>

          <filter id="inspector-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--bg-canvas)" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Gridlines */}
        <g className="inspector__gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`inspector__gridline ${line.className}`}
            />
          ))}
        </g>

        {/* Secondary eclipse window (global view only) */}
        {showSecondaryEclipse && secEclipseX1 >= MARGIN.left && secEclipseX2 <= MARGIN.left + data.plotWidth && (
          <g className="inspector__secondary-eclipse" aria-hidden="true">
            <rect
              x={secEclipseX1}
              y={MARGIN.top}
              width={secEclipseX2 - secEclipseX1}
              height={data.plotHeight}
              className="inspector__secondary-eclipse-window"
              fill="var(--semantic-red)"
              opacity="0.08"
            />
            <line
              x1={secEclipseX1}
              y1={MARGIN.top}
              x2={secEclipseX1}
              y2={MARGIN.top + data.plotHeight}
              className="inspector__secondary-eclipse-edge"
              stroke="var(--semantic-red)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <line
              x1={secEclipseX2}
              y1={MARGIN.top}
              x2={secEclipseX2}
              y2={MARGIN.top + data.plotHeight}
              className="inspector__secondary-eclipse-edge"
              stroke="var(--semantic-red)"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
            />
            <text
              x={(secEclipseX1 + secEclipseX2) / 2}
              y={MARGIN.top - 4}
              textAnchor="middle"
              dominantBaseline="alphabetic"
              className="inspector__secondary-eclipse-label"
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
          <g className="inspector__transit-window" aria-hidden="true">
            <rect
              x={data.transitCenter - data.transitDuration}
              y={MARGIN.top}
              width={data.transitDuration * 2}
              height={data.plotHeight}
              className="inspector__transit-window-bg"
              fill="var(--semantic-amber)"
              opacity="0.08"
            />
          </g>
        )}

        {/* Axes */}
        <g className="inspector__axes" aria-hidden="true">
          {/* X axis */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + data.plotHeight}
            x2={MARGIN.left + data.plotWidth}
            y2={MARGIN.top + data.plotHeight}
            className="inspector__axis inspector__axis--x"
          />
          {/* Y axis */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + data.plotHeight}
            className="inspector__axis inspector__axis--y"
          />
        </g>

        {/* X axis ticks and labels */}
        <g className="inspector__x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={MARGIN.top + data.plotHeight}
                x2={tick.x}
                y2={MARGIN.top + data.plotHeight + 6}
                className={`inspector__tick ${tick.value === 0 || Math.abs(tick.value) === 1 ? 'inspector__tick--major' : ''}`}
              />
              <text
                x={tick.x}
                y={MARGIN.top + data.plotHeight + 16}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="inspector__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Y axis ticks and labels */}
        <g className="inspector__y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={MARGIN.left - 6}
                y1={tick.y}
                x2={MARGIN.left}
                y2={tick.y}
                className={`inspector__tick ${i === 0 || i === 4 ? 'inspector__tick--major' : ''}`}
              />
              <text
                x={MARGIN.left - 10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="inspector__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <g className="inspector__axis-labels" aria-hidden="true">
          <text
            x={MARGIN.left + data.plotWidth / 2}
            y={CHART_HEIGHT - 4}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            className="inspector__axis-label"
          >
            PHASE
          </text>
          <text
            x={12}
            y={MARGIN.top + data.plotHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, 12, ${MARGIN.top + data.plotHeight / 2})`}
            className="inspector__axis-label"
          >
            NORMALIZED FLUX
          </text>
        </g>

        {/* Transit center line */}
        <line
          x1={data.transitCenter}
          y1={MARGIN.top}
          x2={data.transitCenter}
          y2={MARGIN.top + data.plotHeight}
          className="inspector__transit-center"
          stroke="var(--semantic-amber)"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.5"
        />

        {/* Light curve */}
        <path
          d={path}
          className="inspector__curve"
          stroke="url(#inspector-gradient-curve)"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Chart title */}
        <text
          x={MARGIN.left}
          y={MARGIN.top - 6}
          textAnchor="start"
          dominantBaseline="alphabetic"
          className="inspector__chart-title"
          fill="var(--text-secondary)"
          fontSize="var(--font-size-xs)"
          fontFamily="var(--font-heading)"
        >
          {title.toUpperCase()}
        </text>

        {/* Tooltip */}
        {tooltip && (
          <g className="inspector__tooltip" filter="url(#inspector-tooltip-shadow)">
            <rect
              x={tooltip.x + 12}
              y={tooltip.y - 48}
              width={150}
              height={42}
              rx={3}
              className="inspector__tooltip-bg"
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 36}
              className="inspector__tooltip-title"
              fill="var(--text-primary)"
              fontSize="var(--font-size-xs)"
            >
              PHASE {tooltip.phase.toFixed(3)}
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 22}
              className="inspector__tooltip-row"
              fontSize="var(--font-size-xs)"
            >
              <tspan className="inspector__tooltip-label">FLUX:</tspan>
              <tspan className="inspector__tooltip-value" dx="4">{formatNumber(tooltip.flux, 5)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 8}
              className="inspector__tooltip-row"
              fontSize="var(--font-size-xs)"
            >
              <tspan className="inspector__tooltip-label">DELTA:</tspan>
              <tspan className="inspector__tooltip-value" dx="4">{formatNumber((tooltip.flux - 1) * 1e6, 0)} ppm</tspan>
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  className = '',
  width = PANEL_WIDTH,
  onClose,
}) => {
  const selectedTceId = useSelectedTceId();
  const selectTce = useSelectTce();
  const { data: tce, isLoading, isError } = useTceDetail(selectedTceId);

  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Track open state based on selection
  useEffect(() => {
    if (selectedTceId) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [selectedTceId]);

  // Handle click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        overlayRef.current &&
        !overlayRef.current.contains(event.target as Node)
      ) {
        selectTce(null);
        onClose?.();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = '';
    };
  }, [isOpen, selectTce, onClose]);

  // Handle escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        selectTce(null);
        onClose?.();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, selectTce, onClose]);

  // Transform light curves for charts (must be before early return for Rules of Hooks)
  const globalChartData = useMemo(() => {
    if (!tce || !tce.global_view.length) return null;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    return transformLightCurve(
      tce.global_view,
      tce.t0_bkjd,
      tce.period,
      tce.duration,
      plotWidth,
      CHART_HEIGHT - MARGIN.top - MARGIN.bottom,
      true
    );
  }, [tce, width]);

  const localChartData = useMemo(() => {
    if (!tce || !tce.local_view.length) return null;
    const plotWidth = width - MARGIN.left - MARGIN.right;
    return transformLightCurve(
      tce.local_view,
      tce.t0_bkjd,
      tce.period,
      tce.duration,
      plotWidth,
      CHART_HEIGHT - MARGIN.top - MARGIN.bottom,
      false
    );
  }, [tce, width]);

  if (!isOpen) return null;

  const handleClose = () => {
    selectTce(null);
    onClose?.();
  };

  const cnnProb = tce?.cnn_prob ?? 0;
  const gbProb = tce?.gb_prob ?? 0;
  const labelName = tce?.label_name ?? 'NTP';

  return (
    <>
      {/* Overlay for click-outside detection */}
      <div
        ref={overlayRef}
        className="inspector__overlay"
        aria-hidden="true"
      />

      {/* Slide-in panel */}
      <aside
        ref={panelRef}
        className={`inspector__panel ${className}`}
        style={{ width: `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-label="TCE Inspector"
      >
        {/* Header */}
        <header className="inspector__header">
          <div className="inspector__header-left">
            <h2 className="inspector__title">INSPECTOR</h2>
            {tce && (
              <span className="inspector__tce-id">{tce.tce_id}</span>
            )}
          </div>
          <button
            className="inspector__close-btn"
            onClick={handleClose}
            aria-label="Close inspector"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <div className="inspector__content">
          {/* Loading state */}
          {isLoading && (
            <div className="inspector__loading" role="status" aria-label="Loading TCE detail">
              <div className="inspector__loading-spinner" />
              <span className="inspector__loading-text">Loading TCE detail...</span>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="inspector__error" role="alert">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>Failed to load TCE detail</p>
              <button className="inspector__retry-btn" onClick={() => selectTce(selectedTceId)}>
                Retry
              </button>
            </div>
          )}

          {/* TCE Data */}
          {tce && !isLoading && !isError && (
            <React.Fragment>
              {/* Model Probability Section */}
              <section className="inspector__section inspector__section--probability">
                <h3 className="inspector__section-title">MODEL PROBABILITY</h3>

                <div className="inspector__probability-row">
                  <div className="inspector__probability-item inspector__probability-item--cnn">
                    <span className="inspector__probability-label">CNN</span>
                    <span className="inspector__probability-value">
                      {cnnProb.toFixed(3)}
                    </span>
                    <div className="inspector__probability-bar">
                      <div className="inspector__probability-fill" style={{ width: `${cnnProb * 100}%` }} />
                    </div>
                  </div>

                  <div className="inspector__probability-item inspector__probability-item--baseline">
                    <span className="inspector__probability-label">BASELINE</span>
                    <span className="inspector__probability-value">
                      {gbProb.toFixed(3)}
                    </span>
                    <div className="inspector__probability-bar">
                      <div className="inspector__probability-fill inspector__probability-fill--baseline" style={{ width: `${gbProb * 100}%` }} />
                    </div>
                  </div>
                </div>

                {/* True Label Badge */}
                <div className="inspector__label-row">
                  <span className="inspector__label-title">TRUE LABEL</span>
                  <LabelBadge labelName={labelName} />
                </div>
              </section>

              {/* Orbital Parameters */}
              <section className="inspector__section inspector__section--params">
                <h3 className="inspector__section-title">ORBITAL PARAMETERS</h3>
                <div className="inspector__params-grid">
                  <Readout label="KEPID" value={tce.kepid} />
                  <Readout label="PERIOD" value={formatPeriod(tce.period)} unit="d" />
                  <Readout label="DURATION" value={formatDuration(tce.duration)} />
                  <Readout label="DEPTH" value={formatDepth(tce.depth)} />
                  {tce.secondary_eclipse_depth && (
                    <Readout label="SEC ECLIPSE" value={formatDepth(tce.secondary_eclipse_depth)} />
                  )}
                  <Readout label="T0 (BKJD)" value={formatNumber(tce.t0_bkjd, 3)} />
                </div>
              </section>

              {/* Global View Chart */}
              <section className="inspector__section inspector__section--chart">
                <LightCurveChart
                  title="Global View"
                  data={globalChartData}
                  showSecondaryEclipse={true}
                  secondaryEclipsePhase={0.5}
                />
              </section>

              {/* Local View Chart */}
              <section className="inspector__section inspector__section--chart">
                <LightCurveChart
                  title="Local View"
                  data={localChartData}
                  showSecondaryEclipse={false}
                />
              </section>
            </React.Fragment>
          )}
        </div>
      </aside>
    </>
  );
};

export default InspectorPanel;