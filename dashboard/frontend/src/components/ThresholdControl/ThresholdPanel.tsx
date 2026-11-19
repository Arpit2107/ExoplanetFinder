/**
 * ThresholdPanel - Docked panel for threshold control with collapse/expand
 * Replaces the floating threshold slider in the bottom bar
 * Default expanded at >=1080px viewport height, collapsed below
 */

import React, { useState, useEffect } from 'react';
import { Panel } from '../Panel';
import { ThresholdSlider } from './ThresholdSlider';
import { useThreshold as useThresholdQuery } from '../../api/queries';
import { useThreshold as useStoreThresholdValue } from '../../store/useAppStore';
import './ThresholdPanel.css';

export interface ThresholdPanelProps {
  /** Panel tag letter (default: 'G') */
  tag?: string;
  /** Panel title (default: 'THRESHOLD CONTROL') */
  title?: string;
  /** Additional CSS classes */
  className?: string;
  /** Corner color variant */
  cornerColor?: 'primary' | 'amber' | 'red' | 'green';
  /** Split to use for threshold evaluation (default: "test") */
  split?: 'train' | 'val' | 'test';
  /** Callback when threshold changes (for sphere recoloring) */
  onThresholdChange?: (threshold: number) => void;
  /** Variant: 'panel' for side panel (default), 'docked' for bottom strip */
  variant?: 'panel' | 'docked';
}

const MIN_HEIGHT_EXPANDED = 1080; // viewport height threshold for default expanded

// Simple collapsed view component
interface CollapsedThresholdViewProps {
  split: 'train' | 'val' | 'test';
}

const CollapsedThresholdView: React.FC<CollapsedThresholdViewProps> = ({ split }) => {
  const storeThreshold = useStoreThresholdValue();
  const { data: thresholdResponse } = useThresholdQuery(storeThreshold, split);

  const formatMetric = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    return (value * 100).toFixed(1) + '%';
  };

  const formatThreshold = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    return value.toFixed(2);
  };

  // Handle click on the threshold value to allow editing
  // For now, just show the readout

  return (
    <div className="threshold-panel__collapsed-readout" role="region" aria-label="Threshold summary">
      <span className="threshold-panel__label">THRESHOLD</span>
      <span className="threshold-panel__value">{formatThreshold(thresholdResponse?.threshold ?? storeThreshold)}</span>
      <span className="threshold-panel__label">P</span>
      <span className="threshold-panel__value">{formatMetric(thresholdResponse?.precision)}</span>
      <span className="threshold-panel__label">R</span>
      <span className="threshold-panel__value">{formatMetric(thresholdResponse?.recall)}</span>
    </div>
  );
};

export const ThresholdPanel: React.FC<ThresholdPanelProps> = ({
  tag = 'G',
  title = 'THRESHOLD CONTROL',
  className = '',
  cornerColor = 'primary',
  split = 'test',
  onThresholdChange,
  variant = 'panel',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 1080
  );

  // Update viewport height on resize
  useEffect(() => {
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Default to expanded at >=1080px, collapsed below (only for panel variant)
  useEffect(() => {
    if (variant === 'panel') {
      setIsCollapsed(viewportHeight < MIN_HEIGHT_EXPANDED);
    }
  }, [viewportHeight, variant]);

  const handleToggle = () => {
    setIsCollapsed(!isCollapsed);
  };

  // Docked variant - compact, no Panel wrapper, always show collapsed readout with toggle to slider
  if (variant === 'docked') {
    return (
      <div className={`${className} threshold-panel threshold-panel--docked ${isCollapsed ? 'threshold-panel--collapsed' : ''}`} role="region" aria-label="Threshold control">
        <div className="threshold-panel__header threshold-panel__header--docked" onClick={handleToggle}>
          <span className="threshold-panel__title">THRESHOLD</span>
          <span className="threshold-panel__collapse-btn" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
            {isCollapsed ? '[+]' : '[-]'}
          </span>
        </div>
        <div className="threshold-panel__content threshold-panel__content--docked" style={{ overflow: isCollapsed ? 'hidden' : 'auto' }}>
          {isCollapsed ? (
            // Collapsed view - single slim row
            <CollapsedThresholdView split={split} />
          ) : (
            // Expanded view - compact slider
            <ThresholdSlider
              split={split}
              onThresholdChange={onThresholdChange}
              className="threshold-slider--compact"
            />
          )}
        </div>
      </div>
    );
  }

  // Panel variant (original behavior for side panels)
  return (
    <Panel
      tag={tag}
      title={title}
      className={`${className} threshold-panel ${isCollapsed ? 'threshold-panel--collapsed' : ''}`}
      cornerColor={cornerColor}
      tagPosition="tl"
    >
      <div className="threshold-panel__header" onClick={handleToggle}>
        <span className="threshold-panel__collapse-btn" aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
          {isCollapsed ? '[+]' : '[-]'}
        </span>
      </div>
      <div className="threshold-panel__content" style={{ overflow: isCollapsed ? 'hidden' : 'auto' }}>
        {isCollapsed ? (
          // Collapsed view - single slim row
          <CollapsedThresholdView split={split} />
        ) : (
          // Expanded view - full slider
          <ThresholdSlider
            split={split}
            onThresholdChange={onThresholdChange}
          />
        )}
      </div>
    </Panel>
  );
};

export default ThresholdPanel;