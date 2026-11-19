/* LeaderLine - Thin SVG line between two points */

import React from 'react';
import './LeaderLine.css';

export interface LeaderLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: 'red' | 'amber' | 'primary';
  className?: string;
  strokeWidth?: number;
}

export const LeaderLine: React.FC<LeaderLineProps> = ({
  x1,
  y1,
  x2,
  y2,
  color = 'red',
  className = '',
  strokeWidth = 1,
}) => {
  const colorClass = `leader-line--${color}`;

  return (
    <svg
      className={`leader-line ${colorClass} ${className}`}
      viewBox={`${Math.min(x1, x2) - strokeWidth} ${Math.min(y1, y2) - strokeWidth} ${Math.abs(x2 - x1) + strokeWidth * 2} ${Math.abs(y2 - y1) + strokeWidth * 2}`}
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        left: Math.min(x1, x2),
        top: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <line
        x1={x1 - Math.min(x1, x2)}
        y1={y1 - Math.min(y1, y2)}
        x2={x2 - Math.min(x1, x2)}
        y2={y2 - Math.min(y1, y2)}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
};