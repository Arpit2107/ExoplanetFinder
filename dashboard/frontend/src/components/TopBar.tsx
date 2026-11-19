/* TopBar - Title with status ticker strip and Signal Selector */

import React from 'react';
import { SignalSelector } from './SignalSelector';
import './TopBar.css';

export interface TopBarProps {
  title?: string;
  tickerText?: string;
  className?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title = 'EXOPLANET FINDER',
  tickerText = 'KEPLER DR24 // TCE VIEWER // SPLIT: TEST',
  className = '',
}) => {
  return (
    <header className={`top-bar ${className}`} role="banner">
      <div className="top-bar__title-section">
        <h1 className="top-bar__title">{title}</h1>
      </div>
      <div className="top-bar__signal-selector-section">
        <SignalSelector defaultSplit="test" />
      </div>
      <div className="top-bar__ticker" aria-live="polite" aria-atomic="true">
        <span className="top-bar__ticker-content">{tickerText}</span>
      </div>
      <div className="top-bar__hairline" aria-hidden="true" />
    </header>
  );
};