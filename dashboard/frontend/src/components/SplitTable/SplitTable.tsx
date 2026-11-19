/**
 * SplitTable - Dashboard panel showing train/val/test split statistics
 * Displays: Split, Stars, TCEs, Planet Fraction
 * Styled to design system: hairlines, mono numbers, Chakra Petch headers
 */

import React from 'react';
import { Panel } from '../Panel';
import { useSplits } from './useSplits';
import './SplitTable.css';

export interface SplitTableProps {
  /** Panel tag letter (default: 'B') */
  tag?: string;
  /** Panel title (default: 'SPLITS') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
}

interface SplitRowData {
  split: 'train' | 'val' | 'test';
  n_stars: number;
  n_tces: number;
  planet_fraction: number;
}

export const SplitTable: React.FC<SplitTableProps> = ({
  tag = 'B',
  title = 'SPLITS',
  subtitle = 'Train / Val / Test distribution',
  className = '',
  cornerColor = 'primary',
}) => {
  const { data: splits, isLoading, error } = useSplits();

  if (isLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} split-table--loading`}
        cornerColor={cornerColor}
      >
        <div className="split-table__skeleton">
          <div className="split-table__row split-table__row--skeleton">
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
          </div>
          <div className="split-table__row split-table__row--skeleton">
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
          </div>
          <div className="split-table__row split-table__row--skeleton">
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
            <div className="split-table__cell" />
          </div>
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} split-table--error`}
        cornerColor="red"
      >
        <div className="split-table__error">Failed to load split statistics</div>
      </Panel>
    );
  }

  if (!splits || splits.length === 0) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={className}
        cornerColor={cornerColor}
      >
        <div className="split-table__empty">No split data available</div>
      </Panel>
    );
  }

  // Ensure consistent ordering: train, val, test
  const orderedSplits: SplitRowData[] = ['train', 'val', 'test'].map((splitName) => {
    const found = splits.find((s) => s.split === splitName);
    return found || {
      split: splitName as 'train' | 'val' | 'test',
      n_stars: 0,
      n_tces: 0,
      planet_fraction: 0,
    };
  });

  return (
    <Panel
      tag={tag}
      title={title}
      subtitle={subtitle}
      className={className}
      cornerColor={cornerColor}
    >
      <div className="split-table__container">
        <table className="split-table">
          <thead>
            <tr className="split-table__header-row">
              <th className="split-table__header split-table__header--split" scope="col">SPLIT</th>
              <th className="split-table__header split-table__header--stars" scope="col">STARS</th>
              <th className="split-table__header split-table__header--tces" scope="col">TCES</th>
              <th className="split-table__header split-table__header--fraction" scope="col">PLANET FRACTION</th>
            </tr>
          </thead>
          <tbody>
            {orderedSplits.map((row, index) => (
              <tr key={row.split} className={`split-table__row split-table__row--${row.split} ${index === orderedSplits.length - 1 ? 'split-table__row--last' : ''}`}>
                <td className="split-table__cell split-table__cell--split">
                  <span className="split-table__split-label">{row.split.toUpperCase()}</span>
                </td>
                <td className="split-table__cell split-table__cell--stars">
                  <span className="split-table__value split-table__value--stars">{formatNumber(row.n_stars)}</span>
                </td>
                <td className="split-table__cell split-table__cell--tces">
                  <span className="split-table__value split-table__value--tces">{formatNumber(row.n_tces)}</span>
                </td>
                <td className="split-table__cell split-table__cell--fraction">
                  <span className="split-table__value split-table__value--fraction">{formatFraction(row.planet_fraction)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

/**
 * Format integer with commas for readability
 */
function formatNumber(num: number): string {
  return Number(num).toLocaleString();
}

/**
 * Format planet fraction as percentage with 2 decimal places
 */
function formatFraction(frac: number): string {
  return `${(frac * 100).toFixed(2)}%`;
}