/**
 * CounterPanel - Dashboard panel showing TCE statistics
 * Displays total TCEs, planet candidates, astrophysical false positives, and non-transiting phenomena
 * Uses Panel wrapper with instrument-style animated CounterReadout components
 */

import React from 'react';
import { Panel } from '../Panel';
import { CounterReadout } from './CounterReadout';
import { useCounters } from './useCounters';
import './CounterPanel.css';

export interface CounterPanelProps {
  /** Panel tag letter (default: 'A') */
  tag?: string;
  /** Panel title (default: 'COUNTERS') */
  title?: string;
  /** Panel subtitle */
  subtitle?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
}

export const CounterPanel: React.FC<CounterPanelProps> = ({
  tag = 'A',
  title = 'COUNTERS',
  subtitle = 'TCE population breakdown',
  className = '',
  cornerColor = 'primary',
}) => {
  const { data: counters, isLoading, error } = useCounters();

  if (isLoading) {
    return (
      <Panel
        tag={tag}
        title={title}
        subtitle={subtitle}
        className={`${className} counter-panel--loading`}
        cornerColor={cornerColor}
      >
        <div className="counter-panel__skeleton">
          <div className="counter-skeleton" />
          <div className="counter-skeleton" />
          <div className="counter-skeleton" />
          <div className="counter-skeleton" />
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
        className={`${className} counter-panel--error`}
        cornerColor="red"
      >
        <div className="counter-panel__error">
          Failed to load counters
        </div>
      </Panel>
    );
  }

  if (!counters) {
    return null;
  }

  const counterItems = [
    {
      key: 'total',
      value: counters.total_tces,
      label: 'TOTAL TCEs',
      unit: 'TCEs',
      color: 'primary' as const,
      delay: 0,
    },
    {
      key: 'planets',
      value: counters.planet_candidates,
      label: 'PLANET CANDIDATES',
      unit: 'PCs',
      color: 'amber' as const,
      delay: 100,
    },
    {
      key: 'afp',
      value: counters.astrophysical_false_positives,
      label: 'ASTROPHYSICAL FPs',
      unit: 'AFPs',
      color: 'red' as const,
      delay: 200,
    },
    {
      key: 'ntp',
      value: counters.non_transiting_phenomena,
      label: 'NON-TRANSITING',
      unit: 'NTPs',
      color: 'white' as const,
      delay: 300,
    },
  ];

  return (
    <Panel
      tag={tag}
      title={title}
      subtitle={subtitle}
      className={className}
      cornerColor={cornerColor}
    >
      <div className="counter-panel__grid">
        {counterItems.map((item) => (
          <CounterReadout
            key={item.key}
            value={item.value}
            label={item.label}
            unit={item.unit}
            color={item.color}
            delay={item.delay}
            duration={1000}
            useCommas={true}
            className="counter-panel__readout"
          />
        ))}
      </div>
    </Panel>
  );
};