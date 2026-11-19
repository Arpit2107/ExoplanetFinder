/* Readout - Large counter with small-caps label */

import React from 'react';
import './Readout.css';

export interface ReadoutProps {
  value: number | string;
  label: string;
  unit?: string;
  className?: string;
  color?: 'primary' | 'amber' | 'red' | 'green' | 'white';
  animate?: boolean;
  precision?: number;
}

export const Readout: React.FC<ReadoutProps> = ({
  value,
  label,
  unit,
  className = '',
  color = 'primary',
  animate = false,
  precision,
}) => {
  const colorClass = color !== 'primary' ? `readout--${color}` : '';
  const animateClass = animate ? 'readout--animate' : '';

  // Format the value
  const displayValue = typeof value === 'number' && precision !== undefined
    ? value.toFixed(precision)
    : value;

  return (
    <div className={`readout ${colorClass} ${animateClass} ${className}`}>
      <div className="readout__value" data-value={displayValue}>
        <span className="readout__number">{displayValue}</span>
        {unit && <span className="readout__unit">{unit}</span>}
      </div>
      <div className="readout__label">{label}</div>
    </div>
  );
};