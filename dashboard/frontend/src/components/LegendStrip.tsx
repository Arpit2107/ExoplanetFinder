/* LegendStrip - Row of small colored squares with labels and ID-like values */

import React from 'react';
import './LegendStrip.css';

export interface LegendItem {
  id: string;
  label: string;
  color: 'amber' | 'red' | 'green' | 'white' | 'grey';
}

export interface LegendStripProps {
  items: LegendItem[];
  className?: string;
  orientation?: 'horizontal' | 'vertical';
  showIds?: boolean;
}

export const LegendStrip: React.FC<LegendStripProps> = ({
  items,
  className = '',
  orientation = 'horizontal',
  showIds = true,
}) => {
  const orientationClass = orientation === 'horizontal' ? 'legend-strip--horizontal' : 'legend-strip--vertical';

  const colorMap: Record<LegendItem['color'], string> = {
    amber: 'var(--semantic-amber)',
    red: 'var(--semantic-red)',
    green: 'var(--semantic-green)',
    white: 'var(--semantic-white)',
    grey: 'var(--line-primary)',
  };

  return (
    <div className={`legend-strip ${orientationClass} ${className}`}>
      {items.map((item, index) => (
        <div key={index} className="legend-strip__item">
          <span
            className="legend-strip__swatch"
            style={{ backgroundColor: colorMap[item.color] }}
            aria-hidden="true"
          />
          <span className="legend-strip__label">{item.label}</span>
          {showIds && <span className="legend-strip__id">{item.id}</span>}
        </div>
      ))}
    </div>
  );
};