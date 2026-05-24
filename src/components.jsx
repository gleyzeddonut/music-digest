import React from 'react';
import { api } from './api.js';

// ─── SVG Icon Library ─────────────────────────────────────────

const SVG = {
  today:    <><rect x="2" y="3" width="12" height="12" rx="2" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M8 7v4M6 9h4" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  history:  <><circle cx="8" cy="8" r="6.5" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M8 5v3.5L10 10" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  sources:  <><path d="M3 5h10M3 8h7M3 11h9" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  settings: <><circle cx="8" cy="8" r="2.2" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  playlist: <><path d="M2 4h12M2 8h9M2 12h6" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/><circle cx="12" cy="11" r="2" strokeWidth="1.3" stroke="currentColor" fill="none"/></>,
  play:     <path d="M5 3.5l7 4.5-7 4.5V3.5Z" fill="currentColor"/>,
  pause:    <><rect x="3.5" y="3" width="3" height="10" rx="1" fill="currentColor"/><rect x="9.5" y="3" width="3" height="10" rx="1" fill="currentColor"/></>,
  prev:     <><path d="M3 3h1.5v10H3V3Zm9.5 0L5 8l7.5 5V3Z" fill="currentColor"/></>,
  next:     <><path d="M12.5 3H11v10h1.5V3ZM3.5 3L11 8 3.5 13V3Z" fill="currentColor"/></>,
  shuffle:  <path d="M2 4.5h1.5A4 4 0 0 1 6.8 6.6L8 8l1.2-1.4A4 4 0 0 1 12.5 4.5H14v1H12.5a3 3 0 0 0-2.3 1.1L9 8l1.2 1.4a3 3 0 0 0 2.3 1.1H14v1h-1.5a4 4 0 0 1-3.3-1.6L8 8l-1.2 1.4A4 4 0 0 1 3.5 11.5H2v-1h1.5a3 3 0 0 0 2.3-1.1L7 8 5.8 6.6A3 3 0 0 0 3.5 5.5H2v-1Z" fill="currentColor"/>,
  repeat:   <path d="M3 6h8a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H5.5L7 12.5l-1 .75L3.5 11l2.5-2.25L7 9.75 5.5 11H11a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H3V6Z" fill="currentColor"/>,
  volume:   <><path d="M5 5.5 8.5 3v10L5 10.5H2.5A.5.5 0 0 1 2 10V6a.5.5 0 0 1 .5-.5H5Z" fill="currentColor"/><path d="M10.5 5.5a3 3 0 0 1 0 5" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" fill="none"/></>,
  queue:    <><path d="M2 4h12M2 8h12M2 12h12" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  heart:    <path d="M8 12.5S2 8.5 2 5.2A3.2 3.2 0 0 1 8 3.6 3.2 3.2 0 0 1 14 5.2C14 8.5 8 12.5 8 12.5Z" fill="currentColor"/>,
  search:   <><circle cx="7" cy="7" r="4.5" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M10.5 10.5L13 13" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  bell:     <><path d="M4 7a4 4 0 0 1 8 0v4l1 1.5H3L4 11V7Z" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" strokeWidth="1.3" stroke="currentColor"/></>,
  spotify:  <><circle cx="8" cy="8" r="6.5" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M5 9.5c2-.7 4.5-.4 6 .5M5 7.5c2.5-1 5.5-.5 7 .8M5.5 5.5C8 4.5 11 5 12.5 6.5" strokeWidth="1.1" stroke="currentColor" strokeLinecap="round" fill="none"/></>,
  external: <><path d="M9.5 2.5H13.5V6.5" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/><path d="M13.5 2.5L7 9" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/><path d="M6.5 3.5H3A.5.5 0 0 0 2.5 4V13A.5.5 0 0 0 3 13.5H12A.5.5 0 0 0 12.5 13V9.5" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  add:      <><path d="M8 3v10M3 8h10" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round"/></>,
  check:    <path d="M3 8l3.5 3.5L13 5" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  trash:    <><path d="M3 5h10M5.5 5V3.5A.5.5 0 0 1 6 3h4a.5.5 0 0 1 .5.5V5" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/><path d="M4.5 5l.5 7.5a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5L11.5 5" strokeWidth="1.3" stroke="currentColor" strokeLinecap="round"/></>,
  chevron:  <path d="M4 6l4 4 4-4" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" fill="none"/>,
  run:      <path d="M5 3.5l7 4.5-7 4.5V3.5Z" fill="currentColor"/>,
  star:     <path d="M8 2l1.5 3.5L13 6l-2.5 2.5.7 3.5L8 10.5 4.8 12l.7-3.5L3 6l3.5-.5L8 2Z" fill="currentColor"/>,
  log:      <><rect x="2" y="3" width="12" height="10" rx="1.5" strokeWidth="1.3" stroke="currentColor" fill="none"/><path d="M4.5 6.5h3M4.5 8.5h5M4.5 10.5h2" strokeWidth="1.2" stroke="currentColor" strokeLinecap="round"/></>,
  close:    <path d="M4 4l8 8M12 4l-8 8" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round"/>,
};

function Icon({ name, size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {SVG[name] || SVG.today}
    </svg>
  );
}

// ─── Cover Art ────────────────────────────────────────────────

function CoverArt({ initials = '', bg, src, size, fontSize = '1em', style }) {
  const sizeStyle = size ? { width: size, height: size } : {};
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{
          width: '100%', height: '100%',
          objectFit: 'cover',
          borderRadius: 'inherit',
          display: 'block',
          ...sizeStyle,
          ...style,
        }}
      />
    );
  }
  return (
    <div
      className="cover-art"
      style={{ '--ca-bg': bg || 'linear-gradient(135deg, #333, #111)', fontSize, ...sizeStyle, ...style }}
    >
      <span className="mono">{initials}</span>
    </div>
  );
}

// ─── Brand mark ───────────────────────────────────────────────

function BrandMark() {
  return (
    <div className="brand-mark">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <circle cx="6.5" cy="6.5" r="3" stroke="#000" strokeWidth="1.5"/>
        <path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────

function NavItem({ id, label, icon, route, onNavigate }) {
  return (
    <div
      className={`nav-item${route === id ? ' active' : ''}`}
      onClick={() => onNavigate(id)}
    >
      <span className="nav-icon"><Icon name={icon} /></span>
      <span>{label}</span>
    </div>
  );
}

function Sidebar({ route, onNavigate, spotifyConnected }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <span className="brand-name">Music <em>Digest</em></span>
      </div>

      <div className="nav-group">
        <div className="nav-label">Daily</div>
        <NavItem id="digest"  label="Today"   icon="today"   route={route} onNavigate={onNavigate} />
        <NavItem id="history" label="Archive"  icon="history" route={route} onNavigate={onNavigate} />
        <NavItem id="sources" label="Sources"  icon="sources" route={route} onNavigate={onNavigate} />
      </div>

      <div className="nav-group">
        <div className="nav-label">Library</div>
        <NavItem id="playlist" label="Playlist" icon="playlist" route={route} onNavigate={onNavigate} />
        <NavItem id="settings" label="Settings" icon="settings" route={route} onNavigate={onNavigate} />
      </div>

      <div className="sidebar-bottom">
        <div className="spotify-pill">
          <div
            className="dot"
            style={spotifyConnected ? {} : { background: 'var(--muted)', boxShadow: 'none' }}
          />
          <div className="meta">
            <div className="who">{spotifyConnected ? 'Connected' : 'Not connected'}</div>
            <div className="state">Spotify</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────

function Topbar({ title, onRun, running, userName, userEmail, onNavigate, spotifyConnected, playlistUrl, onOpenLog, onSpotifyConnect }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const initials = (userName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <header className="topbar">
      <span className="crumb"><b>{title}</b></span>
      <div className="grow" />
      <div className="search">
        <Icon name="search" size={14} />
        <input id="global-search" placeholder="Search artists, songs, sources…" />
        <span className="kbd">⌘F</span>
      </div>
      <button className="icon-btn" title="Notifications">
        <Icon name="bell" />
      </button>
      <button
        className="run-btn"
        onClick={onRun}
        disabled={running}
        style={running ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
      >
        <Icon name="run" size={13} />
        {running ? 'Running…' : 'Run digest'}
      </button>
      <div className="avatar-wrap">
        <button
          className={`avatar-btn${menuOpen ? ' open' : ''}`}
          onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
        >
          <div className="avatar">{initials}</div>
          <span className="avatar-chev"><Icon name="chevron" size={12} /></span>
        </button>
        {menuOpen && (
          <div className="avatar-menu" onClick={e => e.stopPropagation()}>
            <div className="am-head">
              <div className="am-head-avatar">{initials}</div>
              <div className="am-head-meta">
                <div className="am-head-name">{userName || 'You'}</div>
                <div className="am-head-mail">{userEmail || '—'}</div>
              </div>
            </div>
            {spotifyConnected && (
              <div className="am-spotify">
                <div className="am-dot" />
                <div className="am-spotify-meta">
                  <div>Spotify connected</div>
                  <div className="am-spotify-sub">{playlistUrl ? 'Playlist active' : 'No playlist yet'}</div>
                </div>
              </div>
            )}
            <div className="am-sep" />
            <button className="am-item" onClick={() => { onNavigate('sources'); setMenuOpen(false); }}>
              <Icon name="sources" size={14} />
              <span>Manage sources</span>
            </button>
            <button className="am-item" onClick={() => { onNavigate('settings'); setMenuOpen(false); }}>
              <Icon name="settings" size={14} />
              <span>Settings</span>
              <span className="am-kbd">⌘,</span>
            </button>
            <button className="am-item" onClick={() => { onOpenLog?.(); setMenuOpen(false); }}>
              <Icon name="log" size={14} />
              <span>Open Log</span>
              <span className="am-kbd">⌘L</span>
            </button>
            {!spotifyConnected && (
              <>
                <div className="am-sep" />
                <button className="am-item" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', padding: 0 }} onClick={() => { setOpen(false); onSpotifyConnect?.(); }}>
                  <Icon name="spotify" size={14} />
                  <span>Connect Spotify</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Player Strip ─────────────────────────────────────────────

function PlayerStrip({ track, queue = [], onTrackChange, onClose }) {
  const tokenRef  = React.useRef(null);
  const deviceRef = React.useRef(null); // { id, name }
  const trackRef  = React.useRef(track);
  const queueRef  = React.useRef(queue);
  React.useEffect(() => { trackRef.current = track; }, [track]);
  React.useEffect(() => { queueRef.current = queue; }, [queue]);

  const [status,   setStatus]   = React.useState('loading'); // loading | ready | no-device | error
  const [error,    setError]    = React.useState('');
  const [playing,  setPlaying]  = React.useState(false);
  const [position, setPosition] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [device,   setDevice]   = React.useState(null);  // { id, name }
  const [volume,   setVolume]   = React.useState(80);    // 0-100

  const title    = track?.title  || '—';
  const artist   = track?.artist || '';
  const bg       = track?.bg     || 'linear-gradient(135deg,#1a2a20,#0d1a0f)';
  const initials = (artist || title).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const spotifyFetch = React.useCallback(async (path, opts = {}) => {
    if (!tokenRef.current) {
      const { token } = await api.spotifyToken();
      tokenRef.current = token;
    }
    const doFetch = (tok) => fetch(`https://api.spotify.com/v1${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let res = await doFetch(tokenRef.current);
    if (res.status === 401) {
      const { token } = await api.spotifyToken();
      tokenRef.current = token;
      res = await doFetch(token);
    }
    return res;
  }, []);

  // Init: fetch token, find device, start state poll
  React.useEffect(() => {
    let cancelled = false;
    let pollId = null;

    async function findDevice() {
      try {
        const res = await spotifyFetch('/me/player/devices');
        if (!res.ok) return null;
        const { devices } = await res.json();
        return devices.find(d => d.is_active) || devices[0] || null;
      } catch { return null; }
    }

    async function init() {
      try {
        const { token } = await api.spotifyToken();
        tokenRef.current = token;
      } catch {
        if (!cancelled) { setStatus('error'); setError('Spotify not connected'); }
        return;
      }

      const dev = await findDevice();
      if (!cancelled) {
        deviceRef.current = dev ? { id: dev.id, name: dev.name } : null;
        setDevice(deviceRef.current);
        setStatus(dev ? 'ready' : 'no-device');
      }

      // Poll Spotify for live playback state
      pollId = setInterval(async () => {
        if (cancelled) return;
        try {
          const res = await spotifyFetch('/me/player');
          if (res.status === 204) { setPlaying(false); return; }
          if (!res.ok) return;
          const state = await res.json();
          if (cancelled) return;
          setPlaying(state.is_playing);
          setPosition(state.progress_ms || 0);
          setDuration(state.item?.duration_ms || 0);
          if (state.device) {
            const d = { id: state.device.id, name: state.device.name };
            deviceRef.current = d;
            setDevice(d);
            if (status !== 'ready') setStatus('ready');
          }
          const spotifyId = state.item?.id;
          if (spotifyId && spotifyId !== trackRef.current?.spotifyId) {
            const match = queueRef.current.find(s => s.spotifyId === spotifyId);
            if (match) onTrackChange?.(match);
          }
        } catch {}
      }, 2000);
    }

    init();
    return () => { cancelled = true; clearInterval(pollId); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Send play command when selected track changes
  React.useEffect(() => {
    if (!track?.spotifyId || !tokenRef.current) return;

    async function play() {
      // Re-fetch device if we don't have one yet
      if (!deviceRef.current) {
        try {
          const res = await spotifyFetch('/me/player/devices');
          if (res.ok) {
            const { devices } = await res.json();
            const dev = devices.find(d => d.is_active) || devices[0];
            if (dev) { deviceRef.current = { id: dev.id, name: dev.name }; setDevice(deviceRef.current); }
          }
        } catch {}
      }

      const validUris = queueRef.current.filter(s => s.spotifyId).map(s => `spotify:track:${s.spotifyId}`);
      const body = validUris.length
        ? { uris: validUris, offset: { uri: `spotify:track:${track.spotifyId}` } }
        : { uris: [`spotify:track:${track.spotifyId}`] };

      const qs = deviceRef.current ? `?device_id=${deviceRef.current.id}` : '';
      const res = await spotifyFetch(`/me/player/play${qs}`, { method: 'PUT', body: JSON.stringify(body) });

      if (res.status === 403) { setStatus('error'); setError('Spotify Premium required'); return; }
      if (res.status === 404) { setStatus('no-device'); setError('Open Spotify app first, then double-click to play'); return; }
      if (res.status === 401) { setStatus('error'); setError('Re-connect Spotify in Settings'); return; }
      setPosition(0);
      setPlaying(true);
      setStatus('ready');
    }

    play().catch(() => {});
  }, [track?.spotifyId, spotifyFetch]);

  const togglePlay = async () => {
    try {
      if (playing) {
        await spotifyFetch('/me/player/pause', { method: 'PUT' });
        setPlaying(false);
      } else {
        await spotifyFetch('/me/player/play', { method: 'PUT' });
        setPlaying(true);
      }
    } catch {}
  };

  const handlePrev = () => spotifyFetch('/me/player/previous', { method: 'POST' }).catch(() => {});
  const handleNext = () => spotifyFetch('/me/player/next',     { method: 'POST' }).catch(() => {});

  const handleScrub = async e => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ms = Math.floor(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration);
    setPosition(ms);
    await spotifyFetch(`/me/player/seek?position_ms=${ms}`, { method: 'PUT' }).catch(() => {});
  };

  const handleVolume = async e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 100);
    setVolume(pct);
    await spotifyFetch(`/me/player/volume?volume_percent=${pct}`, { method: 'PUT' }).catch(() => {});
  };

  // Smooth progress ticker between polls
  React.useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPosition(p => p + 500), 500);
    return () => clearInterval(id);
  }, [playing]);

  const fmt = ms => {
    if (!ms || !isFinite(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const pct = duration > 0 ? (position / duration) * 100 : 0;
  const canControl = status === 'ready' || status === 'no-device';

  const statusLabel = status === 'error'
    ? <span style={{ color: 'var(--warn, #f5b94e)', fontSize: 11 }}>{error}</span>
    : status === 'loading'
      ? <em>Connecting…</em>
      : status === 'no-device'
        ? <span style={{ opacity: 0.6, fontSize: 11 }}>Open Spotify app to play</span>
        : !track?.spotifyId
          ? <span style={{ opacity: 0.45, fontSize: 11 }}>Not on Spotify</span>
          : device
            ? <span>{artist} <span style={{ opacity: 0.4, fontSize: 10 }}>▶ {device.name}</span></span>
            : artist;

  return (
    <footer className="player">
      {/* Left — track info */}
      <div className="player-track">
        <div className="player-cover">
          <CoverArt initials={initials} bg={bg} src={track?.src} />
        </div>
        <div className="player-info">
          <div className="pt">{title}</div>
          <div className="pa">{statusLabel}</div>
        </div>
        <button className="like-btn"><Icon name="heart" size={14} /></button>
      </div>

      {/* Center — controls + scrub */}
      <div className="player-center">
        <div className="player-controls">
          <button className="pc-btn" onClick={handlePrev} title="Previous"><Icon name="prev" size={16} /></button>
          <button className="pc-play" onClick={togglePlay} disabled={!canControl} title={playing ? 'Pause' : 'Play'}
            style={{ opacity: canControl ? 1 : 0.35 }}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
          </button>
          <button className="pc-btn" onClick={handleNext} title="Next"><Icon name="next" size={16} /></button>
        </div>
        <div className="player-scrub">
          <span className="scrub-time">{fmt(position)}</span>
          <div className="scrub-bar" onClick={handleScrub} style={{ overflow: 'visible' }}>
            <div className="scrub-fill" style={{ width: `${pct}%` }} />
            <div className="scrub-knob" style={{ left: `${pct}%` }} />
          </div>
          <span className="scrub-time" style={{ textAlign: 'right' }}>{fmt(duration) || track?.dur || '—'}</span>
        </div>
      </div>

      {/* Right — volume + close */}
      <div className="player-right">
        <button className="pc-btn" title="Volume"><Icon name="volume" size={14} /></button>
        <div className="vol-bar" onClick={handleVolume}>
          <div className="vol-fill" style={{ width: `${volume}%` }} />
        </div>
        {onClose && (
          <button className="pc-btn" onClick={onClose} title="Close player" style={{ marginLeft: 8 }}>
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    </footer>
  );
}

// ─── Greeting ─────────────────────────────────────────────────

function Greeting({ name }) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  if (!name) return null;
  return <div className="greet">Good {time}, <b>{name}</b></div>;
}

// ─── Toast ────────────────────────────────────────────────────

let _toastTimer;
export function showToast(msg) {
  let el = document.getElementById('md-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'md-toast';
    el.style.cssText = [
      'position:fixed', 'bottom:100px', 'right:24px',
      'background:var(--bg-elev)', 'border:1px solid var(--line)',
      'border-left:3px solid var(--accent)', 'border-radius:8px',
      'padding:12px 18px', 'font-size:13px', 'color:var(--text-2)',
      'z-index:999', 'opacity:0', 'transform:translateY(8px)',
      'transition:opacity .2s,transform .2s', 'pointer-events:none',
      'max-width:300px', 'font-family:var(--f-sans)',
    ].join(';');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  });
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
  }, 3200);
}

// ─── LogPanel ─────────────────────────────────────────────────

const LOG_COLORS = { log: '#b8bcc1', warn: '#f5b94e', error: '#f0666b', done: '#1ed760', ready: '#74797f' };

export function LogPanel({ open, onClose }) {
  const [lines, setLines] = React.useState([]);
  const [connected, setConnected] = React.useState(false);
  const bottomRef = React.useRef(null);
  const esRef = React.useRef(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // SSE connection — only open/close when panel visibility changes
  React.useEffect(() => {
    if (!open) return;

    const es = new EventSource('/api/run/stream');
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const { level, msg } = JSON.parse(e.data);
        if (level === 'ready') { setConnected(true); return; }
        const ts = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setLines(l => [...l, { level, msg, ts, id: Date.now() + Math.random() }]);
      } catch {}
    };

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [open]);

  // Escape key handler — uses ref so it never reconnects SSE on parent re-render
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Auto-scroll to bottom when new lines arrive
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 200,
        height: open ? '42vh' : 0, minHeight: 0,
        transition: 'height 0.25s cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        pointerEvents: open ? 'all' : 'none',
      }}
    >
      <div style={{
        height: '100%',
        background: '#0b0c0d',
        borderTop: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px', borderBottom: '1px solid var(--line-soft)',
          flexShrink: 0,
        }}>
          <Icon name="log" size={14} />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Digest Log
          </span>
          <span style={{
            marginLeft: 4, width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: connected ? 'var(--accent)' : 'var(--dim)',
            boxShadow: connected ? '0 0 6px var(--accent-glow)' : 'none',
            transition: 'background 0.3s',
          }} />
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setLines([])}
            style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--f-mono)', padding: '2px 6px' }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Log output */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '10px 16px',
          fontFamily: 'var(--f-mono)', fontSize: 12, lineHeight: 1.65,
        }}>
          {lines.length === 0 ? (
            <div style={{ color: 'var(--dim)', fontSize: 11, paddingTop: 4 }}>
              {connected ? 'Waiting for next digest run… (⌘R to run)' : 'Connecting…'}
            </div>
          ) : lines.map(line => (
            <div key={line.id} className="log-line" style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--dim)', fontSize: 10, flexShrink: 0, userSelect: 'none' }}>{line.ts}</span>
              {line.level !== 'log' && (
                <span style={{ color: LOG_COLORS[line.level] || 'var(--text-2)', fontSize: 10, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {line.level}
                </span>
              )}
              <span style={{ color: LOG_COLORS[line.level] || 'var(--text-2)', wordBreak: 'break-word' }}>
                {line.level === 'done' ? '─── Run complete ───' : line.msg}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

export { Icon, CoverArt, BrandMark, Sidebar, Topbar, PlayerStrip, Greeting };
