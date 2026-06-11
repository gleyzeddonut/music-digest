import React from 'react';

// ─── SignalBadge ──────────────────────────────────────────────────────────────
// Replaces the cluster of cryptic .chip tags on a song row with one quiet glyph
// + count that reveals the full signal list on hover / keyboard focus.
//
// Drop this component into src/screens.jsx (or import it), then swap the
// .meta-cell contents on each song row — see HANDOFF.md for the exact before/
// after. Styles live in music-digest-polish.css.
//
// `signals` is the song's existing `s.sig` array (array of strings, e.g.
// ['Charts', 'Editorial']). No data changes required.

// Map a signal string to a colour class. Matches on substring so variants like
// "TikTok velocity" or "Editorial pick" still colour correctly. Unknown signals
// fall back to the neutral accent dot — safe for any value the scorer emits.
export function signalColor(signal) {
  const s = String(signal).toLowerCase();
  if (/(chart|billboard|apple|spotify|youtube|top \d|top song|#\d)/.test(s)) return 'chart';
  if (/(editor|blog|press|pitchfork|review|hype)/.test(s))  return 'editorial';
  if (/(reddit|communit|fan|social)/.test(s))               return 'community';
  if (/(velocit|viral|tiktok|rising|surge|trend)/.test(s))  return 'velocity';
  return '';
}

export function SignalBadge({ signals }) {
  const list = (signals || []).filter(Boolean);
  if (!list.length) return null;

  return (
    <div className="sig-badge" tabIndex={0} aria-label={`${list.length} signals: ${list.join(', ')}`}>
      <svg className="sig-ico" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2"    y="9.5" width="2.4" height="4.5"  rx="1.1" fill="currentColor" />
        <rect x="6.8"  y="6"   width="2.4" height="8"    rx="1.1" fill="currentColor" />
        <rect x="11.6" y="2.5" width="2.4" height="11.5" rx="1.1" fill="currentColor" />
      </svg>
      <span className="sig-count">{list.length}</span>
      <div className="sig-tip" role="tooltip">
        <div className="sig-tip-label">Signals</div>
        {list.map((sig, i) => (
          <div className="sig-tip-row" key={i}>
            <span className={`sig-dot ${signalColor(sig)}`} />
            {sig}
          </div>
        ))}
      </div>
    </div>
  );
}
