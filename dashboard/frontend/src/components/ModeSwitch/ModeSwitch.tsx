/**
 * ModeSwitch - Segmented control for dashboard view modes
 * EXPLORE | ERRORS | COMPARE | KEPLER-90
 * Updates store.mode, supports keyboard shortcuts (1-4), design system styling
 */

import React, { useEffect, useCallback } from 'react';
import { useMode, useSetMode } from '../../store/useAppStore';
import type { AppMode } from '../../store/useAppStore';
import './ModeSwitch.css';

export interface ModeSwitchProps {
  /** Additional CSS classes */
  className?: string;
  /** Label text for the switch group */
  label?: string;
}

export const ModeSwitch: React.FC<ModeSwitchProps> = ({
  className = '',
  label = 'MODE',
}) => {
  const mode = useMode();
  const setMode = useSetMode();

  // Mode definitions with keyboard shortcuts
  const modes: Array<{
    value: AppMode;
    label: string;
    shortLabel: string;
    key: string;
    description: string;
  }> = [
    { value: 'explore', label: 'EXPLORE', shortLabel: 'EXP', key: '1', description: 'Default sky sphere view with TCEs' },
    { value: 'errors', label: 'ERRORS', shortLabel: 'ERR', key: '2', description: 'False positives/negatives grid' },
    { value: 'compare', label: 'COMPARE', shortLabel: 'CMP', key: '3', description: 'Side-by-side TCE comparison' },
    { value: 'kepler90', label: 'KEPLER-90', shortLabel: 'K90', key: '4', description: 'Kepler-90 system illustration' },
  ];

  // Handle keyboard shortcuts (1-4)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only handle number keys 1-4 when not in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    const key = e.key;
    if (key >= '1' && key <= '4') {
      e.preventDefault();
      const index = parseInt(key, 10) - 1;
      if (modes[index]) {
        setMode(modes[index].value);
      }
    }
  }, [setMode]);

  // Set up global keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle mode selection
  const handleModeClick = useCallback((newMode: AppMode) => {
    setMode(newMode);
  }, [setMode]);

  return (
    <div className={`mode-switch ${className}`} role="group" aria-label="Dashboard view mode">
      {/* Label */}
      <div className="mode-switch__label-group">
        <span className="mode-switch__title">{label}</span>
        <span className="mode-switch__subtitle">View mode (1-4)</span>
      </div>

      {/* Segmented control */}
      <div className="mode-switch__segments" role="radiogroup" aria-label="Select view mode">
        {modes.map((modeDef, _index) => {
          const isActive = mode === modeDef.value;
          return (
            <button
              key={modeDef.value}
              type="button"
              className={`mode-switch__segment ${isActive ? 'mode-switch__segment--active' : ''}`}
              role="radio"
              aria-checked={isActive}
              aria-label={modeDef.description}
              title={`${modeDef.description} (Press ${modeDef.key})`}
              onClick={() => handleModeClick(modeDef.value)}
            >
              <span className="mode-switch__segment-label">{modeDef.label}</span>
              <span className="mode-switch__segment-key" aria-hidden="true">{modeDef.key}</span>
              {isActive && <span className="mode-switch__segment-indicator" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Active mode description */}
      <div className="mode-switch__description" aria-live="polite">
        {modes.find(m => m.value === mode)?.description}
      </div>
    </div>
  );
};

export default ModeSwitch;