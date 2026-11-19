/**
 * SignalSelector - Two-level searchable combobox for selecting signals/candidates
 * 1. Search for a star by KIC ID or pick from list (backed by GET /api/stars)
 * 2. Select a TCE from that star's TCEs (period, label, CNN prob)
 * Preset group headers: TOP CANDIDATES (TEST), CONFIDENT PLANET, CONFIDENT BINARY,
 * POSSIBLE LABEL ERRORS, KEPLER-90
 * Shows TCE split; red "NOT HELD-OUT" tag if not TEST
 * Labels: "SIGNAL" / "CANDIDATE" (never "confirmed exoplanet")
 * Keyboard: arrow keys, Enter, Esc
 */

import React, { useState, useRef, useMemo, useCallback } from 'react';
import { useStars, useStarDetail, useKepler90 } from '../../api/queries';
import { useSelectTce, useClearSelection } from '../../store/useAppStore';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import './SignalSelector.css';

export interface SignalSelectorProps {
  /** Default split to use for star list */
  defaultSplit?: 'train' | 'val' | 'test';
  /** Custom className */
  className?: string;
}

/** Preset group for the dropdown */
interface PresetGroup {
  id: string;
  label: string;
  kepids?: number[];
}

/** Default preset groups */
const PRESET_GROUPS: PresetGroup[] = [
  {
    id: 'top-candidates',
    label: 'TOP CANDIDATES (TEST)',
    kepids: [], // Will be populated from top candidates API
  },
  {
    id: 'confident-planet',
    label: 'CONFIDENT PLANET',
    kepids: [], // High CNN prob, label=1
  },
  {
    id: 'confident-binary',
    label: 'CONFIDENT BINARY',
    kepids: [], // High CNN prob, label=0, secondary eclipse
  },
  {
    id: 'label-errors',
    label: 'POSSIBLE LABEL ERRORS',
    kepids: [], // From errors API
  },
  {
    id: 'kepler90',
    label: 'KEPLER-90',
    kepids: [], // From Kepler-90 API
  },
];

/** Star item for the dropdown list */
interface StarItem {
  kepid: number;
  ra: number | null;
  dec: number | null;
  n_tces: number;
  n_planets: number;
  best_cnn_prob: number | null;
  best_gb_prob: number | null;
  split: string;
  groupId?: string;
}

/** TCE item for the second level dropdown */
interface TceItem {
  tce_id: string;
  period: number;
  label: number;
  label_name: string;
  cnn_prob: number | null;
  gb_prob: number | null;
  split: string;
}

/** Flat dropdown item (either a group header, star, or TCE) */
type DropdownItem =
  | { type: 'group'; group: PresetGroup }
  | { type: 'star'; star: StarItem; groupId?: string }
  | { type: 'tce'; tce: TceItem; starKepid: number };

const MAX_VISIBLE_ITEMS = 20;
const ITEM_HEIGHT = 32;

export const SignalSelector: React.FC<SignalSelectorProps> = ({
  defaultSplit = 'test',
  className = '',
}) => {
  const selectTce = useSelectTce();
  const clearSelection = useClearSelection();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStarKepid, setSelectedStarKepid] = useState<number | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [scrollOffset, setScrollOffset] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch stars for the current split
  const { data: starsData, isLoading: starsLoading, error: starsError } = useStars(
    { split: defaultSplit, limit: 5000 },
    { enabled: !selectedStarKepid } // Only fetch stars list when no star selected
  );

  // Fetch star detail when a star is selected
  const { data: starDetail, isLoading: detailLoading } = useStarDetail(
    selectedStarKepid ?? 0,
    { split: defaultSplit },
    { enabled: !!selectedStarKepid }
  );

  // Fetch Kepler-90 for preset group
  const { data: kepler90 } = useKepler90();

  // Fetch top candidates for preset group
  // We'll use the stars data to identify top candidates

  // Build flat list of dropdown items
  const dropdownItems = useMemo((): DropdownItem[] => {
    const items: DropdownItem[] = [];

    // Build preset groups from data
    const presetGroups = buildPresetGroups(starsData, kepler90);

    // If a star is selected, show its TCEs
    if (selectedStarKepid && starDetail) {
      items.push({ type: 'group', group: { id: 'star-tces', label: `KIC ${selectedStarKepid} — TCEs` } });

      for (const tce of starDetail.tces) {
        items.push({
          type: 'tce',
          tce: {
            tce_id: tce.tce_id,
            period: tce.period,
            label: tce.label,
            label_name: tce.label_name,
            cnn_prob: tce.cnn_prob,
            gb_prob: tce.gb_prob,
            split: tce.split,
          },
          starKepid: selectedStarKepid,
        });
      }

      // Add back button
      items.push({ type: 'group', group: { id: 'back', label: '← BACK TO STARS' } });
      return items;
    }

    // Otherwise show preset groups and stars
    for (const group of presetGroups) {
      if (!group.kepids || group.kepids.length === 0) continue;

      items.push({ type: 'group', group });

      const groupStars = starsData?.filter(s => group.kepids!.includes(s.kepid)) ?? [];
      for (const star of groupStars) {
        items.push({ type: 'star', star, groupId: group.id });
      }
    }

    return items;
  }, [starsData, starDetail, selectedStarKepid, kepler90]);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return dropdownItems;

    const query = searchQuery.toLowerCase().trim();
    return dropdownItems.filter(item => {
      if (item.type === 'group') return false; // Don't match groups by search
      if (item.type === 'star') {
        return String(item.star.kepid).includes(query);
      }
      if (item.type === 'tce') {
        return item.tce.tce_id.toLowerCase().includes(query) ||
               String(item.tce.period).includes(query);
      }
      return false;
    });
  }, [dropdownItems, searchQuery]);

  // Virtualized visible items
  const visibleItems = useMemo(() => {
    if (!isOpen) return [];
    return filteredItems.slice(scrollOffset, scrollOffset + MAX_VISIBLE_ITEMS);
  }, [filteredItems, isOpen, scrollOffset]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    const selectableItems = filteredItems.filter(item => item.type !== 'group');

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev + 1;
          if (next >= selectableItems.length) return 0;
          // Update scroll offset if needed
          if (next >= scrollOffset + MAX_VISIBLE_ITEMS) {
            setScrollOffset(next - MAX_VISIBLE_ITEMS + 1);
          }
          return next;
        });
        break;

      case 'ArrowUp':
        event.preventDefault();
        setHighlightedIndex(prev => {
          const next = prev - 1;
          if (next < 0) return selectableItems.length - 1;
          if (next < scrollOffset) {
            setScrollOffset(next);
          }
          return next;
        });
        break;

      case 'Enter':
        event.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < selectableItems.length) {
          const item = selectableItems[highlightedIndex];
          handleItemSelect(item);
        }
        break;

      case 'Escape':
        event.preventDefault();
        if (selectedStarKepid) {
          // Go back to star list
          setSelectedStarKepid(null);
          setSearchQuery('');
          setHighlightedIndex(-1);
          setScrollOffset(0);
        } else {
          // Close dropdown
          setIsOpen(false);
          inputRef.current?.blur();
        }
        break;

      case 'Tab':
        // Let tab close naturally
        setIsOpen(false);
        break;
    }
  }, [filteredItems, highlightedIndex, scrollOffset, selectedStarKepid]);

  const handleItemSelect = useCallback((item: DropdownItem) => {
    if (item.type === 'star') {
      setSelectedStarKepid(item.star.kepid);
      setSearchQuery('');
      setHighlightedIndex(-1);
      setScrollOffset(0);
    } else if (item.type === 'tce') {
      selectTce(item.tce.tce_id);
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (item.type === 'group' && item.group.id === 'back') {
      setSelectedStarKepid(null);
      setSearchQuery('');
      setHighlightedIndex(-1);
      setScrollOffset(0);
    }
  }, [selectTce]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setScrollOffset(0);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    setScrollOffset(0);
    setHighlightedIndex(-1);
  };

  const handleInputBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    // Only close if focus is not moving to the dropdown
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      // Small delay to allow click on dropdown items
      setTimeout(() => {
        if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
          setIsOpen(false);
        }
      }, 100);
    }
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    clearSelection();
    setSelectedStarKepid(null);
    setSearchQuery('');
    setIsOpen(false);
  };

  // Build preset groups from available data
  function buildPresetGroups(stars: StarItem[] | undefined, kepler90: { planets: Array<{ name: string; kepid?: number }> } | undefined): PresetGroup[] {
    if (!stars || stars.length === 0) return [];

    // Get top candidates (TEST split, high CNN prob, label=1)
    const topCandidates = stars
      .filter(s => s.split === 'test' && s.best_cnn_prob !== null && s.best_cnn_prob! > 0.5 && s.n_planets > 0)
      .sort((a, b) => (b.best_cnn_prob ?? 0) - (a.best_cnn_prob ?? 0))
      .slice(0, 20)
      .map(s => s.kepid);

    // Confident planets (any split, high CNN prob, label=1)
    const confidentPlanets = stars
      .filter(s => s.best_cnn_prob !== null && s.best_cnn_prob! > 0.9 && s.n_planets > 0)
      .sort((a, b) => (b.best_cnn_prob ?? 0) - (a.best_cnn_prob ?? 0))
      .slice(0, 20)
      .map(s => s.kepid);

    // Confident binaries (high CNN prob, label=0, has secondary eclipse)
    // We'll approximate: high prob, label=0, n_tces > 1
    const confidentBinaries = stars
      .filter(s => s.best_cnn_prob !== null && s.best_cnn_prob! > 0.8 && s.n_planets === 0 && s.n_tces > 1)
      .sort((a, b) => (b.best_cnn_prob ?? 0) - (a.best_cnn_prob ?? 0))
      .slice(0, 20)
      .map(s => s.kepid);

    // Kepler-90 kepids (from demo data)
    const kepler90Kepids = kepler90?.planets
      .map(() => {
        // Kepler-90 kepid is 10506974
        return 10506974;
      })
      .filter((k, i, arr) => arr.indexOf(k) === i) ?? [];

    return [
      { ...PRESET_GROUPS[0], kepids: topCandidates },
      { ...PRESET_GROUPS[1], kepids: confidentPlanets },
      { ...PRESET_GROUPS[2], kepids: confidentBinaries },
      { ...PRESET_GROUPS[3], kepids: [] }, // Would need errors API
      { ...PRESET_GROUPS[4], kepids: kepler90Kepids },
    ];
  }

  // Format label for display (SIGNAL / CANDIDATE)
  const formatLabel = (label: number): string => {
    if (label === 1) return 'SIGNAL';
    return 'CANDIDATE';
  };

  // Format split badge
  const formatSplit = (split: string): { label: string; className: string } => {
    const upper = split.toUpperCase();
    if (upper === 'TEST') return { label: 'TEST', className: 'signal-selector__split-badge--test' };
    return { label: upper, className: 'signal-selector__split-badge--not-held-out' };
  };

  // Check if we have a selection to show clear button
  const hasSelection = searchQuery.trim() !== '' || selectedStarKepid !== null;

  return (
    <ErrorBoundary message="Signal Selector failed to load">
      <div className={`signal-selector ${className}`} ref={containerRef}>
        <div className="signal-selector__input-wrapper">
          <div className="signal-selector__combobox">
            <label htmlFor="signal-selector-input" className="signal-selector__label">
              SIGNAL
            </label>
            <input
              ref={inputRef}
              id="signal-selector-input"
              type="text"
              className="signal-selector__input"
              placeholder={selectedStarKepid ? `KIC ${selectedStarKepid} — Select TCE...` : 'Search KIC ID or select star...'}
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls="signal-selector-list"
              role="combobox"
            />
            {hasSelection && (
              <button
                className="signal-selector__clear-btn"
                onClick={handleClear}
                aria-label="Clear selection"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            <span className="signal-selector__chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </div>
        </div>

        {isOpen && (
          <div className="signal-selector__dropdown" role="listbox" id="signal-selector-list">
            {starsLoading && !selectedStarKepid && (
              <div className="signal-selector__loading" role="status" aria-label="Loading stars">
                <span className="signal-selector__loading-spinner" />
                Loading stars...
              </div>
            )}

            {starsError && !selectedStarKepid && (
              <div className="signal-selector__error" role="alert">
                Failed to load stars
              </div>
            )}

            {detailLoading && selectedStarKepid && (
              <div className="signal-selector__loading" role="status" aria-label="Loading TCEs">
                <span className="signal-selector__loading-spinner" />
                Loading TCEs for KIC {selectedStarKepid}...
              </div>
            )}

            {!starsLoading && !starsError && !detailLoading && (
              <ul
                ref={listRef}
                className="signal-selector__list"
                role="listbox"
                style={{ maxHeight: `${MAX_VISIBLE_ITEMS * ITEM_HEIGHT}px` }}
              >
                {visibleItems.length === 0 && !searchQuery ? (
                  <li className="signal-selector__empty" role="option">
                    No stars found
                  </li>
                ) : visibleItems.length === 0 ? (
                  <li className="signal-selector__empty" role="option">
                    No matches for "{searchQuery}"
                  </li>
                ) : (
                  visibleItems.map((item, index) => {
                    const globalIndex = scrollOffset + index;
                    const isHighlighted = globalIndex === highlightedIndex;

                    if (item.type === 'group') {
                      return (
                        <li
                          key={`group-${item.group.id}`}
                          className="signal-selector__group-header"
                          role="separator"
                          aria-label={item.group.label}
                        >
                          {item.group.label}
                        </li>
                      );
                    }

                    if (item.type === 'star') {
                      const { label, className: splitClass } = formatSplit(item.star.split);
                      return (
                        <li
                          key={`star-${item.star.kepid}`}
                          className={`signal-selector__item signal-selector__item--star ${isHighlighted ? 'signal-selector__item--highlighted' : ''}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => handleItemSelect(item)}
                          onMouseEnter={() => setHighlightedIndex(globalIndex)}
                        >
                          <div className="signal-selector__star-main">
                            <span className="signal-selector__star-kepid">KIC {item.star.kepid}</span>
                            <span className={`signal-selector__split-badge ${splitClass}`}>{label}</span>
                          </div>
                          <div className="signal-selector__star-meta">
                            <span className="signal-selector__star-tces">{item.star.n_tces} TCEs</span>
                            {item.star.n_planets > 0 && (
                              <span className="signal-selector__star-planets">{item.star.n_planets} SIGNALs</span>
                            )}
                            {item.star.best_cnn_prob !== null && (
                              <span className="signal-selector__star-prob">CNN: {item.star.best_cnn_prob.toFixed(3)}</span>
                            )}
                          </div>
                          <span className="signal-selector__chevron-right" aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        </li>
                      );
                    }

                    if (item.type === 'tce') {
                      const { label, className: splitClass } = formatSplit(item.tce.split);
                      const signalLabel = formatLabel(item.tce.label);

                      return (
                        <li
                          key={`tce-${item.tce.tce_id}`}
                          className={`signal-selector__item signal-selector__item--tce ${isHighlighted ? 'signal-selector__item--highlighted' : ''}`}
                          role="option"
                          aria-selected={isHighlighted}
                          onClick={() => handleItemSelect(item)}
                          onMouseEnter={() => setHighlightedIndex(globalIndex)}
                        >
                          <div className="signal-selector__tce-main">
                            <span className="signal-selector__tce-id">{item.tce.tce_id}</span>
                            <span className={`signal-selector__signal-badge signal-selector__signal-badge--${signalLabel.toLowerCase()}`}>{signalLabel}</span>
                            <span className={`signal-selector__split-badge ${splitClass}`}>{label}</span>
                          </div>
                          <div className="signal-selector__tce-meta">
                            <span className="signal-selector__tce-period">P: {item.tce.period.toFixed(3)} d</span>
                            {item.tce.cnn_prob !== null && (
                              <span className="signal-selector__tce-prob">CNN: {item.tce.cnn_prob.toFixed(3)}</span>
                            )}
                            {item.tce.gb_prob !== null && (
                              <span className="signal-selector__tce-prob signal-selector__tce-prob--baseline">GB: {item.tce.gb_prob.toFixed(3)}</span>
                            )}
                          </div>
                        </li>
                      );
                    }

                    return null;
                  })
                )}
              </ul>
            )}

            {/* Scroll indicator */}
            {filteredItems.length > MAX_VISIBLE_ITEMS && (
              <div className="signal-selector__scroll-indicator">
                {scrollOffset > 0 && <span className="signal-selector__scroll-up">↑</span>}
                {scrollOffset + MAX_VISIBLE_ITEMS < filteredItems.length && (
                  <span className="signal-selector__scroll-down">↓</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default SignalSelector;