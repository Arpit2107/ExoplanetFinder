/* CornerBrackets - L-shaped corner brackets for panels */
/* 1px hairline, no full border */

import React from 'react';
import './CornerBrackets.css';

interface CornerBracketsProps {
  className?: string;
  color?: 'primary' | 'amber' | 'red' | 'green';
}

export const CornerBrackets: React.FC<CornerBracketsProps> = ({
  className = '',
  color = 'primary',
}) => {
  const colorClass = color !== 'primary' ? `corner-brackets--${color}` : '';

  return (
    <div className={`corner-brackets ${colorClass} ${className}`} aria-hidden="true">
      <span className="corner-brackets__corner corner-brackets__corner--tl"></span>
      <span className="corner-brackets__corner corner-brackets__corner--tr"></span>
      <span className="corner-brackets__corner corner-brackets__corner--bl"></span>
      <span className="corner-brackets__corner corner-brackets__corner--br"></span>
    </div>
  );
};