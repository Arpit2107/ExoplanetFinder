/**
 * ThresholdSlider - Interactive threshold control for model classification
 * 0-1 slider that calls POST /api/threshold, shows live precision/recall/confusion matrix,
 * marks validation-chosen threshold, and recolors sphere points in real-time.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useUpdateThreshold, useOptimalThreshold, useThreshold } from '../../api/queries';
import { useThreshold as useStoreThreshold, useSetThreshold } from '../../store/useAppStore';
import './ThresholdSlider.css';

export interface ThresholdSliderProps {
  /** Split to use for threshold evaluation (default: "test") */
  split?: 'train' | 'val' | 'test';
  /** Additional CSS classes */
  className?: string;
  /** Callback when threshold changes (for sphere recoloring) */
  onThresholdChange?: (threshold: number) => void;
}

const DEFAULT_THRESHOLD = 0.5;

export const ThresholdSlider: React.FC<ThresholdSliderProps> = ({
  split = 'test',
  className = '',
  onThresholdChange,
}) => {
  // Store threshold (for immediate UI feedback)
  const storeThreshold = useStoreThreshold();
  const setStoreThreshold = useSetThreshold();

  // API hooks
  const { data: optimalThresholdData, isLoading: optimalLoading } = useOptimalThreshold('cnn');
  const updateThresholdMutation = useUpdateThreshold();
  const { data: thresholdResponse, isLoading: thresholdLoading } = useThreshold(storeThreshold, split);

  // Local state for drag interaction
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState<number>(storeThreshold);

  // Validation-chosen threshold from backend
  const validationThreshold = optimalThresholdData?.threshold ?? DEFAULT_THRESHOLD;

  // On mount, if store threshold is the default (0.5), update it to the validation-chosen threshold
  useEffect(() => {
    if (storeThreshold === DEFAULT_THRESHOLD && optimalThresholdData?.threshold !== undefined) {
      setStoreThreshold(optimalThresholdData.threshold);
    }
  }, [storeThreshold, optimalThresholdData?.threshold, setStoreThreshold]);

  // Determine current display threshold
  // Show "--" until we have loaded the threshold response
  const currentValue = isDragging ? dragValue : storeThreshold;
  const displayThreshold = thresholdResponse?.threshold ?? currentValue;

  // Determine if we have valid metrics to display
  const hasMetrics = thresholdResponse !== undefined && !thresholdLoading;

  // Refs for drag handling
  const trackRef = useRef<HTMLDivElement>(null);

  // Notify parent (sphere) of threshold changes for recoloring
  useEffect(() => {
    if (!isDragging && thresholdResponse) {
      onThresholdChange?.(thresholdResponse.threshold);
    }
  }, [thresholdResponse, isDragging, onThresholdChange]);

  // Calculate slider value from mouse/touch position
  const calculateValueFromEvent = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return currentValue;

    const rect = track.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, relativeX / rect.width));
    return percentage;
  }, [currentValue]);

  // Handle mouse/touch move during drag
  const handleDragMove = useCallback((clientX: number) => {
    if (!isDragging) return;
    const newValue = calculateValueFromEvent(clientX);
    setDragValue(newValue);
    setStoreThreshold(newValue);
  }, [isDragging, calculateValueFromEvent, setStoreThreshold]);

  // Handle drag end (commit to API)
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    updateThresholdMutation.mutate({ threshold: dragValue });
  }, [isDragging, dragValue, updateThresholdMutation]);

  // Handle mouse down on track
  const handleTrackMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const track = trackRef.current;
    if (!track) return;

    const newValue = calculateValueFromEvent(e.clientX);
    setDragValue(newValue);
    setStoreThreshold(newValue);
    setIsDragging(true);
  }, [calculateValueFromEvent, setStoreThreshold]);

  // Handle touch start on track
  const handleTrackTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;

    const touch = e.touches[0];
    const newValue = calculateValueFromEvent(touch.clientX);
    setDragValue(newValue);
    setStoreThreshold(newValue);
    setIsDragging(true);
  }, [calculateValueFromEvent, setStoreThreshold]);

  // Handle keyboard input for accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 0.01;
    const largeStep = 0.05;
    let newValue = currentValue;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        newValue = Math.min(1, currentValue + (e.shiftKey ? largeStep : step));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newValue = Math.max(0, currentValue - (e.shiftKey ? largeStep : step));
        break;
      case 'Home':
        e.preventDefault();
        newValue = 0;
        break;
      case 'End':
        e.preventDefault();
        newValue = 1;
        break;
      default:
        return;
    }

    setDragValue(newValue);
    setStoreThreshold(newValue);
    if (!isDragging) setIsDragging(true);
  }, [currentValue, isDragging, setStoreThreshold]);

  // Set up global mouse/touch event listeners for dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleDragMove(e.clientX);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e: TouchEvent) => handleDragMove(e.touches[0].clientX);
    const handleTouchEnd = () => handleDragEnd();

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Format threshold display
  const formatThreshold = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    return value.toFixed(2);
  };

  // Format metric value (precision, recall, F1)
  const formatMetric = (value: number | undefined): string => {
    if (value === undefined || value === null) return '--';
    return (value * 100).toFixed(1) + '%';
  };

  // Confusion matrix from response
  const confusion = thresholdResponse?.confusion_matrix;

  return (
    <div className={`threshold-slider ${className}`} role="region" aria-label="Classification threshold control">
      {/* Header with current threshold */}
      <div className="threshold-slider__header">
        <div className="threshold-slider__title-group">
          <span className="threshold-slider__title">THRESHOLD</span>
          <span className="threshold-slider__subtitle">CNN probability cutoff</span>
        </div>
        <div className="threshold-slider__value-display">
          <span className="threshold-slider__value-label">CURRENT</span>
          <span
            className={`threshold-slider__value ${isDragging ? 'threshold-slider__value--dragging' : ''}`}
            aria-live="polite"
          >
            {formatThreshold(displayThreshold)}
          </span>
        </div>
      </div>

      {/* Slider track with validation marker */}
      <div className="threshold-slider__track-container">
        <div
          ref={trackRef}
          className="threshold-slider__track"
          role="slider"
          aria-label="Classification threshold"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={displayThreshold !== undefined && displayThreshold !== null ? displayThreshold : 0}
          aria-valuetext={`Threshold ${formatThreshold(displayThreshold)}`}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onMouseDown={handleTrackMouseDown}
          onTouchStart={handleTrackTouchStart}
        >
          {/* Fill track (below threshold) */}
          <div
            className="threshold-slider__fill"
            style={{ width: `${currentValue * 100}%` }}
          />

          {/* Validation threshold marker */}
          <div
            className="threshold-slider__validation-marker"
            style={{ left: `${validationThreshold * 100}%` }}
            title={`Validation optimal: ${validationThreshold.toFixed(2)}`}
            aria-hidden="true"
          >
            <span className="threshold-slider__validation-tooltip">
              VAL: {validationThreshold.toFixed(2)}
              <span className="threshold-slider__val-chosen-label">VAL-CHOSEN</span>
            </span>
          </div>

          {/* Current threshold handle */}
          <div
            className="threshold-slider__handle"
            style={{ left: `${currentValue * 100}%` }}
            aria-hidden="true"
          >
            <div className="threshold-slider__handle-inner" />
          </div>
        </div>

        {/* Track labels */}
        <div className="threshold-slider__track-labels">
          <span>0.00</span>
          <span>0.50</span>
          <span>1.00</span>
        </div>
      </div>

      {/* Metrics readouts */}
      <div className="threshold-slider__metrics" aria-live="polite">
        <div className="threshold-slider__metric">
          <span className="threshold-slider__metric-label">PRECISION</span>
          <span className="threshold-slider__metric-value">
            {formatMetric(thresholdResponse?.precision)}
          </span>
        </div>
        <div className="threshold-slider__metric">
          <span className="threshold-slider__metric-label">RECALL</span>
          <span className="threshold-slider__metric-value">
            {formatMetric(thresholdResponse?.recall)}
          </span>
        </div>
        <div className="threshold-slider__metric">
          <span className="threshold-slider__metric-label">F1</span>
          <span className="threshold-slider__metric-value">
            {formatMetric(thresholdResponse?.f1)}
          </span>
        </div>
      </div>

      {/* Confusion matrix */}
      {hasMetrics && confusion && (
        <div className="threshold-slider__confusion" role="table" aria-label="Confusion matrix">
          <div className="threshold-slider__confusion-header">
            <span className="threshold-slider__confusion-title">CONFUSION MATRIX</span>
            <span className="threshold-slider__confusion-n">N = {thresholdResponse.n_samples.toLocaleString()}</span>
          </div>
          <div className="threshold-slider__confusion-grid">
            <div className="threshold-slider__confusion-cell threshold-slider__confusion-cell--tp">
              <span className="threshold-slider__confusion-cell-label">TP</span>
              <span className="threshold-slider__confusion-cell-value">{confusion.TP.toLocaleString()}</span>
            </div>
            <div className="threshold-slider__confusion-cell threshold-slider__confusion-cell--fp">
              <span className="threshold-slider__confusion-cell-label">FP</span>
              <span className="threshold-slider__confusion-cell-value">{confusion.FP.toLocaleString()}</span>
            </div>
            <div className="threshold-slider__confusion-cell threshold-slider__confusion-cell--fn">
              <span className="threshold-slider__confusion-cell-label">FN</span>
              <span className="threshold-slider__confusion-cell-value">{confusion.FN.toLocaleString()}</span>
            </div>
            <div className="threshold-slider__confusion-cell threshold-slider__confusion-cell--tn">
              <span className="threshold-slider__confusion-cell-label">TN</span>
              <span className="threshold-slider__confusion-cell-value">{confusion.TN.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading / error states */}
      {(optimalLoading || thresholdLoading) && !hasMetrics && (
        <div className="threshold-slider__loading" aria-live="polite">
          <span className="threshold-slider__loading-spinner" aria-hidden="true" />
          <span>Loading threshold metrics...</span>
        </div>
      )}

      {updateThresholdMutation.isError && (
        <div className="threshold-slider__error" role="alert">
          Failed to update threshold: {(updateThresholdMutation.error as Error)?.message || 'Unknown error'}
        </div>
      )}

      {/* Update mutation loading indicator */}
      {updateThresholdMutation.isPending && !isDragging && (
        <div className="threshold-slider__pending" aria-live="polite">
          <span className="threshold-slider__loading-spinner" aria-hidden="true" />
          <span>Applying threshold...</span>
        </div>
      )}
    </div>
  );
};

export default ThresholdSlider;