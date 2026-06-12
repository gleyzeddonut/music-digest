import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { api, bgFromName, weekOfYear, msToMinSec } from './api.js';
import { applyPersonaTheme } from './personas.js';
import { Sidebar, Topbar, LogPanel, showToast } from './components.jsx';
import {
  DigestScreen,
  HistoryScreen,
  SourcesScreen,
  SettingsScreen,
  ArtistScreen,
  BriefScreen,
  PlaylistScreen,
  MonthlyScreen,
  Onboarding,
  LoadingShell,
  PersonaEditorScreen,
} from './screens.jsx';
import { WelcomeScreen } from './WelcomeScreen.jsx';
import { AuthScreen } from './AuthScreen.jsx';

/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

// ── Data adapter ──────────────────────────────────────────────────────────────

function adaptDigest(digest, list, status) {
  if (!digest) return null;

  const date = new Date(digest.date);
  const weekday = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const heroArtist = digest.artists?.[0] || {};
  const initials = heroArtist.name
    ? heroArtist.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  // Editorial pull-quotes for the right column of the brief.
  const sleeper = digest.artists?.[digest.artists.length - 1];
  const briefPulls = [
    {
      label: 'Strongest signal',
      val: heroArtist.name || '—',
      accent: true,
      foot: heroArtist.mention_count
        ? `Mentioned in ${heroArtist.mention_count} sources`
        : 'Top pick this week',
    },
    {
      label: 'Headline count',
      val: String(digest.headlines?.length || 0),
      foot: `Across ${status?.sourcesCount ?? '—'} active sources`,
    },
    sleeper && sleeper !== heroArtist && {
      label: 'Sleeper pick',
      val: sleeper.name,
      foot: sleeper.reason
        ? sleeper.reason.slice(0, 60) + (sleeper.reason.length > 60 ? '…' : '')
        : 'Lower-signal pick worth a listen',
    },
  ].filter(Boolean);

  return {
    issue: {
      number: list?.total ?? 1,
      date: weekday,
      week: `Week ${weekOfYear(date)} · ${date.getFullYear()}`,
    },
    hero: {
      ...heroArtist,
      initials,
      bg: bgFromName(heroArtist.name),
      src: heroArtist.artwork || heroArtist.image || null,
      headline:
        heroArtist.headline ||
        heroArtist.reason ||
        (heroArtist.name ? `${heroArtist.name} leads this week's brief` : "Today's brief"),
      sub:
        heroArtist.feature?.title ||
        heroArtist.long_summary ||
        heroArtist.reason ||
        '',
      signal: (() => {
        const ev = heroArtist.feature?.evidence;
        if (!ev) return '';
        const parts = [];
        if (ev.mention_count) parts.push(`${ev.mention_count} source${ev.mention_count === 1 ? '' : 's'}`);
        if (ev.reddit?.topUps) {
          const ups = ev.reddit.topUps >= 1000 ? `${(ev.reddit.topUps / 1000).toFixed(1)}k` : String(ev.reddit.topUps);
          parts.push(`top Reddit post ${ups}↑`);
        }
        return parts.join(' · ');
      })(),
      rank: '#1 this week',
    },
    // .replace: digests saved before the pipeline normalized Claude's literal
    // backslash-n separators still need it at render time
    brief: (digest.summary || digest.brief || '').replace(/\\n/g, '\n')
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .flatMap(p => {
        // If the block is (almost) all bullet lines, keep it as one block for
        // list rendering. "Almost": Claude sometimes drops the • marker on
        // the first bullet — if at most one line lacks it, mark it too,
        // otherwise BriefScreen's bullet filter silently drops that line.
        const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
        const bulletCount = lines.filter(l => l.startsWith('•')).length;
        if (lines.length > 1 && bulletCount >= lines.length - 1 && bulletCount > 0) {
          return [lines.map(l => (l.startsWith('•') ? l : `• ${l}`)).join('\n')];
        }
        return [p];
      }),
    briefPulls,
    briefArtistNames: (() => {
      // Prefer Claude's explicit mentioned_artists list (present in digests run after this update).
      // Fall back to featured artists + song artists for older digests.
      const base = (digest.mentioned_artists || []).length > 0
        ? (digest.mentioned_artists || [])
        : [
            ...(digest.artists || []).map(a => a.name),
            ...(digest.songs || []).map(s => s.artist),
          ];
      return base.filter((n, i, arr) => n && arr.findIndex(x => x?.toLowerCase() === n.toLowerCase()) === i);
    })(),
    briefArtistSpotifyUrls: (() => {
      const base = (digest.mentioned_artists || []).length > 0
        ? (digest.mentioned_artists || [])
        : [
            ...(digest.artists || []).map(a => a.name),
            ...(digest.songs || []).map(s => s.artist),
          ];
      const names = base.filter((n, i, arr) => n && arr.findIndex(x => x?.toLowerCase() === n.toLowerCase()) === i);
      return Object.fromEntries(names.map(n => [n.toLowerCase(), `https://open.spotify.com/search/${encodeURIComponent(n)}`]));
    })(),
    artists: (digest.artists || []).slice(0, 4).map(a => ({
      ...a,
      initials: (a.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      sig: (a.signals || []).map(s => s.toLowerCase()),
      bg: bgFromName(a.name),
      src: a.artwork || a.image || null,
    })),
    songs: (digest.songs || []).map((s, i) => ({
      num: i + 1,
      title: s.title,
      artist: s.artist,
      album: s.album || null,
      dur: s.duration_ms ? msToMinSec(s.duration_ms) : '—',
      streams: s.streams ?? null,
      sig: (s.signals || []).map(x => x.slice(0, 3).toUpperCase()),
      cover: (s.artist || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?',
      bg: bgFromName(s.artist),
      src: s.artwork || null,
      spotifyId: s.spotify_id || null,
      previewUrl: s.preview_url || null,
    })),
    headlines: (digest.headlines || []).map(h => ({
      src: h.src || h.source || 'Unknown',
      type: h.type || 'News',
      title: h.title,
      desc: h.desc || h.snippet || '',
      url: h.url,
    })),
    history: (list?.digests || []).slice(0, 7).map(d => {
      const dDate = new Date(d.date);
      return {
        date: dDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        dateRaw: d.date,
        headline: d.subject || d.headline || '',
        artistCount: d.artist_count ?? 0,
        songCount: d.song_count ?? 0,
        artists: (d.artists || []).slice(0, 3).map(a => ({
          initials: (a.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
          bg: bgFromName(a.name),
          src: a.artwork || null,
        })),
      };
    }),
    playlistUrl: status?.spotify?.playlistUrl || null,
    userName: status?.userName || status?.user_name || null,
    userEmail: status?.userEmail || status?.email || null,
    spotifyConnected: !!(status?.spotify?.connected),
  };
}

// ── App ───────────────────────────────────────────────────────────────────────

function App() {
  const [route, setRoute] = useState('digest');
  const [data, setData] = useState(null);
  const [rawStatus, setRawStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runPhase, setRunPhase] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [authed, setAuthed] = useState(null); // null = checking, false = signed out
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [monthlyData, setMonthlyData] = useState(null);
  const [settingsRefresh, setSettingsRefresh] = useState(0);
  const [personas, setPersonas] = useState([]);
  const [activePersonaId, setActivePersonaId] = useState(null);
  const [playlistName, setPlaylistName] = useState('🎵 Music Digest');
  const [playlistNameIsPersona, setPlaylistNameIsPersona] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null); // { version, url } when a newer release exists

  // ── Initial load ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      // Auth gate first — no point loading the dashboard if signed out.
      const auth = await api.authStatus().catch(() => ({ authenticated: false }));
      if (!auth.authenticated) {
        setAuthed(false);
        setLoading(false);
        return;
      }
      setAuthed(true);

      const [digest, list, status, personaList, activePersona] = await Promise.all([
        api.latestDigest().catch(() => null),
        api.digestList().catch(() => ({ digests: [], total: 0 })),
        api.status().catch(() => ({})),
        api.personas().catch(() => []),
        api.activePersona().catch(() => null),
      ]);
      setRawStatus(status);
      setPersonas(personaList);
      if (activePersona) setActivePersonaId(activePersona.id);
      if (status.spotify) {
        setPlaylistName(status.spotify.playlistName || '🎵 Music Digest');
        setPlaylistNameIsPersona(!!status.spotify.playlistNameIsPersona);
      }
      if (digest) {
        setData(adaptDigest(digest, list, status));
      } else {
        setData(null);
      }
      // Show onboarding whenever not configured; clear the skip-flag so a DB wipe re-triggers it
      if (status && !status.configured) {
        localStorage.removeItem('onboarding_done');
        setShowOnboarding(true);
      }
    } catch (err) {
      console.error('[App] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Check GitHub for a newer release; surfaces an "Update to vX" pill in the sidebar.
  useEffect(() => {
    fetch('https://api.github.com/repos/gleyzeddonut/music-digest/releases/latest', { signal: AbortSignal.timeout(5000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const latest = d?.tag_name?.replace(/^v/, '');
        if (latest && latest !== APP_VERSION) setUpdateInfo({ version: latest, url: d.html_url });
      })
      .catch(() => {});
  }, []);

  const handleLogout = useCallback(async () => {
    try { await api.logout(); } catch (_) {}
    setAuthed(false);
    setData(null);
    setRawStatus(null);
    setRoute('digest');
  }, []);

  // ── Run digest ──────────────────────────────────────────────────────────────

  const handleRun = useCallback(async (force = false) => {
    if (running) return;
    setRunning(true);
    setRunPhase('Starting');

    const PHASE_LABELS = {
      scraping: 'Scraping',
      scoring:  'Scoring',
      claude:   'Analyzing',
      spotify:  'Playlist',
      saving:   'Saving',
    };

    let es;
    let finished = false;
    const finish = (msg) => {
      if (finished) return;
      finished = true;
      if (es) { es.onerror = null; es.close(); }
      if (msg) showToast(msg);
      setRunPhase('');
      loadData();
      setRunning(false);
    };

    try {
      await api.runDigest(force, activePersonaId);
      setRunPhase('Running');
      es = api.runStream();

      es.onmessage = (e) => {
        try {
          const { level, msg } = JSON.parse(e.data);
          if (level === 'done') { finish('Digest complete!'); return; }
          const phaseMatch = msg?.match(/\[PHASE\]\s+(\w+)/i);
          if (phaseMatch) {
            const label = PHASE_LABELS[phaseMatch[1].toLowerCase()] || phaseMatch[1];
            setRunPhase(label);
          }
        } catch {}
      };

      // SSE connection dropped — treat as done
      es.onerror = () => finish('Run finished (check logs)');

      // Hard ceiling: 3 min (Claude timeout is 2 min, so this fires after)
      setTimeout(() => finish(), 3 * 60 * 1000);

    } catch (err) {
      showToast(err.message || 'Run failed');
      setRunning(false);
    }
  }, [running, loadData]);

  // ── Persona theme ───────────────────────────────────────────────
  useEffect(() => {
    const active = personas.find(p => p.id === activePersonaId);
    applyPersonaTheme(active ?? null, personas);
  }, [activePersonaId, personas]);

  // ── Persona switch ─────────────────────────────────────────────

  const handlePersonaSwitch = useCallback(async (id) => {
    if (id === activePersonaId) return;
    try {
      await api.setActivePersona(id);
      setActivePersonaId(id);
      setData(null); // clear stale digest immediately
      loadData();
    } catch (err) {
      console.error('[App] persona switch failed:', err);
    }
  }, [activePersonaId, loadData]);

  // ── Playlist name save ──────────────────────────────────────────────────────

  const handlePlaylistNameSave = useCallback(async (name) => {
    try {
      await api.saveSpotifyPlaylistName(name);
      loadData();
    } catch (err) {
      console.error('[App] playlist name save failed:', err);
    }
  }, [loadData]);

  // ── Persona delete ──────────────────────────────────────────────────────────

  const handleDeletePersona = useCallback(async (id) => {
    try {
      await api.deletePersona(id);
      if (id === activePersonaId) {
        const def = personas.find(p => p.is_default);
        if (def) { await api.setActivePersona(def.id); setActivePersonaId(def.id); }
      }
      loadData();
    } catch (err) {
      console.error('[App] persona delete failed:', err);
    }
  }, [activePersonaId, personas, loadData]);

  // ── Spotify connect ─────────────────────────────────────────────────────────

  const handleSpotifyConnect = useCallback(async () => {
    try {
      const authUrl = await api.spotifyAuthUrlJson();
      window.open(authUrl);
    } catch {
      window.open(api.spotifyAuthUrl());
    }
    const deadline = Date.now() + 5 * 60 * 1000;
    const poll = setInterval(async () => {
      if (Date.now() > deadline) { clearInterval(poll); return; }
      try {
        const s = await api.status();
        if (s?.spotify?.connected) { clearInterval(poll); loadData(); setSettingsRefresh(n => n + 1); }
      } catch {}
    }, 2000);
  }, [loadData]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const navigate = useCallback((newRoute) => {
    setSelectedArtist(null);
    setRoute(newRoute);
    if (newRoute === 'monthly') {
      const now = new Date();
      api.monthly(now.getFullYear(), now.getMonth() + 1)
        .then(setMonthlyData)
        .catch(() => setMonthlyData({ error: true }));
    }
  }, []);

  // Global keyboard shortcuts — placed after navigate is defined
  useEffect(() => {
    const onKey = (e) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setShowLog(s => !s);
      } else if (e.key === ',') {
        e.preventDefault();
        navigate('settings');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  const handleArtistClick = useCallback((artist) => {
    setSelectedArtist(artist);
    setRoute('artist');
  }, []);

  const handleSongPlay = useCallback((song) => {
    if (song?.spotifyId) {
      window.location.href = `spotify:track:${song.spotifyId}`;
    }
  }, []);

  const handleViewDigest = useCallback(async (dateStr) => {
    try {
      const digest = await api.digestByDate(dateStr);
      const list = await api.digestList().catch(() => ({ digests: [], total: 0 }));
      setData(adaptDigest(digest, list, rawStatus));
      navigate('digest');
    } catch (err) {
      showToast(err.message || 'Could not load digest');
    }
  }, [rawStatus, navigate]);

  // ── Auth gate ───────────────────────────────────────────────────────────────
  // While the first auth check is in flight, `loading` is true → LoadingShell.

  if (loading) {
    return <LoadingShell />;
  }

  if (!authed) {
    return <AuthScreen onAuthed={() => { setLoading(true); loadData(); }} />;
  }

  // ── Onboarding ──────────────────────────────────────────────────────────────

  if (showOnboarding) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem('onboarding_done', '1');
          setShowOnboarding(false);
          loadData();
        }}
      />
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingShell />;
  }

  // ── Render active screen ────────────────────────────────────────────────────

  let screen;
  switch (route) {
    case 'monthly':
      screen = <MonthlyScreen data={monthlyData} />;
      break;
    case 'history':
      screen = <HistoryScreen onViewDigest={handleViewDigest} onDelete={loadData} />;
      break;
    case 'sources':
      screen = <SourcesScreen activePersonaId={activePersonaId} personas={personas} onPersonaSourcesChanged={loadData} />;
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          onSpotifyConnect={handleSpotifyConnect}
          refreshTrigger={settingsRefresh}
          activePersonaId={activePersonaId}
          personas={personas}
        />
      );
      break;
    case 'artist':
      screen = (
        <ArtistScreen
          artist={selectedArtist}
          data={data}
          onBack={() => navigate('digest')}
        />
      );
      break;
    case 'brief':
      screen = (
        <BriefScreen
          data={data}
          onBack={() => navigate('digest')}
          onArtistClick={handleArtistClick}
        />
      );
      break;
    case 'playlist':
      screen = <PlaylistScreen status={rawStatus} />;
      break;
    case 'personas':
      screen = <PersonaEditorScreen
        onDone={() => { loadData(); navigate('digest'); }}
        onRefresh={loadData}
        onSwitchPersona={(id) => { handlePersonaSwitch(id); navigate('digest'); }}
      />;
      break;
    case 'digest':
    default:
      screen = data ? (
        <DigestScreen
          data={data}
          onArtistClick={handleArtistClick}
          onSongPlay={handleSongPlay}
          onReadBrief={() => navigate('brief')}
          running={running}
        />
      ) : (
        <WelcomeScreen />
      );
      break;
  }

  const spotifyConnected = !!(rawStatus?.spotify?.connected);
  const playlistUrl = rawStatus?.spotify?.playlistUrl || null;
  const userName = rawStatus?.userName || rawStatus?.user_name || null;
  const userEmail = rawStatus?.userEmail || rawStatus?.email || null;
  const topTitle =
    route === 'history'  ? 'History'  :
    route === 'sources'  ? 'Sources'  :
    route === 'settings' ? 'Settings' :
    route === 'playlist' ? 'Playlist' :
    route === 'brief'    ? 'The Brief' :
    route === 'artist'   ? (selectedArtist?.name || 'Artist') :
    route === 'personas' ? 'Personas' :
    data?.issue?.date    ? `${data.issue.date} · Issue #${data.issue.number}` : 'Music Digest';

  return (
    <div className="app-shell">
      <Sidebar
        route={route}
        onNavigate={navigate}
        spotifyConnected={spotifyConnected}
        personas={personas}
        activePersonaId={activePersonaId}
        onPersonaSwitch={handlePersonaSwitch}
        onManagePersonas={() => navigate('personas')}
        onDeletePersona={handleDeletePersona}
        totalSources={rawStatus?.sourcesCount ?? null}
        playlistName={playlistName}
        playlistNameIsPersona={playlistNameIsPersona}
        onPlaylistNameSave={handlePlaylistNameSave}
        updateInfo={updateInfo}
      />
      <div className="main-col">
        <Topbar
          title={topTitle}
          onRun={() => handleRun(true)}
          running={running}
          runPhase={runPhase}
          userName={userName}
          userEmail={userEmail}
          onNavigate={navigate}
          spotifyConnected={spotifyConnected}
          playlistUrl={playlistUrl}
          onOpenLog={() => setShowLog(s => !s)}
          onSpotifyConnect={handleSpotifyConnect}
          onLogout={handleLogout}
        />
        <div className="content-area">
          {screen}
        </div>
      </div>
      <LogPanel open={showLog} onClose={() => setShowLog(false)} />
    </div>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(<App />);
