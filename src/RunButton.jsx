import React, { useState, useRef, useEffect } from 'react';

// ─── RunButton + RunHairline ──────────────────────────────────────────────────
// The upgraded "Run digest" control. Resting: gradient play-pill with a glow.
// Running: inverts to a dark pill with animated eq bars, the live phase label,
// and a 5-segment track matching the pipeline's real phases. When `running`
// flips back to false it flashes "Digest ready ✓" for 2s, then resets.
//
// Drops into the existing Topbar in components.jsx — it consumes the `running`
// and `runPhase` props Topbar already receives. No new state in main.jsx.
// Styles live in §7 of music-digest-polish.css. See HANDOFF.md for the swap.

// Pipeline phases as streamed over SSE (see PHASE_LABELS in main.jsx):
// Scraping · Scoring · Analyzing · Playlist · Saving  → segments 1–5.
const RUN_SEG = { starting: 0, running: 0, scraping: 1, scoring: 2, analyzing: 3, playlist: 4, saving: 5 };
const SEG_PCT = [4, 20, 40, 60, 80, 95];

function segFor(phase) {
  return RUN_SEG[String(phase || '').toLowerCase()] ?? 1; // unknown phase → show some progress
}

// Flash "done" for 2s whenever `running` transitions true → false.
function useDoneFlash(running) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(running);
  useEffect(() => {
    const was = prev.current;
    prev.current = running;
    if (was && !running) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(t);
    }
  }, [running]);
  return flash;
}

export function RunButton({ running, phase, onClick }) {
  const flash = useDoneFlash(running);
  const seg = running ? segFor(phase) : 0;
  const mode = running ? 'running' : flash ? 'done' : 'idle';
  const cls = `run-btn${mode === 'running' ? ' is-running' : ''}${mode === 'done' ? ' is-done' : ''}`;

  return (
    <button className={cls} disabled={mode === 'running'} onClick={onClick}>
      <span className="run-btn-inner">
        {mode === 'idle' && (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5 3.5l7 4.5-7 4.5V3.5Z" fill="currentColor" />
            </svg>
            Run digest
          </>
        )}
        {mode === 'running' && (
          <>
            <span className="run-eq" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="run-phase" key={phase}>{phase || 'Running'}…</span>
          </>
        )}
        {mode === 'done' && (
          <>
            <span className="run-check">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            Digest ready
          </>
        )}
      </span>
      {mode === 'running' && (
        <span className="run-track" aria-hidden="true">
          {[1, 2, 3, 4, 5].map(i => (
            <i key={i} className={i <= seg ? 'on' : i === seg + 1 ? 'cur' : ''} />
          ))}
        </span>
      )}
    </button>
  );
}

// A 2px green progress edge that sweeps along the bottom of the topbar (i.e.
// the top of the content) while the pipeline runs. Render as the LAST child of
// <header className="topbar"> — it positions itself against the topbar.
export function RunHairline({ running, phase }) {
  if (!running) return null;
  const pct = SEG_PCT[segFor(phase)];
  return <div className="run-hairline" style={{ '--pct': pct }} aria-hidden="true" />;
}
