/**
 * ROCCurve - ROC (Receiver Operating Characteristic) curve SVG chart
 * Shows CNN and GB (baseline) curves overlaid with diagonal reference line
 * AUC readout for each curve
 * Styled to design system: hairlines, mono ticks, no library themes
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useROCCurves, type ROCCData } from './useROCCurves';
import './ROCCurve.css';

export interface ROCCurveProps {
  /** Data split to display (default: 'test') */
  split?: 'train' | 'val' | 'test';
  /** Show/hide the GB (baseline) curve */
  showBaseline?: boolean;
  /** Custom className */
  className?: string;
}

/** A point on the ROC curve with additional metadata for tooltips */
interface ROCPoint {
  fpr: number;
  tpr: number;
  index: number;
  // SVG coordinates (origin at top-left of plot area)
  x: number;
  y: number;
}

/** Tooltip state for hover interaction */
interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  fpr: number;
  tpr: number;
  modelType: 'cnn' | 'gb';
  auc: number;
}

const MARGIN = { top: 20, right: 80, bottom: 40, left: 50 };

/** Format a number for display with consistent precision */
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/** Find the closest point on a curve to a given x-coordinate (FPR) */
function findNearestPoint(points: ROCPoint[], fpr: number): ROCPoint | null {
  if (points.length === 0) return null;

  let closest = points[0];
  let minDist = Math.abs(points[0].fpr - fpr);

  for (let i = 1; i < points.length; i++) {
    const dist = Math.abs(points[i].fpr - fpr);
    if (dist < minDist) {
      minDist = dist;
      closest = points[i];
    }
  }

  return closest;
}

export const ROCCurve: React.FC<ROCCurveProps> = ({
  split = 'test',
  showBaseline = true,
  className = '',
}) => {
  const { cnn, gb, isLoading, isError, error } = useROCCurves(split);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [hoveredModel, setHoveredModel] = useState<'cnn' | 'gb' | null>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 300 });

  // ResizeObserver to make chart responsive to container size
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setDimensions({
        width: Math.max(rect.width, 200),
        height: Math.max(rect.height, 200),
      });
    };

    // Initial measurement
    updateDimensions();

    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const width = dimensions.width;
  const height = dimensions.height;

  // Transform curve data into chart coordinates
  const chartData = useMemo(() => {
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    const transformCurve = (data: ROCCData | null): ROCPoint[] => {
      if (!data || !data.points.length) return [];

      return data.points.map((p, index) => ({
        fpr: p.fpr,
        tpr: p.tpr,
        index,
        // SVG coordinates (origin at top-left of plot area)
        x: MARGIN.left + p.fpr * plotWidth,
        y: MARGIN.top + (1 - p.tpr) * plotHeight,
      }));
    };

    return {
      cnn: transformCurve(cnn),
      gb: transformCurve(gb),
      plotWidth,
      plotHeight,
    };
  }, [cnn, gb, width, height]);

  // Handle mouse move for tooltip
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // Check if mouse is within plot area
    if (
      mouseX < MARGIN.left ||
      mouseX > MARGIN.left + chartData.plotWidth ||
      mouseY < MARGIN.top ||
      mouseY > MARGIN.top + chartData.plotHeight
    ) {
      setTooltip(null);
      setHoveredModel(null);
      return;
    }

    // Convert mouse X to FPR value
    const fpr = (mouseX - MARGIN.left) / chartData.plotWidth;

    // Find nearest points on both curves
    const cnnPoint = chartData.cnn.length > 0 ? findNearestPoint(chartData.cnn, fpr) : null;
    const gbPoint = chartData.gb.length > 0 ? findNearestPoint(chartData.gb, fpr) : null;

    // Determine which curve is closer to the mouse
    let nearestPoint: ROCPoint | null = null;
    let nearestModel: 'cnn' | 'gb' | null = null;

    if (cnnPoint && gbPoint) {
      const cnnDist = Math.abs(cnnPoint.fpr - fpr);
      const gbDist = Math.abs(gbPoint.fpr - fpr);
      if (cnnDist <= gbDist) {
        nearestPoint = cnnPoint;
        nearestModel = 'cnn';
      } else {
        nearestPoint = gbPoint;
        nearestModel = 'gb';
      }
    } else if (cnnPoint) {
      nearestPoint = cnnPoint;
      nearestModel = 'cnn';
    } else if (gbPoint) {
      nearestPoint = gbPoint;
      nearestModel = 'gb';
    }

    if (nearestPoint && nearestModel) {
      const data = nearestModel === 'cnn' ? cnn : gb;
      setTooltip({
        visible: true,
        x: nearestPoint.x,
        y: nearestPoint.y,
        fpr: nearestPoint.fpr,
        tpr: nearestPoint.tpr,
        modelType: nearestModel,
        auc: data?.auc ?? 0,
      });
      setHoveredModel(nearestModel);
    } else {
      setTooltip(null);
      setHoveredModel(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    setHoveredModel(null);
  };

  // Generate SVG path data for a curve
  const getPathData = (points: ROCPoint[]): string => {
    if (points.length < 2) return '';

    const pathPoints = points.map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      return `L ${p.x} ${p.y}`;
    });

    return pathPoints.join(' ');
  };

  // Generate gridlines
  const gridlines = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; className: string }> = [];
    const { plotWidth, plotHeight } = chartData;

    // Horizontal gridlines (TPR axis)
    for (let i = 0; i <= 5; i++) {
      const tpr = i / 5;
      const y = MARGIN.top + (1 - tpr) * plotHeight;
      lines.push({
        x1: MARGIN.left,
        y1: y,
        x2: MARGIN.left + plotWidth,
        y2: y,
        className: i === 0 || i === 5 ? 'gridline--major' : 'gridline--minor',
      });
    }

    // Vertical gridlines (FPR axis)
    for (let i = 0; i <= 5; i++) {
      const fpr = i / 5;
      const x = MARGIN.left + fpr * plotWidth;
      lines.push({
        x1: x,
        y1: MARGIN.top,
        x2: x,
        y2: MARGIN.top + plotHeight,
        className: i === 0 || i === 5 ? 'gridline--major' : 'gridline--minor',
      });
    }

    return lines;
  }, [chartData]);

  // Generate axis ticks
  const xTicks = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const fpr = i / 5;
      const x = MARGIN.left + fpr * chartData.plotWidth;
      return { value: fpr, x, label: formatNumber(fpr, 1) };
    });
  }, [chartData.plotWidth]);

  const yTicks = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const tpr = 1 - i / 5;
      const y = MARGIN.top + (1 - tpr) * chartData.plotHeight;
      return { value: tpr, y, label: formatNumber(tpr, 1) };
    });
  }, [chartData.plotHeight]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`roccurve ${className}`} ref={containerRef} style={{ width: '100%', height: '100%' }} role="status" aria-label="Loading ROC curve">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="roccurve__svg">
          {/* Show skeleton grid while loading */}
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`roccurve__gridline ${line.className} roccurve__gridline--skeleton`}
            />
          ))}
        </svg>
      </div>
    );
  }

  // Error state - show real error message
  if (isError) {
    const errorMessage = error?.message || 'Failed to load ROC curve';
    return (
      <div className={`roccurve ${className}`} ref={containerRef} style={{ width: '100%', height: '100%' }} role="alert">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="roccurve__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="roccurve__error"
            fill="var(--semantic-red)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            NO DATA: {errorMessage}
          </text>
        </svg>
      </div>
    );
  }

  // No data state
  if (!cnn && !gb) {
    return (
      <div className={`roccurve ${className}`} ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="roccurve__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="roccurve__empty"
            fill="var(--text-dim)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            No curve data available
          </text>
        </svg>
      </div>
    );
  }

  const cnnPath = getPathData(chartData.cnn);
  const gbPath = getPathData(chartData.gb);

  return (
    <div className={`roccurve ${className}`} ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="roccurve__svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`ROC curve for ${split} split. CNN AUC: ${cnn?.auc.toFixed(3) ?? 'N/A'}, GB AUC: ${gb?.auc.toFixed(3) ?? 'N/A'}`}
      >
        {/* Defs for gradients and markers */}
        <defs>
          {/* CNN curve gradient */}
          <linearGradient id="roccurve-gradient-cnn" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.6" />
            <stop offset="25%" stopColor="var(--text-secondary)" stopOpacity="0.8" />
            <stop offset="50%" stopColor="var(--accent-orange)" stopOpacity="0.9" />
            <stop offset="75%" stopColor="var(--semantic-amber)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--semantic-amber)" stopOpacity="1" />
          </linearGradient>

          {/* GB curve gradient */}
          <linearGradient id="roccurve-gradient-gb" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--text-secondary)" stopOpacity="0.6" />
          </linearGradient>

          {/* Tooltip background filter */}
          <filter id="roccurve-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--bg-canvas)" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Gridlines */}
        <g className="roccurve__gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`roccurve__gridline ${line.className}`}
            />
          ))}
        </g>

        {/* Diagonal reference line (y=x) - drawn behind curves */}
        <g className="roccurve__reference" aria-hidden="true">
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + chartData.plotHeight}
            x2={MARGIN.left + chartData.plotWidth}
            y2={MARGIN.top}
            className="roccurve__reference-line"
          />
        </g>

        {/* Axes */}
        <g className="roccurve__axes" aria-hidden="true">
          {/* X axis (FPR) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + chartData.plotHeight}
            x2={MARGIN.left + chartData.plotWidth}
            y2={MARGIN.top + chartData.plotHeight}
            className="roccurve__axis roccurve__axis--x"
          />
          {/* Y axis (TPR) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + chartData.plotHeight}
            className="roccurve__axis roccurve__axis--y"
          />
        </g>

        {/* X axis ticks and labels */}
        <g className="roccurve__x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={MARGIN.top + chartData.plotHeight}
                x2={tick.x}
                y2={MARGIN.top + chartData.plotHeight + 6}
                className={`roccurve__tick ${i === 0 || i === 5 ? 'roccurve__tick--major' : ''}`}
              />
              <text
                x={tick.x}
                y={MARGIN.top + chartData.plotHeight + 18}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="roccurve__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Y axis ticks and labels */}
        <g className="roccurve__y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={MARGIN.left - 6}
                y1={tick.y}
                x2={MARGIN.left}
                y2={tick.y}
                className={`roccurve__tick ${i === 0 || i === 5 ? 'roccurve__tick--major' : ''}`}
              />
              <text
                x={MARGIN.left - 10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="roccurve__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <g className="roccurve__axis-labels" aria-hidden="true">
          {/* X axis label */}
          <text
            x={MARGIN.left + chartData.plotWidth / 2}
            y={height - 6}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            className="roccurve__axis-label"
          >
            FALSE POSITIVE RATE
          </text>
          {/* Y axis label */}
          <text
            x={14}
            y={MARGIN.top + chartData.plotHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, 14, ${MARGIN.top + chartData.plotHeight / 2})`}
            className="roccurve__axis-label"
          >
            TRUE POSITIVE RATE
          </text>
        </g>

        {/* GB (Baseline) curve - drawn first so it's behind CNN */}
        {showBaseline && gb && chartData.gb.length > 1 && (
          <g className="roccurve__curve-group roccurve__curve-group--gb">
            <path
              d={gbPath}
              className="roccurve__curve roccurve__curve--gb"
              stroke="url(#roccurve-gradient-gb)"
              fill="none"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: hoveredModel === 'gb' ? 1 : 0.7 } as React.CSSProperties}
            />
            {/* Highlight point on hover */}
            {tooltip && tooltip.modelType === 'gb' && (
              <circle
                cx={tooltip.x}
                cy={tooltip.y}
                r={5}
                className="roccurve__hover-point roccurve__hover-point--gb"
                fill="var(--text-secondary)"
                stroke="var(--bg-panel)"
                strokeWidth="2"
              />
            )}
          </g>
        )}

        {/* CNN curve - drawn on top */}
        {cnn && chartData.cnn.length > 1 && (
          <g className="roccurve__curve-group roccurve__curve-group--cnn">
            <path
              d={cnnPath}
              className="roccurve__curve roccurve__curve--cnn"
              stroke="url(#roccurve-gradient-cnn)"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: hoveredModel === 'cnn' ? 1 : 0.9 } as React.CSSProperties}
            />
            {/* Highlight point on hover */}
            {tooltip && tooltip.modelType === 'cnn' && (
              <circle
                cx={tooltip.x}
                cy={tooltip.y}
                r={5}
                className="roccurve__hover-point roccurve__hover-point--cnn"
                fill="var(--semantic-amber)"
                stroke="var(--bg-panel)"
                strokeWidth="2"
              />
            )}
          </g>
        )}

        {/* Metrics readouts in top-right corner */}
        <g className="roccurve__metrics" aria-hidden="true">
          {cnn && (
            <g className="roccurve__metric-group roccurve__metric-group--cnn" transform={`translate(${MARGIN.left + chartData.plotWidth + 10}, ${MARGIN.top})`}>
              <text x="0" y="0" className="roccurve__metric-label">CNN</text>
              <text x="0" y="16" className="roccurve__metric-value">AUC: {formatNumber(cnn.auc, 3)}</text>
            </g>
          )}
          {gb && showBaseline && (
            <g className="roccurve__metric-group roccurve__metric-group--gb" transform={`translate(${MARGIN.left + chartData.plotWidth + 10}, ${MARGIN.top + (cnn ? 40 : 0)})`}>
              <text x="0" y="0" className="roccurve__metric-label">BASELINE</text>
              <text x="0" y="16" className="roccurve__metric-value">AUC: {formatNumber(gb.auc, 3)}</text>
            </g>
          )}
        </g>

        {/* Tooltip */}
        {tooltip && (
          <g className="roccurve__tooltip" filter="url(#roccurve-tooltip-shadow)">
            <rect
              x={tooltip.x + 12}
              y={tooltip.y - 42}
              width={150}
              height={46}
              rx={3}
              className="roccurve__tooltip-bg"
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 30}
              className="roccurve__tooltip-title"
              fill={tooltip.modelType === 'cnn' ? 'var(--semantic-amber)' : 'var(--text-secondary)'}
            >
              {tooltip.modelType === 'cnn' ? 'CNN' : 'BASELINE'}
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 16}
              className="roccurve__tooltip-row"
            >
              <tspan className="roccurve__tooltip-label">FPR:</tspan>
              <tspan className="roccurve__tooltip-value" dx="4">{formatNumber(tooltip.fpr, 3)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 2}
              className="roccurve__tooltip-row"
            >
              <tspan className="roccurve__tooltip-label">TPR:</tspan>
              <tspan className="roccurve__tooltip-value" dx="4">{formatNumber(tooltip.tpr, 3)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y + 12}
              className="roccurve__tooltip-row roccurve__tooltip-row--metrics"
            >
              <tspan className="roccurve__tooltip-label">AUC:</tspan>
              <tspan className="roccurve__tooltip-value" dx="4">{formatNumber(tooltip.auc, 3)}</tspan>
            </text>
          </g>
        )}

        {/* Split indicator */}
        <text
          x={width - MARGIN.right + 10}
          y={height - 8}
          textAnchor="end"
          dominantBaseline="alphabetic"
          className="roccurve__split-label"
          fill="var(--text-dim)"
          fontSize="var(--font-size-xs)"
        >
          {split.toUpperCase()} SPLIT
        </text>
      </svg>
    </div>
  );
};

export default ROCCurve;