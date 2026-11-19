/**
 * TopCandidates - Leaderboard table (Rank, KepID, Period, Probability bar, True Label)
 * Filter by split dropdown (default TEST)
 * Click row to select TCE (updates store)
 * Styled to design system: clean table, no library themes
 */

import React, { useState } from 'react';
import { Panel } from '../Panel';
import { ProbabilityBar } from './ProbabilityBar';
import { useTopCandidates } from './useTopCandidates';
import { useSelectTce } from '../../store/useAppStore';
import type { Split } from '../../api/types';
import './TopCandidates.css';

export interface TopCandidatesProps {
  /** Panel tag letter (default: 'C') */
  tag?: string;
  /** Panel title (default: 'TOP CANDIDATES') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
  /** Default split (default: 'test') */
  defaultSplit?: Split;
  /** Default limit (default: 20) */
  defaultLimit?: number;
  /** Called when split changes */
  onSplitChange?: (split: Split) => void;
}

const SPLIT_OPTIONS: { value: Split; label: string }[] = [
  { value: 'train', label: 'TRAIN' },
  { value: 'val', label: 'VAL' },
  { label: 'TEST', value: 'test' },
];

/**
 * Format label number to name
 */
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

/**
 * Format period with appropriate precision
 */
function formatPeriod(period: number): string {
  if (period >= 100) {
    return period.toFixed(1);
  }
  if (period >= 10) {
    return period.toFixed(2);
  }
  return period.toFixed(3);
}

/**
 * Format TCE label for display
 */
function formatTrueLabel(label: number): string {
  const name = formatLabelName(label);
  return `${label} (${name})`;
}

export const TopCandidates: React.FC<TopCandidatesProps> = ({
  tag = 'C',
  title = 'TOP CANDIDATES',
  subtitle,
  className = '',
  cornerColor = 'primary',
  defaultSplit = 'test',
  defaultLimit = 20,
  onSplitChange,
}) => {
  const [split, setSplit] = useState<Split>(defaultSplit);
  const [limit] = useState(defaultLimit);
  const selectTce = useSelectTce();

  const { data: candidates, isLoading, error } = useTopCandidates({
    split,
    limit,
  });

  // Build dynamic subtitle with split and "NOT HELD-OUT RESULTS" tag
  const dynamicSubtitle = subtitle ?? `Ranked by CNN probability // ${split.toUpperCase()}`;

  // Handle row click - select TCE in store
  const handleRowClick = (tceId: string) => {
    selectTce(tceId);
  };

  // Handle split change
  const handleSplitChange = (newSplit: Split) => {
    setSplit(newSplit);
    onSplitChange?.(newSplit);
  };

  // Loading state
  if (isLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} top-candidates--loading`}
        cornerColor={cornerColor}
      >
        <div className="top-candidates__skeleton">
          <div className="top-candidates__controls-skeleton">
            <div className="top-candidates__dropdown-skeleton" />
          </div>
          <div className="top-candidates__table-skeleton">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="top-candidates__row-skeleton">
                <div className="top-candidates__cell-skeleton" style={{ width: '8%' }} />
                <div className="top-candidates__cell-skeleton" style={{ width: '18%' }} />
                <div className="top-candidates__cell-skeleton" style={{ width: '18%' }} />
                <div className="top-candidates__cell-skeleton" style={{ width: '42%' }} />
                <div className="top-candidates__cell-skeleton" style={{ width: '14%' }} />
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
        className={`${className} top-candidates--error`}
        cornerColor="red"
      >
        <div className="top-candidates__error">Failed to load top candidates</div>
      </Panel>
    );
  }

  // Empty state
  if (!candidates || candidates.length === 0) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={className}
        cornerColor={cornerColor}
      >
        <div className="top-candidates__empty">No candidates found for this split</div>
      </Panel>
    );
  }

  return (
    <Panel
      tag={tag}
      title={title}
      subtitle={dynamicSubtitle}
      className={className}
      cornerColor={cornerColor}
      noContentClip={true}
    >
      <div className="top-candidates__wrapper">
        {/* Controls: Split filter dropdown */}
        <div className="top-candidates__controls">
          {split !== 'test' && (
            <span className="top-candidates__not-held-out-tag" role="status" aria-live="polite">
              NOT HELD-OUT RESULTS
            </span>
          )}
          <label className="top-candidates__split-label" htmlFor="top-candidates-split">
            SPLIT
          </label>
          <select
            id="top-candidates-split"
            className="top-candidates__split-select"
            value={split}
            onChange={(e) => handleSplitChange(e.target.value as Split)}
          >
            {SPLIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="top-candidates__container">
          <table className="top-candidates__table">
          <thead>
            <tr className="top-candidates__header-row">
              <th className="top-candidates__header top-candidates__header--rank" scope="col">
                RANK
              </th>
              <th className="top-candidates__header top-candidates__header--kepid" scope="col">
                KEPID
              </th>
              <th className="top-candidates__header top-candidates__header--period" scope="col">
                PERIOD (DAYS)
              </th>
              <th className="top-candidates__header top-candidates__header--probability" scope="col">
                PROBABILITY
              </th>
              <th className="top-candidates__header top-candidates__header--label" scope="col">
                TRUE LABEL
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => (
              <tr
                key={candidate.tce_id}
                className={`top-candidates__row ${index === candidates.length - 1 ? 'top-candidates__row--last' : ''}`}
                onClick={() => handleRowClick(candidate.tce_id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleRowClick(candidate.tce_id);
                  }
                }}
                title="Click to select"
              >
                <td className="top-candidates__cell top-candidates__cell--rank">
                  <span className="top-candidates__rank">{candidate.rank}</span>
                </td>
                <td className="top-candidates__cell top-candidates__cell--kepid">
                  <span className="top-candidates__kepid">{candidate.kepid}</span>
                </td>
                <td className="top-candidates__cell top-candidates__cell--period">
                  <span className="top-candidates__period">{formatPeriod(candidate.period)}</span>
                </td>
                <td className="top-candidates__cell top-candidates__cell--probability">
                  <ProbabilityBar
                    probability={candidate.probability}
                    width="100%"
                    height={8}
                    showValue={true}
                    title={`KepID ${candidate.kepid} • TCE ${candidate.tce_id} • Prob: ${(candidate.probability * 100).toFixed(1)}% • True: ${formatTrueLabel(candidate.true_label)}`}
                  />
                </td>
                <td className="top-candidates__cell top-candidates__cell--label">
                  <span
                    className={`top-candidates__label top-candidates__label--${candidate.true_label === 1 ? 'planet' : candidate.true_label === 2 ? 'afp' : 'ntp'}`}
                  >
                    {formatTrueLabel(candidate.true_label)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </Panel>
  );
};