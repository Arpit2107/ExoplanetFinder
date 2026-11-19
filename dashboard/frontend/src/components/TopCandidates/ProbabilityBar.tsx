/**
 * ProbabilityBar - Horizontal bar visualization (grey → amber)
 * Shows CNN probability with a threshold marker
 * Styled to design system: hairlines, mono numbers, no library themes
 */

import React from 'react';
import './ProbabilityBar.css';

export interface ProbabilityBarProps {
  /** Probability value (0-1) */
  probability: number;
  /** Current threshold (0-1) - shows as a marker on the bar */
  threshold?: number;
  /** Width of the bar container (default: 100%) */
  width?: string | number;
  /** Height of the bar in pixels (default: 8) */
  height?: number;
  /** Show probability value as text */
  showValue?: boolean;
  /** Tooltip text on hover */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Horizontal probability bar with gradient from grey to amber
 * and a threshold indicator marker
 */
export const ProbabilityBar: React.FC<ProbabilityBarProps> = ({
  probability,
  threshold,
  width = '100%',
  height = 8,
  showValue = true,
  title,
  className = '',
}) => {
  // Clamp probability to [0, 1]
  const p = Math.max(0, Math.min(1, probability));
  const t = threshold !== undefined ? Math.max(0, Math.min(1, threshold)) : null;

  // Calculate positions as percentages
  const probabilityPercent = p * 100;
  const thresholdPercent = t !== null ? t * 100 : null;

  // Format probability for display
  const formattedProb = (p * 100).toFixed(1);

  return (
    <div
      className={`probability-bar ${className}`}
      style={{ width, '--bar-height': `${height}px` } as React.CSSProperties}
      title={title || `Probability: ${formattedProb}%`}
      role="img"
      aria-label={title || `Probability: ${formattedProb}%`}
    >
      {/* Background track */}
      <div className="probability-bar__track" />

      {/* Filled portion with gradient */}
      <div
        className="probability-bar__fill"
        style={{
          width: `${probabilityPercent}%`,
        } as React.CSSProperties}
      >
        {/* Inner gradient: grey → amber */}
        <div className="probability-bar__gradient" />
      </div>

      {/* Threshold marker */}
      {t !== null && (
        <div
          className="probability-bar__threshold-marker"
          style={{
            left: `${thresholdPercent}%`,
          } as React.CSSProperties}
          title={`Threshold: ${(t * 100).toFixed(1)}%`}
        >
          <span className="probability-bar__threshold-tooltip">
            {(t * 100).toFixed(1)}%
          </span>
        </div>
      )}

      {/* Probability value label */}
      {showValue && (
        <span className="probability-bar__value" style={{ '--bar-height': `${height}px` } as React.CSSProperties}>
          {formattedProb}%
        </span>
      )}
    </div>
  );
};