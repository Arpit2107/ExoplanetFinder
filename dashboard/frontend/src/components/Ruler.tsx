/* Ruler - Tick-mark ruler for chart axes */

import React from 'react';
import './Ruler.css';

export type RulerOrientation = 'horizontal' | 'vertical';

export interface RulerProps {
  orientation: RulerOrientation;
  tickCount: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
  showLabels?: boolean;
  labelFormatter?: (value: number) => string;
}

export const Ruler: React.FC<RulerProps> = ({
  orientation,
  tickCount,
  minValue = 0,
  maxValue = 1,
  className = '',
  showLabels = true,
  labelFormatter,
}) => {
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const t = i / (tickCount - 1);
    const value = minValue + t * (maxValue - minValue);
    return { t, value };
  });

  const orientationClass = orientation === 'horizontal' ? 'ruler--horizontal' : 'ruler--vertical';

  return (
    <div className={`ruler ${orientationClass} ${className}`} aria-hidden="true">
      {ticks.map((tick, index) => (
        <span
          key={index}
          className="ruler__tick"
          style={{
            [orientation === 'horizontal' ? 'left' : 'bottom']: `${tick.t * 100}%`,
          }}
        >
          {showLabels && (
            <span className="ruler__label">
              {labelFormatter ? labelFormatter(tick.value) : tick.value.toFixed(2)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
};