/**
 * ProbHistogram - Stacked histogram by true label
 * PC (planet candidates) = amber, AFP/NTP (false positives) = red
 * Styled to design system: hairlines, mono ticks, no library themes
 */

import React, { useState, useMemo, useRef } from 'react';
import { useHistogram } from './useHistogram';
import './ProbHistogram.css';

export interface ProbHistogramProps {
  /** Data split to display (default: 'test') */
  split?: 'train' | 'val' | 'test';
  /** Model type to display (default: 'cnn') */
  model?: 'cnn' | 'gb';
  /** Number of histogram bins (default: 20) */
  bins?: number;
  /** Chart width in pixels (default: full container width) */
  width?: number;
  /** Chart height in pixels (default: 300) */
  height?: number;
  /** Custom className */
  className?: string;
}

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MARGIN = { top: 20, right: 40, bottom: 40, left: 50 };

/** Format a number for display with consistent precision */
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

/** Format count with compact notation (k, M) */
function formatCount(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toString();
}

export const ProbHistogram: React.FC<ProbHistogramProps> = ({
  split = 'test',
  model = 'cnn',
  bins = 20,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className = '',
}) => {
  const { data, isLoading, isError } = useHistogram(split, model, bins);
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    binCenter: number;
    pcCount: number;
    afpCount: number;
    totalCount: number;
    binIndex: number;
  } | null>(null);
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);

  // Transform data into chart coordinates
  const chartData = useMemo(() => {
    if (!data) return null;

    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = height - MARGIN.top - MARGIN.bottom;

    const binWidth = plotWidth / data.bins.length;

    return {
      ...data,
      plotWidth,
      plotHeight,
      binWidth,
      // Stacked bar coordinates
      stackedBars: data.bins.map((binCenter, i) => {
        const pcCount = data.pcCounts[i];
        const afpCount = data.afpCounts[i];
        const totalCount = data.totalCounts[i];

        // X position (center of bin)
        const x = MARGIN.left + i * binWidth + binWidth / 2;
        const barWidth = binWidth * 0.8;

        // Y positions (bottom-up stacking)
        const yBase = MARGIN.top + plotHeight;
        const yPC = yBase - (pcCount / data.maxCount) * plotHeight;
        const yAFP = yPC - (afpCount / data.maxCount) * plotHeight;

        return {
          binCenter,
          binIndex: i,
          x,
          barWidth,
          // PC (amber) - bottom layer
          pc: {
            count: pcCount,
            y: yPC,
            height: yBase - yPC,
            yBase,
          },
          // AFP/NTP (red) - top layer
          afp: {
            count: afpCount,
            y: yAFP,
            height: yPC - yAFP,
            yBase: yPC,
          },
          // Total for tooltip
          total: {
            count: totalCount,
            y: yAFP,
            height: yBase - yAFP,
            yBase,
          },
        };
      }),
    };
  }, [data, width, height]);

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
      setHoveredBin(null);
      return;
    }

    // Find which bin the mouse is over
    const binIndex = Math.floor((mouseX - MARGIN.left) / chartData.binWidth);
    const clampedIndex = Math.max(0, Math.min(binIndex, chartData.stackedBars.length - 1));
    const bar = chartData.stackedBars[clampedIndex];

    // Check if mouse is over any bar
    const barLeft = bar.x - bar.barWidth / 2;
    const barRight = bar.x + bar.barWidth / 2;

    if (mouseX >= barLeft && mouseX <= barRight && mouseY <= bar.total.yBase && mouseY >= bar.total.y) {
      setTooltip({
        visible: true,
        x: bar.x,
        y: bar.total.y,
        binCenter: bar.binCenter,
        pcCount: bar.pc.count,
        afpCount: bar.afp.count,
        totalCount: bar.total.count,
        binIndex: bar.binIndex,
      });
      setHoveredBin(clampedIndex);
    } else {
      setTooltip(null);
      setHoveredBin(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
    setHoveredBin(null);
  };

  // Generate gridlines
  const gridlines = useMemo(() => {
    if (!chartData) return [];

    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; className: string }> = [];
    const { plotWidth, plotHeight } = chartData;

    // Horizontal gridlines
    for (let i = 0; i <= 5; i++) {
      const y = MARGIN.top + (i / 5) * plotHeight;
      lines.push({
        x1: MARGIN.left,
        y1: y,
        x2: MARGIN.left + plotWidth,
        y2: y,
        className: i === 0 || i === 5 ? 'gridline--major' : 'gridline--minor',
      });
    }

    // Vertical gridlines (every 2 bins)
    const binStep = Math.max(1, Math.ceil(chartData.bins.length / 5));
    for (let i = 0; i < chartData.bins.length; i += binStep) {
      const x = MARGIN.left + (i + 0.5) * chartData.binWidth;
      lines.push({
        x1: x,
        y1: MARGIN.top,
        x2: x,
        y2: MARGIN.top + plotHeight,
        className: (i === 0 || i + binStep >= chartData.bins.length) ? 'gridline--major' : 'gridline--minor',
      });
    }

    return lines;
  }, [chartData]);

  // Generate axis ticks
  const xTicks = useMemo(() => {
    if (!chartData) return [];
    const binStep = Math.max(1, Math.ceil(chartData.bins.length / 5));
    return Array.from({ length: Math.ceil(chartData.bins.length / binStep) + 1 }, (_, i) => {
      const binIndex = Math.min(i * binStep, chartData.bins.length - 1);
      const binCenter = chartData.bins[binIndex];
      const x = MARGIN.left + (binIndex + 0.5) * chartData.binWidth;
      return { value: binCenter, x, label: formatNumber(binCenter, 1) };
    });
  }, [chartData]);

  const yTicks = useMemo(() => {
    if (!chartData) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const count = Math.round((i / 5) * chartData.maxCount);
      const y = MARGIN.top + (1 - i / 5) * chartData.plotHeight;
      return { value: count, y, label: formatCount(count) };
    });
  }, [chartData]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`probhist ${className}`} style={{ width, height }} role="status" aria-label="Loading histogram">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="probhist__svg">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`probhist__gridline ${line.className} probhist__gridline--skeleton`}
            />
          ))}
        </svg>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className={`probhist ${className}`} style={{ width, height }} role="alert">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="probhist__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="probhist__error"
            fill="var(--semantic-red)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            Failed to load histogram
          </text>
        </svg>
      </div>
    );
  }

  // No data state
  if (!chartData) {
    return (
      <div className={`probhist ${className}`} style={{ width, height }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="probhist__svg">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="probhist__empty"
            fill="var(--text-dim)"
            fontFamily="var(--font-mono)"
            fontSize="var(--font-size-sm)"
          >
            No histogram data available
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={`probhist ${className}`} style={{ width, height }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="probhist__svg"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="img"
        aria-label={`
          Probability histogram for ${split} split (${model.toUpperCase()}).
          ${chartData.totalSamples} samples across ${chartData.bins.length} bins.
          Planet candidates: ${chartData.pcCounts.reduce((a, b) => a + b, 0)}.
          False positives: ${chartData.afpCounts.reduce((a, b) => a + b, 0)}.
        `}
      >
        {/* Defs for gradients */}
        <defs>
          {/* PC (Planet Candidate) gradient - amber */}
          <linearGradient id="probhist-gradient-pc" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--semantic-amber-dim)" stopOpacity="0.8" />
            <stop offset="50%" stopColor="var(--semantic-amber)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--semantic-amber)" stopOpacity="1" />
          </linearGradient>

          {/* AFP/NTP (False Positive) gradient - red */}
          <linearGradient id="probhist-gradient-afp" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--semantic-red-dim)" stopOpacity="0.8" />
            <stop offset="50%" stopColor="var(--semantic-red)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--semantic-red)" stopOpacity="1" />
          </linearGradient>

          {/* Hover highlight gradient */}
          <linearGradient id="probhist-gradient-hover" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--text-primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--text-primary)" stopOpacity="0.1" />
          </linearGradient>

          {/* Tooltip background filter */}
          <filter id="probhist-tooltip-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="var(--bg-canvas)" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* Gridlines */}
        <g className="probhist__gridlines" aria-hidden="true">
          {gridlines.map((line, i) => (
            <line
              key={`grid-${i}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`probhist__gridline ${line.className}`}
            />
          ))}
        </g>

        {/* Axes */}
        <g className="probhist__axes" aria-hidden="true">
          {/* X axis (Probability) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top + chartData.plotHeight}
            x2={MARGIN.left + chartData.plotWidth}
            y2={MARGIN.top + chartData.plotHeight}
            className="probhist__axis probhist__axis--x"
          />
          {/* Y axis (Count) */}
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + chartData.plotHeight}
            className="probhist__axis probhist__axis--y"
          />
        </g>

        {/* X axis ticks and labels */}
        <g className="probhist__x-ticks" aria-hidden="true">
          {xTicks.map((tick, i) => (
            <g key={`xtick-${i}`}>
              <line
                x1={tick.x}
                y1={MARGIN.top + chartData.plotHeight}
                x2={tick.x}
                y2={MARGIN.top + chartData.plotHeight + 6}
                className={`probhist__tick ${i === 0 || i === xTicks.length - 1 ? 'probhist__tick--major' : ''}`}
              />
              <text
                x={tick.x}
                y={MARGIN.top + chartData.plotHeight + 18}
                textAnchor="middle"
                dominantBaseline="hanging"
                className="probhist__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Y axis ticks and labels */}
        <g className="probhist__y-ticks" aria-hidden="true">
          {yTicks.map((tick, i) => (
            <g key={`ytick-${i}`}>
              <line
                x1={MARGIN.left - 6}
                y1={tick.y}
                x2={MARGIN.left}
                y2={tick.y}
                className={`probhist__tick ${i === 0 || i === 5 ? 'probhist__tick--major' : ''}`}
              />
              <text
                x={MARGIN.left - 10}
                y={tick.y}
                textAnchor="end"
                dominantBaseline="middle"
                className="probhist__tick-label"
              >
                {tick.label}
              </text>
            </g>
          ))}
        </g>

        {/* Axis labels */}
        <g className="probhist__axis-labels" aria-hidden="true">
          {/* X axis label */}
          <text
            x={MARGIN.left + chartData.plotWidth / 2}
            y={height - 6}
            textAnchor="middle"
            dominantBaseline="alphabetic"
            className="probhist__axis-label"
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
            className="probhist__axis-label"
          >
            COUNT
          </text>
        </g>

        {/* Stacked Bars */}
        <g className="probhist__bars" aria-hidden="true">
          {chartData.stackedBars.map((bar, i) => (
            <g key={`bar-${i}`} className={i === hoveredBin ? 'probhist__bar--hover' : ''}>
              {/* AFP/NTP (red) - top layer */}
              {bar.afp.count > 0 && (
                <rect
                  x={bar.x - bar.barWidth / 2}
                  y={bar.afp.y}
                  width={bar.barWidth}
                  height={bar.afp.height}
                  className="probhist__bar-segment probhist__bar-segment--afp"
                  fill="url(#probhist-gradient-afp)"
                  rx={1}
                  ry={1}
                />
              )}
              {/* PC (amber) - bottom layer */}
              {bar.pc.count > 0 && (
                <rect
                  x={bar.x - bar.barWidth / 2}
                  y={bar.pc.y}
                  width={bar.barWidth}
                  height={bar.pc.height}
                  className="probhist__bar-segment probhist__bar-segment--pc"
                  fill="url(#probhist-gradient-pc)"
                  rx={1}
                  ry={1}
                />
              )}
              {/* Hover highlight overlay */}
              {i === hoveredBin && (
                <rect
                  x={bar.x - bar.barWidth / 2}
                  y={bar.total.y}
                  width={bar.barWidth}
                  height={bar.total.height}
                  className="probhist__bar-highlight"
                  fill="url(#probhist-gradient-hover)"
                  rx={1}
                  ry={1}
                  pointer-events="none"
                />
              )}
            </g>
          ))}
        </g>

        {/* Legend */}
        <g className="probhist__legend" aria-hidden="true" transform={`translate(${MARGIN.left + chartData.plotWidth + 10}, ${MARGIN.top})`}>
          {/* PC (Planet Candidates) */}
          <g className="probhist__legend-item">
            <rect x="0" y="0" width="12" height="12" rx="2" fill="url(#probhist-gradient-pc)" />
            <text x="18" y="10" className="probhist__legend-label" fill="var(--semantic-amber)">
              PLANET CANDIDATES
            </text>
            <text x="18" y="22" className="probhist__legend-count" fill="var(--text-secondary)">
              {formatCount(chartData.pcCounts.reduce((a, b) => a + b, 0))}
            </text>
          </g>
          {/* AFP/NTP (False Positives) */}
          <g className="probhist__legend-item" transform="translate(0, 32)">
            <rect x="0" y="0" width="12" height="12" rx="2" fill="url(#probhist-gradient-afp)" />
            <text x="18" y="10" className="probhist__legend-label" fill="var(--semantic-red)">
              FALSE POSITIVES
            </text>
            <text x="18" y="22" className="probhist__legend-count" fill="var(--text-secondary)">
              {formatCount(chartData.afpCounts.reduce((a, b) => a + b, 0))}
            </text>
          </g>
        </g>

        {/* Split/Model indicator */}
        <text
          x={width - MARGIN.right + 10}
          y={height - 8}
          textAnchor="end"
          dominantBaseline="alphabetic"
          className="probhist__split-label"
          fill="var(--text-dim)"
          fontSize="var(--font-size-xs)"
        >
          {split.toUpperCase()} SPLIT · {model.toUpperCase()}
        </text>

        {/* Tooltip */}
        {tooltip && (
          <g className="probhist__tooltip" filter="url(#probhist-tooltip-shadow)">
            <rect
              x={tooltip.x + 12}
              y={tooltip.y - 60}
              width={180}
              height={64}
              rx={3}
              className="probhist__tooltip-bg"
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 48}
              className="probhist__tooltip-title"
              fill="var(--text-primary)"
            >
              BIN {tooltip.binCenter.toFixed(2)}
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 34}
              className="probhist__tooltip-row"
            >
              <tspan className="probhist__tooltip-label" fill="var(--semantic-amber)">●</tspan>
              <tspan className="probhist__tooltip-label" dx="4">PLANETS:</tspan>
              <tspan className="probhist__tooltip-value" dx="4" fill="var(--semantic-amber)">{formatCount(tooltip.pcCount)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 20}
              className="probhist__tooltip-row"
            >
              <tspan className="probhist__tooltip-label" fill="var(--semantic-red)">●</tspan>
              <tspan className="probhist__tooltip-label" dx="4">FALSE POS:</tspan>
              <tspan className="probhist__tooltip-value" dx="4" fill="var(--semantic-red)">{formatCount(tooltip.afpCount)}</tspan>
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y - 6}
              className="probhist__tooltip-row probhist__tooltip-row--total"
            >
              <tspan className="probhist__tooltip-label">TOTAL:</tspan>
              <tspan className="probhist__tooltip-value" dx="4" fill="var(--text-primary)">{formatCount(tooltip.totalCount)}</tspan>
            </text>
          </g>
        )}

        {/* Total samples readout */}
        <text
          x={MARGIN.left}
          y={MARGIN.top - 6}
          textAnchor="start"
          dominantBaseline="alphabetic"
          className="probhist__total-label"
          fill="var(--text-dim)"
          fontSize="var(--font-size-xs)"
        >
          N = {formatCount(chartData.totalSamples)}
        </text>
      </svg>
    </div>
  );
};

export default ProbHistogram;