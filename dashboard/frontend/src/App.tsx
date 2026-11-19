/* App - Main layout for Exoplanet Finder dashboard */
/* 1920x1080 base, responsive to 1366x768 */
/* Wraps with QueryClientProvider and Zustand store */

import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/queryClient';
import { useMode } from './store/useAppStore';

// Core layout components
import { TopBar } from './components/TopBar';
import { Panel } from './components/Panel';
import { LegendStrip } from './components/LegendStrip';
import { ModeSwitch } from './components/ModeSwitch/ModeSwitch';
import { ThresholdPanel } from './components/ThresholdControl/ThresholdPanel';
import { SkySphere } from './components/SkySphere/SkySphere';
import { InspectorPanel } from './components/Inspector/InspectorPanel';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';

// Left column panels
import { CounterPanel } from './components/CounterPanel/CounterPanel';
import { SplitTable } from './components/SplitTable/SplitTable';
import { TopCandidates } from './components/TopCandidates/TopCandidates';

// Right column panels
import { PRCurve } from './components/PRCurve/PRCurve';
import { ROCCurve } from './components/ROCCurve/ROCCurve';
import { ProbHistogram } from './components/ProbHistogram/ProbHistogram';
import { SecondaryEclipseScatter } from './components/ProbHistogram/SecondaryEclipseScatter';

// Mode-specific overlays (replace right column panels D-F)
import { ErrorsGrid } from './components/ErrorsMode/ErrorsGrid';
import { CompareView } from './components/CompareMode/CompareView';
import { Kepler90View } from './components/Kepler90Mode/Kepler90View';

import './App.css';

// Legend items for bottom strip
const legendItems = [
  { id: 'PL', label: 'PLANET', color: 'amber' as const },
  { id: 'FG', label: 'FLAGGED', color: 'red' as const },
  { id: 'TP', label: 'TRUE PLANET MATCH', color: 'green' as const },
  { id: 'RD', label: 'RAW DATA', color: 'white' as const },
];

const App: React.FC = () => {
  const mode = useMode();

  // Determine which right-column panels to show based on mode
  const showDefaultRightPanels = mode === 'explore';
  const showErrorsMode = mode === 'errors';
  const showCompareMode = mode === 'compare';
  const showKepler90Mode = mode === 'kepler90';

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app">
        {/* Top bar */}
        <TopBar />

        {/* Main grid layout - fixed height between top bar and bottom strip */}
        <main className="app__main">
          {/* LEFT: 3 stacked Panels A, B, C - grid with auto/auto/1fr rows */}
          <aside className="app__side app__side--left">
            <CounterPanel tag="A" title="TCE COUNTS" subtitle="Kepler DR24 // TEST" cornerColor="primary" />
            <SplitTable tag="B" title="SPLITS" subtitle="Kepler DR24 // TEST" cornerColor="primary" />
            <ErrorBoundary message="Top Candidates failed to load">
              <TopCandidates tag="C" title="TOP CANDIDATES" subtitle="Ranked by CNN probability" cornerColor="primary" defaultSplit="test" defaultLimit={20} />
            </ErrorBoundary>
          </aside>

          {/* CENTER: Kepler field sky sphere */}
          <section className="app__center">
            <div className="sphere-container">
              <SkySphere />
            </div>
          </section>

          {/* RIGHT: 3 stacked Panels D, E, F - conditional on mode, equal height rows */}
          <aside className="app__side app__side--right">
            {showDefaultRightPanels && (
              <>
                <ErrorBoundary message="PR Curve failed to load">
                  <Panel tag="D" title="PR CURVE" subtitle="Kepler DR24 // TEST" cornerColor="primary" className="app__right-panel">
                    <PRCurve split="test" />
                  </Panel>
                </ErrorBoundary>
                <ErrorBoundary message="ROC Curve failed to load">
                  <Panel tag="E" title="ROC CURVE" subtitle="Kepler DR24 // TEST" cornerColor="primary" className="app__right-panel">
                    <ROCCurve split="test" />
                  </Panel>
                </ErrorBoundary>
                <Panel tag="F" title="PROBABILITY HISTOGRAM" subtitle="Kepler DR24 // TEST" cornerColor="primary" className="app__right-panel">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <ProbHistogram split="test" model="cnn" bins={20} />
                    </div>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <SecondaryEclipseScatter split="test" model="cnn" limit={2000} />
                    </div>
                  </div>
                </Panel>
              </>
            )}

            {showErrorsMode && (
              <ErrorBoundary message="Error Analysis failed to load">
                <ErrorsGrid tag="D" title="ERROR ANALYSIS" subtitle="Model suspicions — not ground truth" cornerColor="red" className="app__right-panel-full" />
              </ErrorBoundary>
            )}

            {showCompareMode && (
              <CompareView tag="C" title="COMPARE MODE" subtitle="Side-by-side TCE comparison" cornerColor="amber" defaultSplit="test" className="app__right-panel-full" />
            )}

            {showKepler90Mode && (
              <Kepler90View tag="K" title="KEPLER-90 MODE" subtitle="Eight-planet system — model probabilities & local views" cornerColor="amber" showThumbnails={true} className="app__right-panel-full" />
            )}
          </aside>
        </main>

        {/* INSPECTOR PANEL - Slides in from right over panels D-F when TCE selected */}
        <ErrorBoundary message="TCE Inspector failed to load">
          <InspectorPanel onClose={() => {}} />
        </ErrorBoundary>

        {/* BOTTOM: Controls - Legend strip + Mode switch + Threshold panel (collapsible) */}
        <footer className="app__bottom">
          <div className="app__bottom-inner">
            {/* Left: Legend strip */}
            <LegendStrip items={legendItems} orientation="horizontal" showIds={true} />

            {/* Center: Mode switch (compact horizontal variant for bottom strip) */}
            <div className="app__bottom-mode" role="region" aria-label="Dashboard mode switch">
              <ModeSwitch label="MODE" className="mode-switch--compact-horizontal" />
            </div>

            {/* Right: Threshold panel (collapsible, docked) */}
            <ThresholdPanel
              tag="G"
              title="THRESHOLD"
              split="test"
              cornerColor="primary"
              onThresholdChange={() => {}}
              className="app__bottom-threshold"
              variant="docked"
            />
          </div>
        </footer>
      </div>
    </QueryClientProvider>
  );
};

export default App;