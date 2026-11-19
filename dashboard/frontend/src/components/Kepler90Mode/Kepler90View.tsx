/**
 * Kepler90View - Kepler-90 system display
 * Shows all 8 planets with probabilities and local view thumbnails
 * Persistent notice: "One-star illustration, excluded from training, not accuracy evidence"
 */

import React, { useMemo } from 'react';
import { Panel } from '../Panel';
import { useKepler90, type Kepler90ViewPlanet, formatPeriod, formatDepth, formatProbability, getProbabilityColor, transformToThumbnail } from './useKepler90';
import './Kepler90View.css';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface Kepler90ViewProps {
  /** Panel tag letter (default: 'K') */
  tag?: string;
  /** Panel title (default: 'KEPLER-90 MODE') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
  /** Whether to show local view thumbnails (default: true) */
  showThumbnails?: boolean;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

const THUMBNAIL_WIDTH = 180;
const THUMBNAIL_HEIGHT = 80;
const THUMBNAIL_MARGIN = { top: 6, right: 6, bottom: 12, left: 6 };

// ──────────────────────────────────────────────────────────────
// Helper: SVG Path for line
// ──────────────────────────────────────────────────────────────

function getLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
}

// ──────────────────────────────────────────────────────────────
// Local View Thumbnail Component
// ──────────────────────────────────────────────────────────────

interface LocalViewThumbnailProps {
  planet: Kepler90ViewPlanet;
  width?: number;
  height?: number;
}

function LocalViewThumbnail({ planet, width = THUMBNAIL_WIDTH, height = THUMBNAIL_HEIGHT }: LocalViewThumbnailProps) {
  const chartData = useMemo(() => {
    if (!planet.localView?.length) return null;
    return transformToThumbnail(
      planet.localView,
      planet.period,
      planet.duration_hr,
      width,
      height,
      true
    );
  }, [planet.localView, planet.period, planet.duration_hr, width, height]);

  const probColor = getProbabilityColor(planet.probability);

  if (!chartData) {
    return (
      <div className="kepler90-thumbnail kepler90-thumbnail--empty" style={{ width, height }} role="img" aria-label="No local view data">
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
          <rect
            x={0} y={0} width={width} height={height}
            fill="var(--bg-panel)" stroke="var(--line-primary)" strokeWidth="0.5"
          />
          <text
            x={width / 2} y={height / 2}
            textAnchor="middle" dominantBaseline="middle"
            fill="var(--text-dim)" fontSize="var(--font-size-xs)" fontFamily="var(--font-mono)"
          >
            No local view
          </text>
        </svg>
      </div>
    );
  }

  const { points, transitCenter, transitDuration } = chartData;
  const path = getLinePath(points);
  const viewBoxWidth = width;
  const viewBoxHeight = height;

  return (
    <div className="kepler90-thumbnail" style={{ width, height }} role="img" aria-label={`Kepler-90 ${planet.name} local view`}>
      <svg width="100%" height="100%" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} className="kepler90-thumbnail-svg">
        <defs>
          <linearGradient id="kepler90-thumb-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.5" />
            <stop offset="50%" stopColor={probColor} stopOpacity="1" />
            <stop offset="100%" stopColor="var(--text-dim)" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Transit window highlight */}
        {transitDuration > 0 && (
          <rect
            x={transitCenter - transitDuration}
            y={THUMBNAIL_MARGIN.top}
            width={transitDuration * 2}
            height={height - THUMBNAIL_MARGIN.top - THUMBNAIL_MARGIN.bottom}
            className="kepler90-thumb-transit-window"
            fill="var(--semantic-amber)"
            opacity="0.1"
          />
        )}

        {/* Gridlines - minimal for thumbnail */}
        <g className="kepler90-thumb-gridlines" aria-hidden="true">
          {/* Horizontal center line */}
          <line
            x1={THUMBNAIL_MARGIN.left}
            y1={THUMBNAIL_MARGIN.top + (height - THUMBNAIL_MARGIN.top - THUMBNAIL_MARGIN.bottom) / 2}
            x2={width - THUMBNAIL_MARGIN.right}
            y2={THUMBNAIL_MARGIN.top + (height - THUMBNAIL_MARGIN.top - THUMBNAIL_MARGIN.bottom) / 2}
            stroke="var(--line-secondary)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
        </g>

        {/* Light curve */}
        <path
          d={path}
          className="kepler90-thumb-curve"
          stroke="url(#kepler90-thumb-gradient)"
          fill="none"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Transit center line */}
        <line
          x1={transitCenter}
          y1={THUMBNAIL_MARGIN.top}
          x2={transitCenter}
          y2={height - THUMBNAIL_MARGIN.bottom}
          className="kepler90-thumb-transit-center"
          stroke="var(--semantic-amber)"
          strokeWidth="0.5"
          strokeDasharray="1.5 1.5"
          opacity="0.6"
        />

        {/* Probability indicator dot */}
        <circle
          cx={width - THUMBNAIL_MARGIN.right - 6}
          cy={THUMBNAIL_MARGIN.top + 6}
          r={4}
          fill={probColor}
          className="kepler90-thumb-prob-dot"
        />
      </svg>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Planet Row Component
// ──────────────────────────────────────────────────────────────

interface PlanetRowProps {
  planet: Kepler90ViewPlanet;
  index: number;
  showThumbnail: boolean;
}

function PlanetRow({ planet, index, showThumbnail }: PlanetRowProps) {
  const probColor = getProbabilityColor(planet.probability);
  const probPercent = formatProbability(planet.probability);

  return (
    <article className="kepler90-planet-row" data-index={index}>
      {/* Rank / Number */}
      <div className="kepler90-planet-rank">
        <span className="kepler90-planet-number">{index + 1}</span>
      </div>

      {/* Planet Name */}
      <div className="kepler90-planet-name">
        <span className="kepler90-planet-label">{planet.name}</span>
      </div>

      {/* Period */}
      <div className="kepler90-planet-period">
        <span className="kepler90-planet-value">{formatPeriod(planet.period)}</span>
        <span className="kepler90-planet-unit">d</span>
      </div>

      {/* Depth */}
      <div className="kepler90-planet-depth">
        <span className="kepler90-planet-value">{formatDepth(planet.depth)}</span>
      </div>

      {/* Probability */}
      <div className="kepler90-planet-probability">
        <div className="kepler90-prob-bar">
          <div
            className="kepler90-prob-fill"
            style={{ width: `${planet.probability * 100}%`, backgroundColor: probColor }}
          />
        </div>
        <span
          className="kepler90-prob-value"
          style={{ color: probColor }}
        >
          {probPercent}%
        </span>
      </div>

      {/* Local View Thumbnail */}
      {showThumbnail && (
        <div className="kepler90-planet-thumbnail">
          <LocalViewThumbnail planet={planet} />
        </div>
      )}
    </article>
  );
}

// ──────────────────────────────────────────────────────────────
// Header Row (Column Labels)
// ──────────────────────────────────────────────────────────────

function HeaderRow({ showThumbnail }: { showThumbnail: boolean }) {
  return (
    <header className="kepler90-header-row">
      <div className="kepler90-col kepler90-col--rank">
        <span className="kepler90-col-label">#</span>
      </div>
      <div className="kepler90-col kepler90-col--name">
        <span className="kepler90-col-label">PLANET</span>
      </div>
      <div className="kepler90-col kepler90-col--period">
        <span className="kepler90-col-label">PERIOD</span>
      </div>
      <div className="kepler90-col kepler90-col--depth">
        <span className="kepler90-col-label">DEPTH</span>
      </div>
      <div className="kepler90-col kepler90-col--probability">
        <span className="kepler90-col-label">CNN PROB</span>
      </div>
      {showThumbnail && (
        <div className="kepler90-col kepler90-col--thumbnail">
          <span className="kepler90-col-label">LOCAL VIEW</span>
        </div>
      )}
    </header>
  );
}

// ──────────────────────────────────────────────────────────────
// Disclaimer Banner
// ──────────────────────────────────────────────────────────────

function DisclaimerBanner({ disclaimer }: { disclaimer: string }) {
  return (
    <div className="kepler90-disclaimer" role="status" aria-live="polite">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
        className="kepler90-disclaimer-icon"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span className="kepler90-disclaimer-text">{disclaimer}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Loading Skeleton
// ──────────────────────────────────────────────────────────────

function LoadingSkeleton({ showThumbnail }: { showThumbnail: boolean }) {
  return (
    <div className="kepler90-skeleton">
      <HeaderRow showThumbnail={showThumbnail} />
      <div className="kepler90-planets-skeleton">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="kepler90-planet-skeleton">
            <div className="kepler90-skeleton-col kepler90-skeleton-col--rank" />
            <div className="kepler90-skeleton-col kepler90-skeleton-col--name" />
            <div className="kepler90-skeleton-col kepler90-skeleton-col--period" />
            <div className="kepler90-skeleton-col kepler90-skeleton-col--depth" />
            <div className="kepler90-skeleton-col kepler90-skeleton-col--probability" />
            {showThumbnail && <div className="kepler90-skeleton-col kepler90-skeleton-col--thumbnail" />}
          </div>
        ))}
      </div>
      <DisclaimerBanner disclaimer="One-star illustration, excluded from training, not accuracy evidence" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Error State
// ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="kepler90-error">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <p className="kepler90-error-title">Failed to load Kepler-90 data</p>
      <p className="kepler90-error-message">The Kepler-90 system data could not be retrieved.</p>
      <button className="kepler90-retry-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Kepler90View Component
// ──────────────────────────────────────────────────────────────

export const Kepler90View: React.FC<Kepler90ViewProps> = ({
  tag = 'K',
  title = 'KEPLER-90 MODE',
  subtitle = 'Eight-planet system — model probabilities & local views',
  className = '',
  cornerColor = 'amber',
  showThumbnails = true,
}) => {
  const query = useKepler90({ fetchViews: showThumbnails });
  const { data, isLoading, isError, refetch } = query;

  const planets = data?.planets ?? [];
  const disclaimer = data?.disclaimer ?? 'One-star illustration, excluded from training, not accuracy evidence';

  // Loading state
  if (isLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} kepler90-view--loading`}
        cornerColor={cornerColor}
      >
        <LoadingSkeleton showThumbnail={showThumbnails} />
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
        className={`${className} kepler90-view--error`}
        cornerColor="red"
      >
        <ErrorState onRetry={() => refetch()} />
      </Panel>
    );
  }

  // Empty state (shouldn't happen for Kepler-90, but handle gracefully)
  if (!planets.length) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} kepler90-view--empty`}
        cornerColor={cornerColor}
      >
        <div className="kepler90-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <p>No Kepler-90 planets found</p>
        </div>
        <DisclaimerBanner disclaimer={disclaimer} />
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
      {/* Header Row */}
      <HeaderRow showThumbnail={showThumbnails} />

      {/* Planets List */}
      <section className="kepler90-planets" role="list" aria-label="Kepler-90 planets">
        {planets.map((planet, index) => (
          <PlanetRow
            key={planet.name}
            planet={planet}
            index={index}
            showThumbnail={showThumbnails}
          />
        ))}
      </section>

      {/* Persistent Disclaimer Banner */}
      <DisclaimerBanner disclaimer={disclaimer} />
    </Panel>
  );
};

export default Kepler90View;