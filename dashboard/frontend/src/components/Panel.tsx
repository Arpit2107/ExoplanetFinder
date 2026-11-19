/* Panel - Thin framed panel with corner brackets, lettered tag, title and subtitle */

import React from 'react';
import { CornerBrackets } from './CornerBrackets';
import './Panel.css';

export interface PanelProps {
  tag: string;                    // Letter tag: 'A', 'B', 'C', etc.
  title: string;                  // Tiny uppercase title
  subtitle?: string;              // Lighter subtitle caption
  children: React.ReactNode;      // Panel content
  className?: string;
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
  tagPosition?: 'tl' | 'tr' | 'bl' | 'br'; // Tag corner position
  /** Disable overflow clipping on content area (for dropdowns, etc.) */
  noContentClip?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  tag,
  title,
  subtitle,
  children,
  className = '',
  cornerColor = 'primary',
  tagPosition = 'tl',
  noContentClip = false,
}) => {
  const tagClass = `panel__tag panel__tag--${tagPosition}`;
  const contentClass = `panel__content panel-scan ${noContentClip ? 'panel__content--no-clip' : ''}`;

  return (
    <div className={`panel ${className}`}>
      <CornerBrackets color={cornerColor} />
      <div className={tagClass}>{tag}</div>
      <div className="panel__header">
        <h3 className="panel__title">{title}</h3>
        {subtitle && <span className="panel__subtitle">{subtitle}</span>}
      </div>
      <div className={contentClass}>
        {children}
      </div>
    </div>
  );
};