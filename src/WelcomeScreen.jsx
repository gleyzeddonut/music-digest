// WelcomeScreen.jsx
// First-run empty state for Music Digest. Renders when there's no digest yet.
// Editorial-style hero + animated dashed arrow pointing up at the Run digest button
// in the topbar — so the user learns where to click.
//
// No props. No side effects. Pure presentational.
//
// USAGE OPTION A (drop-in component file):
//   import { WelcomeScreen } from './WelcomeScreen.jsx';
//
// USAGE OPTION B (inline into screens.jsx):
//   Copy the WelcomeScreen function below into your existing src/screens.jsx
//   and add `WelcomeScreen` to its export list.

import React from 'react';

export function WelcomeScreen() {
  return (
    <div className="welcome fade-in" data-screen-label="00 Welcome">
      {/* Curving dashed arrow that points up toward the Run digest button in the topbar */}
      <svg
        className="welcome-arrow"
        viewBox="0 0 360 220"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="welcome-arrowhead"
            viewBox="0 0 12 12"
            refX="6"
            refY="6"
            markerWidth="11"
            markerHeight="11"
            orient="auto-start-reverse"
          >
            <path d="M2 2 L10 6 L2 10 L4 6 Z" fill="var(--accent)" />
          </marker>
        </defs>
        <path
          className="welcome-arrow-path"
          d="M 20 200 C 20 80, 270 140, 270 20"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 6"
          markerEnd="url(#welcome-arrowhead)"
        />
      </svg>

      <div className="welcome-inner">
        <div className="welcome-eyebrow">
          <span className="welcome-pulse" />
          Setup complete · Issue 00 awaiting
        </div>

        <h1 className="welcome-title">
          Run your <em>first</em>
          <br />
          digest
        </h1>

        <p className="welcome-sub">
          We&rsquo;ll scan your sources, write a brief, and fill your Spotify playlist.
          Hit <b>Run digest</b> in the top-right when you&rsquo;re ready &mdash;
          it takes about ninety seconds.
        </p>

        <div className="welcome-or">
          Or wait for tomorrow&rsquo;s scheduled run at 06:00 EST.
        </div>

        <div className="welcome-grid">
          <div className="welcome-step">
            <span className="welcome-step-num">01</span>
            <div className="welcome-step-body">
              <div className="welcome-step-title">Scan</div>
              <div className="welcome-step-desc">
                23 sources &middot; Reddit, Pitchfork, Stereogum, your playlists
              </div>
            </div>
          </div>
          <div className="welcome-step">
            <span className="welcome-step-num">02</span>
            <div className="welcome-step-body">
              <div className="welcome-step-title">Brief</div>
              <div className="welcome-step-desc">
                Claude writes you a 6-minute editorial summary
              </div>
            </div>
          </div>
          <div className="welcome-step">
            <span className="welcome-step-num">03</span>
            <div className="welcome-step-body">
              <div className="welcome-step-title">Playlist</div>
              <div className="welcome-step-desc">
                Best songs added to your Spotify, automatically
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
