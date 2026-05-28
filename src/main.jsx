import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { api, bgFromName, weekOfYear, msToMinSec } from './api.js';
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
        heroArtist.long_summary ||
        heroArtist.reason ||
        '',
      listens:
        heroArtist.streams
          ? (heroArtist.streams >= 1e6
              ? `${(heroArtist.streams / 1e6).toFixed(1)}M plays`
              : `${(heroArtist.streams / 1e3).toFixed(0)}K plays`)
          : '',
      rank: '#1 this week',
    },
    brief: (digest.summary || digest.brief || '')
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .flatMap(p => {
        // If the block is all bullet lines, split each into its own entry
        const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1 && lines.every(l => l.startsWith('•'))) {
          return [lines.join('\n')]; // keep as one block for list rendering
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [monthlyData, setMonthlyData] = useState(null);
  const [settingsRefresh, setSettingsRefresh] = useState(0);
  const [personas, setPersonas] = useState([]);
  const [activePersonaId, setActivePersonaId] = useState(null);

  // ── Initial load ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
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

  // ── Run digest ──────────────────────────────────────────────────────────────

  const handleRun = useCallback(async (force = false) => {
    if (running) return;
    setRunning(true);

    let es;
    let finished = false;
    const finish = (msg) => {
      if (finished) return;
      finished = true;
      if (es) { es.onerror = null; es.close(); }
      if (msg) showToast(msg);
      loadData();
      setRunning(false);
    };

    try {
      await api.runDigest(force);
      es = api.runStream();

      // Backend sends plain `message` events with { level, msg } in data
      es.onmessage = (e) => {
        try {
          const { level } = JSON.parse(e.data);
          if (level === 'done') finish('Digest complete!');
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
      screen = <SourcesScreen />;
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          onSpotifyConnect={handleSpotifyConnect}
          refreshTrigger={settingsRefresh}
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
      screen = <PersonaEditorScreen onDone={() => { loadData(); navigate('digest'); }} />;
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
      />
      <div className="main-col">
        <Topbar
          title={topTitle}
          onRun={() => handleRun(true)}
          running={running}
          userName={userName}
          userEmail={userEmail}
          onNavigate={navigate}
          spotifyConnected={spotifyConnected}
          playlistUrl={playlistUrl}
          onOpenLog={() => setShowLog(s => !s)}
          onSpotifyConnect={handleSpotifyConnect}
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
