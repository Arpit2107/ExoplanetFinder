/**
 * SecondaryEclipseScatter - Model probability vs secondary eclipse depth scatter
 * Shows how binaries with a second dip fool the model
 * Binary dip annotation for points with depth > threshold
 * Styled to design system: hairlines, mono ticks, no library themes
 */

import React, { useState, useMemo, useRef } from 'react';
import { useScatterEclipse, type ScatterEclipsePoint, BINARY_ECLIPSE_THRESHOLD } from './useScatterEclipse';
import './SecondaryEclipseScatter.css';

export interface SecondaryEclipseScatterProps {
  /** Data split to display (default: 'test') */
  split?: 'train' | 'val' | 'test';
  /** Model type to display (default: 'cnn') */
  model?: 'cnn' | 'gb';
  /** Maximum number of points to fetch (default: 2000) */
  limit?: number;
  /** Chart width in pixels (default: full container width) */
  width?: number;
  /** Chart height in pixels (default: 300) */
  height?: number;
  /** Custom className */
  className?: string;
  /** Override the binary eclipse threshold (default: 0.001) */
  binaryThreshold?: number;
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MARGIN = { top: 20, right: 120, bottom: 40, left: 50 };

/** Format a number for display with consistent precision */
function formatNumber(value: number, decimals = 3): string {
  return value.toFixed(decimals);
}

/** Format scientific notation for small numbers */
function formatScientific(value: number): string {
  if (value === 0) return '0';
  if (value < 0.001) return value.toExponential(1);
  return value.toFixed(4);
}

export const SecondaryEclipseScatter: React.FC<SecondaryEclipseScatterProps> = ({
  split = 'test',
  model = 'cnn',
  limit = 2000,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className = '',
  binaryThreshold = BINARY_ECLIPSE_THRESHOLD,
}) => {
  const { data, isLoading, isError } = useScatterEclipse(split, model, limit);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    point: ScatterEclipsePoint;
  } | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<ScatterEclipsePoint | null>(null);

  // Transform data into chart coordinates
  const chartData = useMemo(() => {
    if (!data) return null;

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    // X scale: probability 0-1
    const xScale = (prob: number) => MARGIN.left + prob * plotWidth;

    // Y scale: log scale for secondary eclipse depth
    // Use log10 scale for better visualization of small depths
    const yMin = Math.log10(Math.max(1e-6, data.yDomain[0]));
    const yMax = Math.log10(Math.max(1e-3, data.yDomain[1]));
    const yScale = (depth: number) => {
      if (depth <= 0) return MARGIN.top + plotHeight;
      const logDepth = Math.log10(Math.max(1e-6, depth));
      return MARGIN.top + (1 - (logDepth - yMin) / (yMax - yMin)) * plotHeight;
    };

    // Compute coordinates for each point
    const pointsWithCoords = data.points.map((point): ScatterEclipsePoint => ({
      ...point,
      x: xScale(point.probability),
      y: yScale(point.secondaryEclipseDepth),
    }));

    return {
      ...data,
      plotWidth,
      plotHeight,
      xScale,
      yScale,
      points: pointsWithCoords,
      yMin,
      yMax,
    };
  }, [data, width, height, binaryThreshold]);

  // Handle mouse move for tooltip
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !chartData) return;

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
      setHoveredPoint(null);
      return;
    }

    // Find nearest point
    let nearestPoint: ScatterEclipsePoint | null = null;
    let minDist = Infinity;

    for (const point of chartData.points) {
      const dist = Math.hypot(point.x - mouseX, point.y - mouseY);
      if (dist < minDist && dist < 20) { // 20px hit radius
        minDist = dist;
        nearestPoint = point;
      }
    }

    if (nearestPoint) {
      setTooltip({
        visible: true,
        x: nearestPoint.x,
        y: nearestPoint.y,
        point: nearestPoint,
      });
      setHoveredPoint(nearestPoint);
    } else {
      setTooltip(null);
      setHoveredPoint(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    setHoveredPoint(null);
  };

  // Generate gridlines
  const gridlines = useMemo(() => {
    if (!chartData) return [];

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; className: string }> = [];
    const { plotWidth, plotHeight, yScale } = chartData;

    // Horizontal gridlines (log scale)
    const yTicks = [1e-4, 1e-3, 1e-2, 1e-1];
    for (const tickVal of yTicks) {
      const y = yScale(tickVal);
      lines.push({
        x1: MARGIN.left,
        y1: y,
        x2: MARGIN.left + plotWidth,
        y2: y,
        className: 'gridline--minor',
      });
    }
    // Major gridlines at axis boundaries
    lines.push({
      x1: MARGIN.left,
      y1: MARGIN.top,
      x2: MARGIN.left + plotWidth,
      y2: MARGIN.top,
      className: 'gridline--major',
    });
    lines.push({
      x1: MARGIN.left,
      y1: MARGIN.top + plotHeight,
      x2: MARGIN.left + plotWidth,
      y2: MARGIN.top + plotHeight,
      className: 'gridline--major',
    });

    // Vertical gridlines (probability 0, 0.25, 0.5, 0.75, 1)
    for (let i = 0; i <= 4; i++) {
      const prob = i / 4;
      const x = MARGIN.left + prob * plotWidth;
      lines.push({
        x1: x,
        y1: MARGIN.top,
        x2: x,
        y2: MARGIN.top + plotHeight,
        className: i === 0 || i === 4 ? 'gridline--major' : 'gridline--minor',
      });
    }

    return lines;
  }, [chartData]);

  // Generate axis ticks
  const xTicks = useMemo(() => {
    if (!chartData) return [];
    return [0, 0.25, 0.5, 0.75, 1].map(prob => ({
      value: prob,
      x: MARGIN.left + prob * chartData.plotWidth,
      label: formatNumber(prob, 2),
    }));
  }, [chartData]);

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    const tickValues = [1e-4, 1e-3, 1e-2, 1e-1];
    return tickValues.map(val => ({
      value: val,
      y: chartData.yScale(val),
      label: formatScientific(val),
    }));
  }, [chartData]);

  // Binary threshold line position
  const thresholdY = chartData ? chartData.yScale(binaryThreshold) : 0;

  // Loading state
  if (isLoading) {
    return (
      <div className={`sececlip ${className}`} style={{ width, height }} role="status" aria-label="Loading scatter plot">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sececlip__svg">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`sececlip__gridline ${line.className} sececlip__gridline--skeleton`}
            />
          ))}
        </svg>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={`sececlip ${className}`} style={{ width, height }} role="alert">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sececlip__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="sececlip__error"
            fill="var(--semantic-red)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            Failed to load scatter plot
          </text>
        </svg>
      </div>
    );
  }

  // No data state
  if (!chartData) {
    return (
      <div className={`sececlip ${className}`} style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sececlip__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="sececlip__empty"
            fill="var(--text-dim)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            No scatter data available
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={`sececlip ${className}`} style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="sececlip__svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`
          Secondary eclipse depth vs model probability for ${split} split (${model.toUpperCase()}).
          ${chartData.totalPoints} points.
          Planets: ${chartData.planetCount}, False positives: ${chartData.notPlanetCount}.
          Binary suspects (depth > ${binaryThreshold}): ${chartData.binarySuspectCount}.
        `}
      >
        {/* Defs for gradients and markers */}
        <defs>
          {/* Planet candidate gradient - amber */}
          <radialGradient id="sececlip-gradient-pc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--semantic-amber)" stopOpacity="1" />
            <stop offset="70%" stopColor="var(--semantic-amber)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--semantic-amber-dim)" stopOpacity="0.3" />
          </radialGradient>

          {/* False positive gradient - red */}
          <radialGradient id="sececlip-gradient-fp" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--semantic-red)" stopOpacity="1" />
            <stop offset="70%" stopColor="var(--semantic-red)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--semantic-red-dim)" stopOpacity="0.3" />
          </radialGradient>

          {/* Binary suspect highlight */}
          <filter id="sececlip-binary-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Tooltip background filter */}
          <filter id="sececlip-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--bg-canvas)" floodOpacity="0.8" />
          </filter>

          {/* Binary threshold marker */}
          <marker id="sececlip-threshold-marker" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <circle cx="4" cy="4" r="3" fill="var(--semantic-red)" opacity="0.6" />
          </marker>
        </defs>

        {/* Gridlines */}
        <g className="sececlip__gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`sececlip__gridline ${line.className}`}
            />
          ))}
        </g>

        {/* Binary threshold line */}
        <g className="sececlip__threshold" aria-hidden="true">
          <line
            x1={MARGIN.left}
            y1={thresholdY}
            x2={MARGIN.left + chartData.plotWidth}
            y2={thresholdY}
            className="sececlip__threshold-line"
            stroke="var(--semantic-red)"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.6"
            markerEnd="url(#sececlip-threshold-marker)"
          />
          <text
            x={MARGIN.left + 6}
            y={thresholdY - 4}
            className="sececlip__threshold-label"
            fill="var(--semantic-red)"
            fontSize="var(--font-size-xs)"
            fontFamily="var(--font-mono)"
          >
            BINARY THRESHOLD ({formatScientific(binaryThreshold)})
          </text>
        </g>

        {/* Axes */}
        <g className="sececlip__axes" aria-hidden="true">
          {/* X axis (Model Probability) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + chartData.plotHeight}
            x2={MARGIN.left + chartData.plotWidth}
            y2={MARGIN.top + chartData.plotHeight}
            className="sececlip__axis sececlip__axis--x"
          />
          {/* Y axis (Secondary Eclipse Depth) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + chartData.plotHeight}
            className="sececlip__axis sececlip__axis--y"
          />
        </g>

        {/* X axis ticks and labels */}
        <g className="sececlip__x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={MARGIN.top + chartData.plotHeight}
                x2={tick.x}
                y2={MARGIN.top + chartData.plotHeight + 6}
                className={`sececlip__tick ${i === 0 || i === xTicks.length - 1 ? 'sececlip__tick--major' : ''}`}
              />
              <text
                x={tick.x}
                y={MARGIN.top + chartData.plotHeight + 18}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="sececlip__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Y axis ticks and labels */}
        <g className="sececlip__y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={MARGIN.left - 6}
                y1={tick.y}
                x2={MARGIN.left}
                y2={tick.y}
                className={`sececlip__tick ${i === 0 || i === yTicks.length - 1 ? 'sececlip__tick--major' : ''}`}
              />
              <text
                x={MARGIN.left - 10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="sececlip__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <g className="sececlip__axis-labels" aria-hidden="true">
          {/* X axis label */}
          <text
            x={MARGIN.left + chartData.plotWidth / 2}
            y={height - 6}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            className="sececlip__axis-label"
          >
            MODEL PROBABILITY
          </text>
          {/* Y axis label */}
          <text
            x={14}
            y={MARGIN.top + chartData.plotHeight / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(-90, 14, ${MARGIN.top + chartData.plotHeight / 2})`}
            className="sececlip__axis-label"
          >
            SECONDARY ECLIPSE DEPTH
          </text>
        </g>

        {/* Scatter Points */}
        <g className="sececlip__points" aria-hidden="true">
          {/* Draw false positives first (behind planets) */}
          {chartData.points
            .filter(p => p.label === 0)
            .map((point, i) => (
              <g key={`fp-${point.tceId}-${i}`} className={point === hoveredPoint ? 'sececlip__point--hover' : ''}>
                {/* Binary suspect ring */}
                {point.isBinarySuspect && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={8}
                    className="sececlip__binary-ring"
                    fill="none"
                    stroke="var(--semantic-red)"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    opacity="0.7"
                    filter="url(#sececlip-binary-glow)"
                  />
                )}
                {/* Main point */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.isBinarySuspect ? 5 : 4}
                  className="sececlip__point sececlip__point--fp"
                  fill="url(#sececlip-gradient-fp)"
                  stroke="var(--bg-panel)"
                  strokeWidth="1"
                  opacity="0.7"
                />
              </g>
            ))}
          {/* Draw planets on top */}
          {chartData.points
            .filter(p => p.label === 1)
            .map((point, i) => (
              <g key={`pc-${point.tceId}-${i}`} className={point === hoveredPoint ? 'sececlip__point--hover' : ''}>
                {/* Binary suspect ring */}
                {point.isBinarySuspect && (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={8}
                    className="sececlip__binary-ring"
                    fill="none"
                    stroke="var(--semantic-red)"
                    strokeWidth="1.5"
                    strokeDasharray="4 2"
                    opacity="0.7"
                    filter="url(#sececlip-binary-glow)"
                  />
                )}
                {/* Main point */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.isBinarySuspect ? 5 : 4}
                  className="sececlip__point sececlip__point--pc"
                  fill="url(#sececlip-gradient-pc)"
                  stroke="var(--bg-panel)"
                  strokeWidth="1"
                  opacity="0.9"
                />
              </g>
            ))}
        </g>

        {/* Legend */}
        <g className="sececlip__legend" aria-hidden="true" transform={`translate(${MARGIN.left + chartData.plotWidth + 10}, ${MARGIN.top})`}>
          {/* Planet Candidates */}
          <g className="sececlip__legend-item">
            <circle cx="6" cy="6" r="5" fill="url(#sececlip-gradient-pc)" stroke="var(--bg-panel)" strokeWidth="1" />
            <text x="16" y="11" className="sececlip__legend-label" fill="var(--semantic-amber)">
              PLANET CANDIDATES
            </text>
            <text x="16" y="23" className="sececlip__legend-count" fill="var(--text-secondary)">
              {formatCount(chartData.planetCount)}
            </text>
          </g>
          {/* False Positives */}
          <g className="sececlip__legend-item" transform="translate(0, 32)">
            <circle cx="6" cy="6" r="5" fill="url(#sececlip-gradient-fp)" stroke="var(--bg-panel)" strokeWidth="1" />
            <text x="16" y="11" className="sececlip__legend-label" fill="var(--semantic-red)">
              FALSE POSITIVES
            </text>
            <text x="16" y="23" className="sececlip__legend-count" fill="var(--text-secondary)">
              {formatCount(chartData.notPlanetCount)}
            </text>
          </g>
          {/* Binary Suspects */}
          <g className="sececlip__legend-item sececlip__legend-item--binary" transform="translate(0, 64)">
            <circle cx="6" cy="6" r="8" fill="none" stroke="var(--semantic-red)" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.7" />
            <circle cx="6" cy="6" r="4" fill="var(--text-dim)" opacity="0.5" />
            <text x="16" y="11" className="sececlip__legend-label" fill="var(--semantic-red)">
              BINARY SUSPECTS
            </text>
            <text x="16" y="23" className="sececlip__legend-count" fill="var(--text-secondary)">
              {formatCount(chartData.binarySuspectCount)}
            </text>
          </g>
        </g>

        {/* Split/Model indicator */}
        <text
          x={width - MARGIN.right + 10}
          y={height - 8}
          textAnchor="end"
          dominantBaseline="alphabetic"
          className="sececlip__split-label"
          fill="var(--text-dim)"
          fontSize="var(--font-size-xs)"
        >
          {split.toUpperCase()} SPLIT · {model.toUpperCase()}
        </text>

        {/* Tooltip */}
        {tooltip && (
          <g className="sececlip__tooltip" filter="url(#sececlip-tooltip-shadow)">
            <rect
              x={tooltip.x + 12}
              y={tooltip.y - 60}
              width={200}
              height={64}
              rx={3}
              className="sececlip__tooltip-bg"
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 48}
              className="sececlip__tooltip-title"
              fill={tooltip.point.label === 1 ? 'var(--semantic-amber)' : 'var(--semantic-red)'}
            >
              {tooltip.point.label === 1 ? 'PLANET CANDIDATE' : 'FALSE POSITIVE'}
              {tooltip.point.isBinarySuspect && <tspan fill="var(--semantic-red)" dx="4">⚠ BINARY</tspan>}
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 34}
              className="sececlip__tooltip-row"
            >
              <tspan className="sececlip__tooltip-label">KEPID:</tspan>
              <tspan className="sececlip__tooltip-value" dx="4">{tooltip.point.tceId}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 20}
              className="sececlip__tooltip-row"
            >
              <tspan className="sececlip__tooltip-label">PROB:</tspan>
              <tspan className="sececlip__tooltip-value" dx="4">{formatNumber(tooltip.point.probability, 3)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 6}
              className="sececlip__tooltip-row"
            >
              <tspan className="sececlip__tooltip-label">SEC DEPTH:</tspan>
              <tspan className="sececlip__tooltip-value" dx="4">{formatScientific(tooltip.point.secondaryEclipseDepth)}</tspan>
            </text>
          </g>
        )}

        {/* Total samples readout */}
        <text
          x={MARGIN.left}
          y={MARGIN.top - 6}
          textAnchor="start"
          dominantBaseline="alphabetic"
          className="sececlip__total-label"
          fill="var(--text-dim)"
          fontSize="var(--font-size-xs)"
        >
          N = {formatCount(chartData.totalPoints)}
        </text>
      </svg>
    </div>
  );
};

/** Format count with compact notation (k, M) */
function formatCount(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

export default SecondaryEclipseScatter;