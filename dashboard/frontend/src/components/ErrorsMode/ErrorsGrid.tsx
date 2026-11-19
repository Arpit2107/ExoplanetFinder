/**
 * ErrorsGrid - Grid of false positive/false negative cards for error analysis mode
 * - Fetches error cases via useErrorCases hook (GET /api/errors)
 * - Each card: global/local view thumbnails, CNN probability, red "possible label error" tag
 * - Filter tabs: All | False Positives | False Negatives
 * - Click card to select TCE and open inspector panel
 * - Caption: "These are model suspicions, not ground truth"
 */

import React, { useState, useMemo } from 'react';
import { Panel } from '../Panel';
import { ProbabilityBar } from '../TopCandidates/ProbabilityBar';
import { useErrorCases } from '../../api/queries';
import { useSelectTce } from '../../store/useAppStore';
import type { ErrorAnalysisItem, ErrorType } from '../../api/types';
import './ErrorsGrid.css';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface ErrorsGridProps {
  /** Panel tag letter (default: 'D') */
  tag?: string;
  /** Panel title (default: 'ERROR ANALYSIS') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
}

type ErrorFilter = 'all' | 'FP' | 'FN';
type CountKey = 'total' | 'fp' | 'fn';

const FILTER_OPTIONS: { value: ErrorFilter; label: string; countKey: CountKey }[] = [
  { value: 'all', label: 'ALL', countKey: 'total' },
  { value: 'FP', label: 'FALSE POSITIVES', countKey: 'fp' },
  { value: 'FN', label: 'FALSE NEGATIVES', countKey: 'fn' },
];

// ──────────────────────────────────────────────────────────────
// Helper Components
// ──────────────────────────────────────────────────────────────

/** Label formatter for display */
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

/** Error type badge component */
function ErrorTypeBadge({ type }: { type: ErrorType }) {
  const label = type === 'FP' ? 'FALSE POSITIVE' : 'FALSE NEGATIVE';
  return (
    <span className={`errors-grid__error-badge errors-grid__error-badge--${type.toLowerCase()}`}>
      {label}
    </span>
  );
}

/** Light curve thumbnail chart for error cards */
interface ThumbnailChartProps {
  /** Light curve flux array (global_view or local_view) */
  fluxArray: number[];
  /** Period in days */
  period: number;
  /** Transit duration in hours */
  duration: number;
  /** Whether this is global view (true) or local view (false) */
  isGlobal: boolean;
  /** Chart width in pixels */
  width?: number;
  /** Chart height in pixels */
  height?: number;
  /** Show secondary eclipse window (global view only) */
  showSecondaryEclipse?: boolean;
}

const THUMBNAIL_MARGIN = { top: 8, right: 8, bottom: 20, left: 28 };

function ThumbnailChart({
  fluxArray,
  period,
  duration,
  isGlobal,
  width = 180,
  height = 80,
  showSecondaryEclipse = false,
}: ThumbnailChartProps) {
  const n = fluxArray.length;
  if (n < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="errors-grid__thumbnail-svg">
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)">
          No data
        </text>
      </svg>
    );
  }

  // Calculate phase range
  let phaseMin: number, phaseMax: number;
  if (isGlobal) {
    phaseMin = -1.0;
    phaseMax = 1.0;
  } else {
    const durationInPhase = duration / 24 / period;
    phaseMin = -durationInPhase * 2;
    phaseMax = durationInPhase * 2;
  }

  const plotWidth = width - THUMBNAIL_MARGIN.left - THUMBNAIL_MARGIN.right;
  const plotHeight = height - THUMBNAIL_MARGIN.top - THUMBNAIL_MARGIN.bottom;

  const [fluxMin, fluxMax] = [Math.min(...fluxArray), Math.max(...fluxArray)];
  const fluxRange = fluxMax - fluxMin;
  const padding = fluxRange * 0.1;
  const yMin = fluxMin - padding;
  const yMax = fluxMax + padding;

  const xScale = (phase: number) => THUMBNAIL_MARGIN.left + ((phase - phaseMin) / (phaseMax - phaseMin)) * plotWidth;
  const yScale = (flux: number) => THUMBNAIL_MARGIN.top + (1 - (flux - yMin) / (yMax - yMin)) * plotHeight;

  // Generate path
  const points = fluxArray.map((flux, i) => {
    const phase = phaseMin + (i / (n - 1)) * (phaseMax - phaseMin);
    return { x: xScale(phase), y: yScale(flux) };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Secondary eclipse window (global view only)
  const secEclipseX1 = showSecondaryEclipse
    ? xScale(-0.5)
    : null;
  const secEclipseX2 = showSecondaryEclipse
    ? xScale(0.5)
    : null;

  // Transit center
  const transitCenter = xScale(0);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="errors-grid__thumbnail-svg" aria-hidden="true">
      <defs>
        <linearGradient id="errors-thumb-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--text-dim)" stopOpacity="0.4" />
          <stop offset="50%" stopColor="var(--semantic-amber)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--text-dim)" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Secondary eclipse window */}
      {showSecondaryEclipse && secEclipseX1 !== null && secEclipseX2 !== null && (
        <g className="errors-grid__sec-eclipse">
          <rect
            x={secEclipseX1}
            y={THUMBNAIL_MARGIN.top}
            width={secEclipseX2 - secEclipseX1}
            height={plotHeight}
            fill="var(--semantic-red)"
            opacity="0.1"
          />
        </g>
      )}

      {/* Transit center line */}
      <line
        x1={transitCenter}
        y1={THUMBNAIL_MARGIN.top}
        x2={transitCenter}
        y2={THUMBNAIL_MARGIN.top + plotHeight}
        stroke="var(--semantic-amber)"
        strokeWidth="0.5"
        strokeDasharray="2 2"
        opacity="0.4"
      />

      {/* Light curve */}
      <path
        d={path}
        stroke="url(#errors-thumb-gradient)"
        fill="none"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Axes - minimal */}
      <g stroke="var(--text-dim)" strokeWidth="0.5" opacity="0.3">
        <line x1={THUMBNAIL_MARGIN.left} y1={THUMBNAIL_MARGIN.top + plotHeight} x2={THUMBNAIL_MARGIN.left + plotWidth} y2={THUMBNAIL_MARGIN.top + plotHeight} />
        <line x1={THUMBNAIL_MARGIN.left} y1={THUMBNAIL_MARGIN.top} x2={THUMBNAIL_MARGIN.left} y2={THUMBNAIL_MARGIN.top + plotHeight} />
      </g>

      {/* View label */}
      <text
        x={THUMBNAIL_MARGIN.left}
        y={THUMBNAIL_MARGIN.top - 2}
        textAnchor="start"
        dominantBaseline="alphabetic"
        fill="var(--text-dim)"
        fontSize="9"
        fontFamily="var(--font-mono)"
      >
        {isGlobal ? 'GLOBAL' : 'LOCAL'}
      </text>
    </svg>
  );
}

/** Error card component */
interface ErrorCardProps {
  item: ErrorAnalysisItem;
  /** Fetch full TCE detail for thumbnails (requires separate API call) */
  tceDetail?: {
    global_view: number[];
    local_view: number[];
    period: number;
    duration: number;
  } | null;
  /** Whether this card is currently loading detail */
  isLoadingDetail?: boolean;
  /** Callback when card is clicked */
  onClick: (tceId: string) => void;
  /** Selected state */
  isSelected?: boolean;
}

function ErrorCard({
  item,
  tceDetail,
  isLoadingDetail,
  onClick,
  isSelected = false,
}: ErrorCardProps) {
  const probPercent = (item.cnn_prob * 100).toFixed(1);

  return (
    <article
      className={`errors-grid__card ${isSelected ? 'errors-grid__card--selected' : ''}`}
      onClick={() => onClick(item.tce_id)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item.tce_id);
        }
      }}
      role="button"
      aria-pressed={isSelected}
      aria-label={`TCE ${item.tce_id}, KepID ${item.kepid}, CNN probability ${probPercent}%, ${item.error_type === 'FP' ? 'False Positive' : 'False Negative'}`}
    >
      {/* Thumbnail row */}
      <div className="errors-grid__thumbnails">
        {tceDetail && !isLoadingDetail ? (
          <>
            <ThumbnailChart
              fluxArray={tceDetail.global_view}
              period={tceDetail.period}
              duration={tceDetail.duration}
              isGlobal={true}
              showSecondaryEclipse={true}
              width={180}
              height={80}
            />
            <ThumbnailChart
              fluxArray={tceDetail.local_view}
              period={tceDetail.period}
              duration={tceDetail.duration}
              isGlobal={false}
              width={180}
              height={80}
            />
          </>
        ) : isLoadingDetail ? (
          <div className="errors-grid__thumbnails-skeleton" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="errors-grid__thumb-skeleton" />
            <div className="errors-grid__thumb-skeleton" />
          </div>
        ) : (
          <div className="errors-grid__thumbnails-placeholder" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="errors-grid__thumb-placeholder">GLOBAL</div>
            <div className="errors-grid__thumb-placeholder">LOCAL</div>
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="errors-grid__info">
        <div className="errors-grid__header">
          <span className="errors-grid__tce-id">{item.tce_id}</span>
          <span className="errors-grid__kepid">KepID {item.kepid}</span>
        </div>

        <div className="errors-grid__meta">
          <ErrorTypeBadge type={item.error_type} />
          {item.is_confident && (
            <span className="errors-grid__confident-badge">HIGH CONFIDENCE</span>
          )}
        </div>

        {/* Probability bar */}
        <div className="errors-grid__probability">
          <ProbabilityBar
            probability={item.cnn_prob}
            height={6}
            showValue={true}
            title={`CNN probability: ${probPercent}%`}
          />
        </div>

        {/* True label */}
        <div className="errors-grid__true-label">
          <span className="errors-grid__true-label-title">TRUE:</span>
          <span className={`errors-grid__true-label-value errors-grid__true-label-value--${formatLabelName(item.label).toLowerCase()}`}>
            {formatLabelName(item.label)}
          </span>
        </div>
      </div>

      {/* "Possible label error" tag */}
      <div className="errors-grid__error-tag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>POSSIBLE LABEL ERROR</span>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="errors-grid__selected-indicator" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          SELECTED
        </div>
      )}
    </article>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────

export const ErrorsGrid: React.FC<ErrorsGridProps> = ({
  tag = 'D',
  title = 'ERROR ANALYSIS',
  subtitle = 'Model suspicions — not ground truth',
  className = '',
  cornerColor = 'red',
}) => {
  const [filter, setFilter] = useState<ErrorFilter>('all');
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [detailCache, setDetailCache] = useState<Record<string, {
    global_view: number[];
    local_view: number[];
    period: number;
    duration: number;
  }>>({});

  const selectTce = useSelectTce();

  // Fetch error cases
  const { data: errors, isLoading, error, refetch } = useErrorCases();

  // Filter errors based on selected filter
  const filteredErrors = useMemo(() => {
    if (!errors) return [];
    if (filter === 'all') return errors;
    return errors.filter((e) => e.error_type === filter);
  }, [errors, filter]);

  // Count errors by type
  const counts = useMemo((): Record<'total' | 'fp' | 'fn', number> => {
    if (!errors) return { total: 0, fp: 0, fn: 0 };
    return {
      total: errors.length,
      fp: errors.filter((e) => e.error_type === 'FP').length,
      fn: errors.filter((e) => e.error_type === 'FN').length,
    };
  }, [errors]);

  // Handle card click - select TCE and fetch detail if needed
  const handleCardClick = async (tceId: string) => {
    selectTce(tceId);

    // Fetch detail for thumbnails if not cached
    if (!detailCache[tceId] && !expandedDetails[tceId]) {
      setExpandedDetails((prev) => ({ ...prev, [tceId]: true }));

      try {
        // Dynamic import to avoid circular dependency
        const { api } = await import('../../api/client');
        const detail = await api.getTceDetail(tceId);
        setDetailCache((prev) => ({
          ...prev,
          [tceId]: {
            global_view: detail.global_view,
            local_view: detail.local_view,
            period: detail.period,
            duration: detail.duration,
          },
        }));
      } catch (err) {
        console.error('Failed to fetch TCE detail for error card:', err);
      } finally {
        setExpandedDetails((prev) => ({ ...prev, [tceId]: false }));
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} errors-grid--loading`}
        cornerColor={cornerColor}
      >
        <div className="errors-grid__skeleton">
          <div className="errors-grid__filters-skeleton">
            <div className="errors-grid__filter-skeleton" />
            <div className="errors-grid__filter-skeleton" />
            <div className="errors-grid__filter-skeleton" />
          </div>
          <div className="errors-grid__grid-skeleton">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="errors-grid__card-skeleton">
                <div className="errors-grid__thumbs-skeleton" />
                <div className="errors-grid__info-skeleton">
                  <div className="errors-grid__line-skeleton" />
                  <div className="errors-grid__line-skeleton short" />
                  <div className="errors-grid__line-skeleton" />
                  <div className="errors-grid__line-skeleton short" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    );
  }

  // Error state
  if (error) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} errors-grid--error`}
        cornerColor="red"
      >
        <div className="errors-grid__error">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>Failed to load error analysis</p>
          <button className="errors-grid__retry-btn" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      </Panel>
    );
  }

  // Empty state
  if (!errors || filteredErrors.length === 0) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={className}
        cornerColor={cornerColor}
      >
        <div className="errors-grid__empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p>No {filter === 'all' ? 'errors' : filter === 'FP' ? 'false positives' : 'false negatives'} found</p>
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
      {/* Filter tabs with counts */}
      <div className="errors-grid__filters" role="tablist" aria-label="Filter error types">
        {FILTER_OPTIONS.map((opt) => {
          const count = counts[opt.countKey];
          const isActive = filter === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`errors-panel-${opt.value}`}
              id={`errors-tab-${opt.value}`}
              className={`errors-grid__filter ${isActive ? 'errors-grid__filter--active' : ''}`}
              onClick={() => setFilter(opt.value)}
            >
              <span className="errors-grid__filter-label">{opt.label}</span>
              <span className="errors-grid__filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Caption */}
      <div className="errors-grid__caption" aria-live="polite">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <span>These are model suspicions, not ground truth</span>
      </div>

      {/* Error grid */}
      <div className="errors-grid__grid" role="tabpanel" id={`errors-panel-${filter}`} aria-labelledby={`errors-tab-${filter}`}>
        {filteredErrors.map((item, _index) => {
          const tceDetail = detailCache[item.tce_id] || null;
          const isLoadingDetail = expandedDetails[item.tce_id];
          const isSelected = false; // Selection handled by inspector panel

          return (
            <ErrorCard
              key={item.tce_id}
              item={item}
              tceDetail={tceDetail}
              isLoadingDetail={isLoadingDetail}
              onClick={handleCardClick}
              isSelected={isSelected}
            />
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="errors-grid__summary">
        <span>Showing {filteredErrors.length} of {counts.total} error cases</span>
        {filter !== 'all' && (
          <span className="errors-grid__summary-filter">(filtered: {filter})</span>
        )}
      </div>
    </Panel>
  );
};

export default ErrorsGrid;