/**
 * Global application state using Zustand.
 * Manages UI state for the Exoplanet Finder dashboard.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type AppMode = 'explore' | 'errors' | 'compare' | 'kepler90';

export interface HoveredTCE {
  tceId: string;
  x: number;
  y: number;
}

interface AppState {
  // Mode: controls which view/layout is active
  mode: AppMode;
  setMode: (mode: AppMode) => void;

  // Selected TCE (for inspector panel)
  selectedTceId: string | null;
  selectTce: (tceId: string | null) => void;
  clearSelection: () => void;

  // Compare mode: up to 2 TCE IDs
  compareTceIds: string[];
  addCompare: (tceId: string) => void;
  removeCompare: (tceId: string) => void;
  clearCompare: () => void;

  // Threshold slider (0-1), defaults to validation optimal
  threshold: number;
  setThreshold: (threshold: number) => void;

  // Hovered TCE on sphere (for tooltip)
  hoveredTce: HoveredTCE | null;
  setHovered: (hovered: HoveredTCE | null) => void;

  // Reset all state to defaults
  reset: () => void;
}

// Default threshold from validation (will be overridden by API call)
const DEFAULT_THRESHOLD = 0.5;

const initialState = {
  mode: 'explore' as AppMode,
  selectedTceId: null,
  compareTceIds: [] as string[],
  threshold: DEFAULT_THRESHOLD,
  hoveredTce: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setMode: (mode: AppMode) => {
        // When switching away from compare mode, clear compare selection
        if (mode !== 'compare') {
          set({ mode, compareTceIds: [] });
        } else {
          set({ mode });
        }
      },

      selectTce: (tceId: string | null) => {
        set({ selectedTceId: tceId });
        // If a TCE is selected and we're in compare mode, add it to compare list
        if (tceId && get().mode === 'compare') {
          const current = get().compareTceIds;
          if (!current.includes(tceId) && current.length < 2) {
            set({ compareTceIds: [...current, tceId] });
          }
        }
      },

      clearSelection: () => set({ selectedTceId: null }),

      addCompare: (tceId: string) => {
        const current = get().compareTceIds;
        if (!current.includes(tceId) && current.length < 2) {
          set({ compareTceIds: [...current, tceId] });
        }
      },

      removeCompare: (tceId: string) => {
        set({ compareTceIds: get().compareTceIds.filter((id) => id !== tceId) });
      },

      clearCompare: () => set({ compareTceIds: [] }),

      setThreshold: (threshold: number) => {
        // Clamp to [0, 1]
        const clamped = Math.max(0, Math.min(1, threshold));
        set({ threshold: clamped });
      },

      setHovered: (hovered: HoveredTCE | null) => set({ hoveredTce: hovered }),

      reset: () => set(initialState),
    }),
    {
      name: 'exoplanet-finder-store',
      storage: createJSONStorage(() => localStorage),
      // Only persist mode and threshold; selection/hover are session-only
      partialize: (state) => ({
        mode: state.mode,
        threshold: state.threshold,
      }),
    }
  )
);

// Selector hooks for common use cases
export const useMode = () => useAppStore((state) => state.mode);
export const useSelectedTceId = () => useAppStore((state) => state.selectedTceId);
export const useCompareTceIds = () => useAppStore((state) => state.compareTceIds);
export const useThreshold = () => useAppStore((state) => state.threshold);
export const useHoveredTce = () => useAppStore((state) => state.hoveredTce);

// Action selectors
export const useSetMode = () => useAppStore((state) => state.setMode);
export const useSelectTce = () => useAppStore((state) => state.selectTce);
export const useClearSelection = () => useAppStore((state) => state.clearSelection);
export const useAddCompare = () => useAppStore((state) => state.addCompare);
export const useRemoveCompare = () => useAppStore((state) => state.removeCompare);
export const useClearCompare = () => useAppStore((state) => state.clearCompare);
export const useSetThreshold = () => useAppStore((state) => state.setThreshold);
export const useSetHovered = () => useAppStore((state) => state.setHovered);
export const useResetStore = () => useAppStore((state) => state.reset);