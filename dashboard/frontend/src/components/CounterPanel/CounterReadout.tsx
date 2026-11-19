/**
 * CounterReadout - Animated count-up readout for instrument-style counters
 * Counts from 0 to target value on mount with easing
 */

import React, { useEffect, useState, useRef } from 'react';
import './CounterReadout.css';

export interface CounterReadoutProps {
  /** The target value to count up to */
  value: number;
  /** Label displayed below the number */
  label: string;
  /** Optional unit suffix (e.g., "TCEs", "PCs") */
  unit?: string;
  /** Additional CSS classes */
  className?: string;
  /** Color variant for the number */
  color?: 'primary' | 'amber' | 'red' | 'green' | 'white';
  /** Duration of count-up animation in milliseconds */
  duration?: number;
  /** Delay before animation starts in milliseconds */
  delay?: number;
  /** Number of decimal places (for non-integer values) */
  precision?: number;
  /** Format as integer with commas (for large numbers) */
  useCommas?: boolean;
}

interface FormattedValue {
  integerPart: string;
  decimalPart: string;
}

/**
 * Format a number with optional commas and precision
 */
function formatNumber(
  num: number,
  precision: number = 0,
  useCommas: boolean = true
): FormattedValue {
  const fixed = num.toFixed(precision);
  const parts = fixed.split('.');
  const integerPart = useCommas ? Number(parts[0]).toLocaleString() : parts[0];
  const decimalPart = parts[1] ? `.${parts[1]}` : '';
  return { integerPart, decimalPart };
}

/**
 * Easing function for smooth count-up (ease-out cubic)
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export const CounterReadout: React.FC<CounterReadoutProps> = ({
  value,
  label,
  unit,
  className = '',
  color = 'primary',
  duration = 1200,
  delay = 0,
  precision = 0,
  useCommas = true,
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Format the target value (used for reference, currently not used in render)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { integerPart: _targetInteger, decimalPart: _targetDecimal } = formatNumber(value, precision, useCommas);

  useEffect(() => {
    // Reset animation when value changes
    setDisplayValue(0);
    setIsAnimating(true);
    startTimeRef.current = null;

    // Cancel any existing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp + delay;
      }

      const elapsed = timestamp - startTimeRef.current;

      if (elapsed < 0) {
        // Still in delay period
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = value * easedProgress;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
        // Ensure exact final value
        setDisplayValue(value);
      }
    };

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      setIsAnimating(false);
      return;
    }

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration, delay, precision, useCommas]);

  // Format display value
  const { integerPart, decimalPart } = formatNumber(displayValue, precision, useCommas);

  const colorClass = color !== 'primary' ? `counter-readout--${color}` : '';
  const animateClass = isAnimating ? 'counter-readout--animating' : '';

  return (
    <div className={`counter-readout ${colorClass} ${animateClass} ${className}`}>
      <div className="counter-readout__value" data-value={value}>
        <span className="counter-readout__number">
          {integerPart}
          {decimalPart && <span className="counter-readout__decimal">{decimalPart}</span>}
        </span>
        {unit && <span className="counter-readout__unit">{unit}</span>}
      </div>
      <div className="counter-readout__label">{label}</div>
    </div>
  );
};