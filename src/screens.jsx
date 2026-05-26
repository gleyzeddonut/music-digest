import React from 'react';
import { Icon, CoverArt, Greeting, showToast } from './components.jsx';
import { api, bgFromName } from './api.js';

// ─── DigestScreen ─────────────────────────────────────────────

export function DigestScreen({ data, onArtistClick, onSongPlay, onReadBrief, running }) {
  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', textAlign: 'center', padding: '48px' }}>
        <div style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 'clamp(32px,5vw,64px)', color: 'var(--muted)', marginBottom: 24, letterSpacing: '-0.02em' }}>
          No digest yet
        </div>
        <div style={{ color: 'var(--text-2)', fontSize: 15, lineHeight: 1.7, maxWidth: 400 }}>
          Hit <strong style={{ color: 'var(--accent)' }}>Run digest</strong> in the toolbar to generate your first daily brief.
        </div>
      </div>
    );
  }

  const { hero, brief, briefPulls, artists, songs, headlines, issue, playlistUrl } = data;
  const heroBg = hero?.bg || 'linear-gradient(135deg, #1a2a20, #08090a)';

  return (
    <div className="fade-in">
      <Greeting name={data.userName} />

      {/* ── Hero ── */}
      <div className="hero">
        <div className="hero-bg">
          <div className="portrait-hero">
            <div
              className="cover-art"
              style={{ '--ca-bg': heroBg, position: 'absolute', inset: 0, fontSize: '280px' }}
            >
              <span className="mono" style={{
                position: 'absolute',
                right: '5%',
                bottom: '-8%',
                fontSize: '38vw',
                lineHeight: 1,
                color: 'rgba(255,255,255,0.04)',
                fontFamily: 'var(--f-serif)',
                fontStyle: 'italic',
                zIndex: 0,
              }}>
                {hero?.name?.charAt(0) || '♪'}
              </span>
            </div>
          </div>
        </div>
        <div className="hero-content">
          <div className="hero-top">
            <div className="hero-chip">
              <div className="pulse" />
              Live · {issue?.date}
            </div>
            {issue?.week && <span className="hero-issue">{issue.week}</span>}
          </div>
          <div>
            <div className="hero-eyebrow">
              #1 this week
            </div>
            <h1 className="hero-title">{hero?.name || 'Today\'s Buzz'}</h1>
            {hero?.sub && <p className="hero-sub">{hero.sub}</p>}
            <div className="hero-actions">
              {artists[0] && (
                <button className="btn-play" onClick={() => onArtistClick(artists[0])}>
                  Read feature →
                </button>
              )}
              {playlistUrl && (
                <a href={playlistUrl} target="_blank" rel="noopener" className="btn-ghost">
                  <Icon name="spotify" size={15} />
                  Open playlist
                </a>
              )}
            </div>
          </div>
        </div>
        {hero?.listens && (
          <div className="hero-meta-row">
            <div className="hero-stat"><b>{hero.listens}</b></div>
            <div className="hero-stat">{hero.rank}</div>
          </div>
        )}
      </div>

      {/* ── Brief ── */}
      {brief?.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">This week</div>
              <h2 className="section-title">The brief</h2>
            </div>
            <button className="btn-read-feature" onClick={onReadBrief}>
              Read brief →
            </button>
          </div>
          <div className="brief">
            <div className="brief-body">
              {(() => {
                const bullets = (brief || []).flatMap(block =>
                  block.split('\n').map(l => l.trim()).filter(l => l.startsWith('•')).map(l => l.replace(/^•\s*/, ''))
                ).filter(Boolean);
                const preview = bullets.slice(0, 2);
                const remaining = bullets.length - preview.length;
                return (
                  <>
                    <ul className="brief-bullets">
                      {preview.map((line, i) => <li key={i}>{line}</li>)}
                    </ul>
                    {remaining > 0 && (
                      <button className="brief-more" onClick={onReadBrief}>
                        +{remaining} more {remaining === 1 ? 'story' : 'stories'} →
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            {briefPulls?.length > 0 && (
              <div className="brief-pulls">
                {briefPulls.map((pull, i) => (
                  <div key={i} className="pull-item">
                    <div className="pull-label">{pull.label}</div>
                    <div className="pull-val">
                      {pull.accent
                        ? <span className="accent">{pull.val}</span>
                        : pull.val}
                    </div>
                    {pull.foot && <div className="pull-foot">{pull.foot}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Artists ── */}
      {artists?.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">Featured</div>
              <h2 className="section-title">Artists</h2>
            </div>
            <span className="section-sub">{artists.length} picked</span>
          </div>
          <div className="artists-grid">
            {artists.map((a, i) => (
              <div key={i} className="artist-card" onClick={() => onArtistClick(a)}>
                <div className="artist-portrait">
                  <CoverArt initials={(a.name || '').slice(0, 2)} bg={a.bg} src={a.src} />
                </div>
                <div className="name">{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Songs ── */}
      {songs?.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">This issue</div>
              <h2 className="section-title">Songs</h2>
            </div>
            {playlistUrl && (
              <button
                className="section-action"
                onClick={() => window.open(playlistUrl, '_blank')}
              >
                Open in Spotify →
              </button>
            )}
          </div>
          <div className="songs">
            {songs.map((s, i) => (
              <div key={i} className="song" onClick={() => onSongPlay(s)}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <div className="cover">
                  <CoverArt initials={s.cover || '♪'} bg={s.bg} src={s.src} fontSize="11px" />
                </div>
                <div className="title-cell">
                  <div className="title">{s.title}</div>
                  <div className="artist">{s.artist}</div>
                </div>
                <div className="meta-cell">
                  {s.sig?.map((sig, j) => (
                    <span key={j} className="chip">{sig}</span>
                  ))}
                </div>
                <span className="duration">{s.dur || '—'}</span>
                <button
                  className="action"
                  title="Open in Spotify"
                  onClick={e => {
                    e.stopPropagation();
                    const url = s.spotifyId
                      ? `https://open.spotify.com/track/${s.spotifyId}`
                      : `https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist}`)}`;
                    window.open(url, '_blank');
                  }}
                >
                  <Icon name="external" size={14} />
                </button>
                <button className="action added" title="In playlist">
                  <Icon name="check" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Headlines ── */}
      {headlines?.length > 0 && (
        <div className="section" style={{ paddingBottom: 80 }}>
          <div className="section-head">
            <div>
              <div className="section-eyebrow">From the web</div>
              <h2 className="section-title">Headlines</h2>
            </div>
            <span className="section-sub">{headlines.length} stories</span>
          </div>
          <div className="headlines">
            {headlines.map((h, i) => (
              <a
                key={i}
                className="headline"
                href={h.url || `https://www.google.com/search?q=${encodeURIComponent(h.title)}`}
                target="_blank"
                rel="noopener"
              >
                <div className="src-line">
                  <span className="src-dot" />
                  <span>{h.src || h.source}</span>
                  {h.type && <span className="src-type">· {h.type}</span>}
                </div>
                <div className="headline-title">{h.title}</div>
                {h.desc && <div className="headline-desc">{h.desc}</div>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HistoryScreen ────────────────────────────────────────────

export function HistoryScreen({ onViewDigest, onDelete }) {
  const [digests, setDigests] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [selecting, setSelecting] = React.useState(false);
  const [selected, setSelected] = React.useState(new Set());
  const [deleting, setDeleting] = React.useState(false);

  const load = React.useCallback(() => {
    api.digestList().then(res => {
      setDigests(res.digests || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const allSelected = digests?.length > 0 && selected.size === digests.length;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(digests.map(d => d.date)));
  };

  const toggleOne = (date) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  };

  const cancelSelect = () => { setSelecting(false); setSelected(new Set()); };

  const handleDelete = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    try {
      await api.deleteDigests([...selected]);
      const n = selected.size;
      setSelected(new Set());
      setSelecting(false);
      load();
      onDelete?.();
      showToast(`Deleted ${n} digest${n !== 1 ? 's' : ''}`);
    } catch (err) {
      showToast(`Delete failed: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingShell />;

  if (!digests?.length) {
    return (
      <div className="section">
        <div className="section-head">
          <div><div className="section-eyebrow">History</div><h2 className="section-title">Archive</h2></div>
        </div>
        <div style={{ color: 'var(--muted)', padding: '40px 0' }}>No digests yet — run your first one.</div>
      </div>
    );
  }

  return (
    <div className="section fade-in" style={{ paddingBottom: 80 }}>
      <div className="section-head">
        <div>
          <div className="section-eyebrow">History</div>
          <h2 className="section-title">Archive</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          {selecting ? (
            <>
              <button className="btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={cancelSelect}>
                Cancel
              </button>
              <button
                className="btn-ghost"
                style={{ fontSize: 13, padding: '6px 14px', color: selected.size > 0 ? '#e55' : 'var(--muted)', borderColor: selected.size > 0 ? 'rgba(230,80,80,0.3)' : undefined, opacity: selected.size === 0 ? 0.5 : 1 }}
                onClick={handleDelete}
                disabled={selected.size === 0 || deleting}
              >
                {deleting ? 'Deleting…' : `Delete${selected.size > 0 ? ` (${selected.size})` : ''}`}
              </button>
            </>
          ) : (
            <button className="btn-ghost" style={{ fontSize: 13, padding: '6px 14px' }} onClick={() => setSelecting(true)}>
              Delete archives
            </button>
          )}
        </div>
      </div>

      {selecting && (
        <div className="hist-select-all" onClick={toggleAll}>
          <input
            type="checkbox"
            className="hist-cb"
            checked={allSelected}
            onChange={toggleAll}
            onClick={e => e.stopPropagation()}
          />
          <span>{allSelected ? 'Deselect all' : 'Select all'}</span>
        </div>
      )}

      <div className={`history-list${selecting ? ' history-list-selecting' : ''}`}>
        {digests.map((d, i) => {
          const date = new Date(d.date + 'T12:00:00Z');
          const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const year = date.getFullYear();
          const topArtists = (d.artists || []).slice(0, 3).map(a => a.name).join(', ');
          const headlines = (d.summary || '').slice(0, 90);
          const thumbs = (d.artists || []).slice(0, 3);
          const isSelected = selected.has(d.date);

          return (
            <div
              key={d.date}
              className={`hist-row${isSelected ? ' hist-row-selected' : ''}`}
              onClick={() => selecting ? toggleOne(d.date) : onViewDigest(d.date)}
            >
              {selecting && (
                <input
                  type="checkbox"
                  className="hist-cb"
                  checked={isSelected}
                  onChange={() => toggleOne(d.date)}
                  onClick={e => e.stopPropagation()}
                />
              )}
              <div className="hist-date">
                <b>{formatted}</b>
                <span className="hist-issue">#{d.id || i + 1} · {year}</span>
              </div>
              <div className="hist-headline">
                {topArtists
                  ? <>{topArtists.split(', ')[0]} <em>&</em> more buzzing</>
                  : headlines || 'No summary'}
              </div>
              <div className="hist-thumbs">
                {thumbs.map((a, j) => (
                  <div key={j} className="hist-thumb">
                    <CoverArt
                      initials={(a.name || '').slice(0, 2)}
                      bg={`linear-gradient(135deg, hsl(${(j * 120) % 360} 40% 35%), hsl(${(j * 120 + 30) % 360} 30% 20%))`}
                    />
                  </div>
                ))}
              </div>
              <div className="hist-stats">
                {d.artists?.length || 0} artists<br />
                {d.songs?.length || 0} songs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SourcesScreen ────────────────────────────────────────────

export function SourcesScreen() {
  const [sources, setSources] = React.useState(null);
  const [newType, setNewType] = React.useState('reddit');
  const [newName, setNewName] = React.useState('');
  const [newUrl, setNewUrl] = React.useState('');
  const [newSel, setNewSel] = React.useState('');
  const [testing, setTesting] = React.useState({});

  const TYPE_LABELS = { reddit: 'Reddit', rss: 'RSS', html: 'HTML', tiktok: 'TikTok', 'spotify-playlist': 'Spotify', tokchart: 'Tokchart', youtube: 'YouTube' };
  const URL_LABEL = { reddit: 'Subreddit slug', rss: 'Feed URL', html: 'Page URL', tiktok: 'Identifier', 'spotify-playlist': 'Playlist URL or ID', youtube: 'Chart URL' };
  const URL_PH = { reddit: 'indieheads', rss: 'https://…/feed', html: 'https://…', tiktok: 'tiktok://trending', 'spotify-playlist': 'https://open.spotify.com/playlist/…', youtube: 'https://charts.youtube.com/charts/TrendingVideos/us/RightNow' };

  React.useEffect(() => {
    api.sources().then(setSources).catch(() => setSources([]));
  }, []);

  const reload = () => api.sources().then(setSources);

  const toggle = async (id, enabled) => {
    await api.patchSource(id, { enabled: !enabled });
    reload();
  };

  const remove = async (id) => {
    if (!confirm('Remove this source?')) return;
    await api.delSource(id);
    showToast('Source removed');
    reload();
  };

  const test = async (id) => {
    setTesting(t => ({ ...t, [id]: 'loading' }));
    try {
      const r = await api.testSource(id);
      setTesting(t => ({ ...t, [id]: r.ok ? `✓ ${r.count} items` : `✗ ${r.error}` }));
      setTimeout(() => setTesting(t => { const n = { ...t }; delete n[id]; return n; }), 4000);
    } catch (e) {
      setTesting(t => ({ ...t, [id]: '✗ error' }));
    }
  };

  const addSource = async () => {
    if (!newName || !newUrl) { showToast('Name and URL/slug are required'); return; }
    let url = newUrl;
    if (newType === 'spotify-playlist') {
      const m = url.match(/playlist\/([A-Za-z0-9]+)/);
      if (m) url = m[1];
    }
    await api.addSource({ type: newType, name: newName, url, selector: newSel || undefined });
    showToast(`Added ${newName}`);
    setNewName(''); setNewUrl(''); setNewSel('');
    reload();
  };

  const grouped = { reddit: [], rss: [], html: [], tiktok: [], 'spotify-playlist': [], tokchart: [], youtube: [] };
  for (const s of (sources || [])) {
    if (grouped[s.type] !== undefined) grouped[s.type].push(s);
    else grouped.html.push(s);
  }

  const typeTagClass = { reddit: 't-reddit', rss: 't-rss', html: 't-html', tiktok: 't-html', 'spotify-playlist': 't-spotify', tokchart: 't-html', youtube: 't-youtube' };

  return (
    <div className="section fade-in" style={{ paddingBottom: 80 }}>
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Data</div>
          <h2 className="section-title">Sources</h2>
        </div>
        <span className="section-sub">{sources?.length ?? '—'} active</span>
      </div>

      {/* Add form */}
      <div className="src-toolbar" style={{ flexWrap: 'wrap', gap: 8, paddingBottom: 16 }}>
        <select
          className="form-select"
          value={newType}
          onChange={e => { setNewType(e.target.value); setNewUrl(''); setNewSel(''); }}
          style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '8px 12px', borderRadius: 7, font: 'inherit', fontSize: 13, outline: 'none' }}
        >
          {Object.entries(TYPE_LABELS).filter(([v]) => v !== 'tokchart' && v !== 'youtube').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input
          className="form-input"
          placeholder="Display name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          style={{ width: 160, background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '8px 12px', borderRadius: 7, font: 'inherit', fontSize: 13, outline: 'none' }}
        />
        <input
          className="form-input"
          placeholder={URL_PH[newType]}
          value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSource()}
          style={{ width: 260, background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '8px 12px', borderRadius: 7, font: 'inherit', fontSize: 13, outline: 'none' }}
        />
        {(newType === 'html') && (
          <input
            className="form-input"
            placeholder="CSS selector (optional)"
            value={newSel}
            onChange={e => setNewSel(e.target.value)}
            style={{ width: 200, background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '8px 12px', borderRadius: 7, font: 'inherit', fontSize: 13, outline: 'none' }}
          />
        )}
        <button className="btn-primary" onClick={addSource}>Add</button>
      </div>

      {sources === null ? <LoadingShell /> : Object.entries(grouped).map(([type, items]) => {
        if (!items.length) return null;
        return (
          <div key={type} className="src-group">
            <div className="src-group-head">
              <span className="label">{TYPE_LABELS[type]}</span>
              <span className="count">({items.length})</span>
            </div>
            {items.map(s => (
              <div key={s.id} className="src-row">
                <button
                  className={`toggle${s.enabled ? ' on' : ''}`}
                  onClick={() => toggle(s.id, s.enabled)}
                  title={s.enabled ? 'Disable' : 'Enable'}
                />
                <div className="nm">
                  {s.name}
                  <span className="u">{s.url}</span>
                </div>
                <div className={`src-type-tag ${typeTagClass[type] || 't-html'}`}>{TYPE_LABELS[type]}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    style={{ fontSize: 11, padding: '4px 9px', background: 'var(--bg-elev)', border: '1px solid var(--line)', borderRadius: 5, color: 'var(--text-2)', cursor: 'pointer' }}
                    onClick={() => test(s.id)}
                  >
                    {testing[s.id] === 'loading' ? '…' : testing[s.id] || 'Test'}
                  </button>
                  {s.type !== 'tokchart' && s.type !== 'youtube' && (
                    <button className="del" onClick={() => remove(s.id)} title="Remove">
                      <Icon name="trash" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── SettingsScreen ───────────────────────────────────────────

export function SettingsScreen({ onSpotifyConnect }) {
  const [settings, setSettings] = React.useState(null);
  const [status, setStatus] = React.useState(null);
  const [isElectron, setIsElectron] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [playlistName, setPlaylistName] = React.useState('🎵 Music Digest');

  const reload = () => Promise.all([api.settings(), api.status()]).then(([s, st]) => {
    setSettings(s);
    setStatus(st);
    setPlaylistName(st?.spotify?.playlistName || s?.spotify?.playlistName || '🎵 Music Digest');
  });

  React.useEffect(() => {
    reload();
    api.loginItem().then(d => { if (d.isElectron) setIsElectron(true); }).catch(() => {});
  }, []);

  const save = async (patch) => {
    try {
      await api.saveSchedule({ ...settings, ...patch });
      setSettings(s => ({ ...s, ...patch }));
      showToast('Saved');
    } catch { showToast('Failed to save'); }
  };

  const resend = async () => {
    try {
      const d = await api.latestDigest();
      if (!d) { showToast('No digest to resend'); return; }
      await api.resendDigest(d.date);
      showToast('Email sent');
    } catch { showToast('Failed to send'); }
  };

  const disconnect = async () => {
    if (!window.confirm('Disconnect Spotify? The playlist will remain on Spotify but no new tracks will be added.')) return;
    setDisconnecting(true);
    try {
      await api.spotifyDisconnect();
      await reload();
      showToast('Spotify disconnected');
    } catch { showToast('Failed to disconnect'); }
    finally { setDisconnecting(false); }
  };

  if (!settings) return <LoadingShell />;

  const freq = settings.frequency || 'daily';
  const schedEnabled = settings.scheduleEnabled !== false;
  const spotify = status?.spotify || {};

  const sectionLabel = (title, desc) => (
    <div>
      <h3 style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', fontSize: 26, color: 'var(--text)', fontWeight: 400, marginBottom: 6 }}>{title}</h3>
      <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>{desc}</p>
    </div>
  );

  const inputStyle = { background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '7px 11px', borderRadius: 6, fontFamily: 'var(--f-mono)', fontSize: 12.5, outline: 'none' };
  const gridRow = { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 56, marginBottom: 48, alignItems: 'start' };

  return (
    <div className="section fade-in" style={{ paddingBottom: 80 }}>
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Configuration</div>
          <h2 className="section-title">Settings</h2>
        </div>
      </div>

      {/* Schedule */}
      <div style={gridRow}>
        {sectionLabel('Schedule', 'When and how often you receive your digest.')}
        <div className="set-card">
          <SettingRow label="Enabled">
            <Toggle
              on={schedEnabled}
              onChange={v => save({ enabled: v })}
            />
          </SettingRow>
          <SettingRow label="Frequency">
            <select
              value={freq}
              onChange={e => save({ frequency: e.target.value })}
              style={inputStyle}
              disabled={!schedEnabled}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </SettingRow>
          {freq === 'weekly' && (
            <SettingRow label="Day of week">
              <select
                value={settings.weekDay ?? 5}
                onChange={e => save({ weekDay: parseInt(e.target.value) })}
                style={inputStyle}
                disabled={!schedEnabled}
              >
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </SettingRow>
          )}
          <SettingRow label="Send time">
            <input
              type="time"
              value={settings.sendTime || '08:00'}
              onChange={e => setSettings(s => ({ ...s, sendTime: e.target.value }))}
              onBlur={e => save({ sendTime: e.target.value })}
              style={inputStyle}
              disabled={!schedEnabled}
            />
          </SettingRow>
          <SettingRow label="Timezone">
            <span className="v">{settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </SettingRow>
        </div>
      </div>

      {/* Delivery */}
      <div style={gridRow}>
        {sectionLabel('Delivery', 'Where to send your daily brief.')}
        <div className="set-card">
          <SettingRow label="Send digest to">
            <input
              type="email"
              value={settings.email || ''}
              onChange={e => setSettings(s => ({ ...s, email: e.target.value }))}
              onBlur={e => save({ digestTo: e.target.value })}
              placeholder="you@example.com"
              style={{ ...inputStyle, width: 220 }}
            />
          </SettingRow>
          <SettingRow label="Your name">
            <input
              type="text"
              value={settings.userName || ''}
              onChange={e => setSettings(s => ({ ...s, userName: e.target.value }))}
              onBlur={e => save({ userName: e.target.value })}
              placeholder="e.g. Dan"
              style={{ ...inputStyle, width: 160 }}
            />
          </SettingRow>
          <SettingRow label="Resend latest">
            <button onClick={resend} style={{ ...inputStyle, cursor: 'pointer', color: 'var(--text-2)' }}>
              ↩ Resend email
            </button>
          </SettingRow>
        </div>
      </div>

      {/* Spotify */}
      <div style={gridRow}>
        {sectionLabel('Spotify', 'Connect to build a playlist of every song from your digests.')}
        <div className="set-card">
          <SettingRow label="Playlist name">
            <input
              type="text"
              value={playlistName}
              onChange={e => setPlaylistName(e.target.value)}
              onBlur={async e => {
                const val = e.target.value.trim();
                if (!val) return;
                try {
                  await api.saveSpotifyPlaylistName(val);
                  showToast(spotify.connected && spotify.playlistUrl ? 'Playlist will be renamed on next digest run' : 'Name saved');
                } catch { showToast('Failed to save name'); }
              }}
              placeholder="e.g. My Music Digest"
              style={{ ...inputStyle, width: 220 }}
            />
          </SettingRow>
          {spotify.connected ? (
            <>
              <SettingRow label="Status">
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--accent)', fontSize: 13, fontFamily: 'var(--f-mono)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)', display: 'inline-block', flexShrink: 0 }} />
                  Connected
                </span>
              </SettingRow>
              <SettingRow label="Playlist">
                {spotify.playlistUrl
                  ? <a href={spotify.playlistUrl} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 12.5 }}>Open in Spotify →</a>
                  : <span style={{ color: 'var(--muted)', fontSize: 12.5, fontFamily: 'var(--f-mono)' }}>Created on your first digest run</span>}
              </SettingRow>
              <SettingRow label="Tracks added">
                <span className="v">{status?.tracksInPlaylist ?? '—'}</span>
              </SettingRow>
              <SettingRow label="Disconnect">
                <button
                  onClick={disconnect}
                  disabled={disconnecting}
                  style={{ ...inputStyle, cursor: 'pointer', color: 'var(--danger)', borderColor: 'var(--danger)', opacity: disconnecting ? 0.5 : 1 }}
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect Spotify'}
                </button>
              </SettingRow>
            </>
          ) : (
            <SettingRow label="Connect">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={onSpotifyConnect}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'var(--accent)', color: '#04130a', borderRadius: 999, fontSize: 13, fontWeight: 600, width: 'fit-content', border: 'none', cursor: 'pointer' }}
                >
                  <Icon name="spotify" size={15} />
                  Connect Spotify
                </button>
                <span style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'var(--f-mono)' }}>
                  Authorises playlist creation &amp; track adding
                </span>
              </div>
            </SettingRow>
          )}
        </div>
      </div>

      {/* Electron-only */}
      {isElectron && (
        <div style={gridRow}>
          {sectionLabel('System', 'App-level settings.')}
          <div className="set-card">
            <SettingRow label="Version">
              <span className="v">1.0.3</span>
            </SettingRow>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 2,
        background: on ? 'var(--accent)' : 'var(--line)',
        transition: 'background 0.18s',
        position: 'relative', display: 'flex', alignItems: 'center',
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        display: 'block', transition: 'transform 0.18s',
        transform: on ? 'translateX(18px)' : 'translateX(0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
      }} />
    </button>
  );
}

function SettingRow({ label, children }) {
  return (
    <div className="set-row">
      <span className="k">{label}</span>
      {children}
    </div>
  );
}

function boldArtistNames(text, names, urlMap = {}) {
  const boldStyle = { color: 'var(--text)', fontWeight: 600 };
  const linkStyle = { color: 'inherit', textDecoration: 'none' };

  // Try known artist names first
  if (names?.length) {
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`(${escaped.join('|')})`, 'gi');
    if (re.test(text)) {
      re.lastIndex = 0;
      return text.split(re).map((part, i) => {
        const match = names.find(n => n.toLowerCase() === part.toLowerCase());
        if (!match) return part;
        const url = urlMap[match.toLowerCase()];
        const bold = <strong key={i} style={boldStyle}>{part}</strong>;
        return url
          ? <a key={`a${i}`} href={url} target="_blank" rel="noreferrer" style={linkStyle}>{bold}</a>
          : bold;
      });
    }
  }

  return text;
}

// ─── BriefScreen ──────────────────────────────────────────────

export function BriefScreen({ data, onBack, onArtistClick }) {
  if (!data) return null;
  const { brief, briefArtistNames, briefArtistSpotifyUrls = {}, artists, issue } = data;

  return (
    <div className="fade-in">
      <div className="detail-actions" style={{ marginBottom: 0 }}>
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>

      <div className="section" style={{ paddingTop: 12 }}>
        <div className="section-head">
          <div>
            <div className="section-eyebrow">This week</div>
            <h2 className="section-title">The Brief</h2>
          </div>
          {issue?.date && <span className="section-sub">{issue.date}</span>}
        </div>
        <div className="brief-full-body">
          {(brief || []).map((block, i) => {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            const bullets = lines.filter(l => l.startsWith('•'));
            if (bullets.length > 1 || (bullets.length === 1 && lines.length === 1)) {
              return (
                <ul key={i} className="brief-bullets">
                  {bullets.map((l, j) => <li key={j}>{boldArtistNames(l.replace(/^•\s*/, ''), briefArtistNames, briefArtistSpotifyUrls)}</li>)}
                </ul>
              );
            }
            return <p key={i}>{boldArtistNames(block, briefArtistNames, briefArtistSpotifyUrls)}</p>;
          })}
        </div>
      </div>

      {artists?.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">Mentioned</div>
              <h2 className="section-title">Artists</h2>
            </div>
          </div>
          <div className="artists-grid">
            {artists.map((a, i) => (
              <div key={i} className="artist-card" onClick={() => onArtistClick(a)}>
                <div className="artist-portrait">
                  <CoverArt initials={(a.name || '').slice(0, 2)} bg={a.bg} src={a.src} />
                </div>
                <div className="name">{a.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ArtistScreen ─────────────────────────────────────────────

export function ArtistScreen({ artist, data, onBack }) {
  if (!artist) return null;
  const bg = artist.bg || 'linear-gradient(160deg, #1a2a1f, #08090a 70%)';
  const artistSongs = (data?.songs || []).filter(s => s.artist === artist.name);

  return (
    <div className="fade-in">
      <div className="detail-hero" style={{ '--detail-bg': bg }}>
        <div className="detail-cover">
          <CoverArt initials={(artist.name || '').slice(0, 2)} bg={bg} src={artist.src} />
        </div>
        <div className="detail-meta">
          <div className="detail-eyebrow">
            {(artist.tier || 'BREAKING').toUpperCase()}
          </div>
          <h1 className="detail-title">{artist.name}</h1>
          <div className="detail-stat-row">
            {artist.sig?.map((s, i) => (
              <React.Fragment key={i}>
                <span>{s}</span>
                {i < artist.sig.length - 1 && <span className="dot" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <div className="detail-actions">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
      </div>
      <div className="section" style={{ paddingBottom: 80 }}>
        {artist.reason && (
          <div style={{ marginBottom: 32 }}>
            <div className="section-eyebrow" style={{ marginBottom: 12 }}>Why they're featured</div>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', maxWidth: 640 }}>{artist.reason}</p>
          </div>
        )}
        {artistSongs.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: 24 }}>
              <div>
                <div className="section-eyebrow">Songs in this issue</div>
                <h2 className="section-title sans">Tracks</h2>
              </div>
            </div>
            <div className="songs">
              {artistSongs.map((s, i) => (
                <div key={i} className="song">
                  <span className="num">{i + 1}</span>
                  <div className="cover">
                    <CoverArt initials={s.cover || '♪'} bg={s.bg} src={s.src} fontSize="11px" />
                  </div>
                  <div className="title-cell">
                    <div className="title">{s.title}</div>
                    <div className="artist">{s.artist}</div>
                  </div>
                  <div className="meta-cell">{s.sig?.map((sig, j) => <span key={j} className="chip">{sig}</span>)}</div>
                  <span className="duration">{s.dur || '—'}</span>
                  <button className="action" onClick={() => {
                    const url = s.spotifyId
                      ? `https://open.spotify.com/track/${s.spotifyId}`
                      : `https://open.spotify.com/search/${encodeURIComponent(s.title + ' ' + s.artist)}`;
                    window.open(url, '_blank');
                  }}>
                    <Icon name="external" size={14} />
                  </button>
                  <button className="action added"><Icon name="check" size={14} /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── PlaylistScreen ───────────────────────────────────────────

export function PlaylistScreen({ status }) {
  const [tracks, setTracks] = React.useState(null);

  React.useEffect(() => {
    fetch('/api/playlist_tracks')
      .then(r => r.ok ? r.json() : { tracks: [] })
      .then(d => setTracks(d.tracks || []))
      .catch(() => setTracks([]));
  }, []);

  const playlistUrl = status?.spotify?.playlistUrl;

  return (
    <div className="section fade-in" style={{ paddingBottom: 80 }}>
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Spotify</div>
          <h2 className="section-title">Playlist</h2>
        </div>
        {playlistUrl && (
          <button className="section-action" onClick={() => window.open(playlistUrl, '_blank')}>
            Open in Spotify →
          </button>
        )}
      </div>

      {tracks === null ? (
        <LoadingShell />
      ) : tracks.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: '40px 0' }}>
          {status?.spotify?.connected
            ? 'No tracks added yet — run a digest to start building your playlist.'
            : <span>Connect Spotify in <button onClick={() => {}} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Settings</button> to build your playlist.</span>}
        </div>
      ) : (
        <div className="songs" style={{ marginTop: 8 }}>
          <div className="tracklist-head">
            <span>#</span>
            <span />
            <span>Title</span>
            <span>Added</span>
            <span />
          </div>
          {tracks.map((t, i) => (
            <div key={i} className="song">
              <span className="num">{i + 1}</span>
              <div className="cover">
                <CoverArt initials={(t.title || '♪').slice(0, 2)} bg={`linear-gradient(135deg, hsl(${(i * 47) % 360} 40% 35%), hsl(${(i * 47 + 30) % 360} 30% 20%))`} fontSize="11px" />
              </div>
              <div className="title-cell">
                <div className="title">{t.title}</div>
                <div className="artist">{t.artist}</div>
              </div>
              <span className="duration" style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--f-mono)' }}>
                {t.added_at ? new Date(t.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
              </span>
              <button className="action" onClick={() => t.spotify_id && (window.location.href = `spotify:track:${t.spotify_id}`)}>
                <Icon name="external" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Onboarding ───────────────────────────────────────────────

export function Onboarding({ onDone }) {
  const [step, setStep] = React.useState(0);
  const STEPS = ['Welcome', 'Spotify', 'Sources', 'Schedule', 'Done'];


  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else onDone();
  };
  const back = () => setStep(s => Math.max(0, s - 1));

  const pct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="ob-wrap">
      <div className="ob-left">
        <div className="ob-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 26, height: 26, background: 'var(--accent)', borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="today" size={13} />
          </div>
          <span style={{ fontFamily: 'var(--f-sans)', fontWeight: 700, fontSize: 15 }}>Music <em style={{ fontFamily: 'var(--f-serif)', fontStyle: 'italic', color: 'var(--accent)', fontSize: 17 }}>Digest</em></span>
        </div>
        <div className="ob-quote">
          Your daily <em>music brief</em>, curated from everywhere.
          <span className="by">Music Digest · {new Date().getFullYear()}</span>
        </div>
      </div>

      <div className="ob-right">
        <div className="ob-step-meta">
          <span>Step {step + 1} of {STEPS.length}</span>
          <div className="ob-progress">
            <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>{STEPS[step]}</span>
        </div>

        {step === 0 && <StepWelcome />}
        {step === 1 && <StepSpotify onConnected={next} />}
        {step === 2 && <StepSources />}
        {step === 3 && <StepSchedule onDone={next} />}
        {step === 4 && <StepDone onDone={onDone} />}

        {step < 4 && (
          <div className="ob-foot">
            {step > 0 && <button className="ob-back" onClick={back}>← Back</button>}
            <button className="ob-skip" onClick={onDone}>Skip setup</button>
            {step !== 3 && (
              <button className="ob-next" onClick={next}>
                {'Continue →'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepWelcome() {
  return (
    <>
      <h2 className="ob-title">Welcome to Music Digest</h2>
      <p className="ob-desc">
        Every day, Music Digest scans Reddit, music publications, and Spotify playlists
        to find what's buzzing — then emails you a curated brief and builds a Spotify playlist of the week's top songs.
      </p>
      <p className="ob-desc" style={{ color: 'var(--muted)', fontSize: 13 }}>
        Let's get you set up in 3 minutes.
      </p>
    </>
  );
}

function StepSpotify({ onConnected }) {
  const [connected, setConnected] = React.useState(false);

  const handleConnect = async () => {
    try {
      const authUrl = await api.spotifyAuthUrlJson();
      window.open(authUrl);
    } catch {
      window.open(api.spotifyAuthUrl());
    }
  };

  React.useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const s = await api.status();
        if (s?.spotify?.connected) {
          setConnected(true);
          clearInterval(interval);
          onConnected?.();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [onConnected]);

  return (
    <>
      <h2 className="ob-title">Connect Spotify</h2>
      <p className="ob-desc">
        Music Digest builds a Spotify playlist of every song it discovers — automatically added after each digest.
      </p>
      {connected ? (
        <p style={{ color: 'var(--accent)', fontFamily: 'var(--f-mono)', fontSize: 14 }}>✓ Spotify connected — continuing…</p>
      ) : (
        <button onClick={handleConnect} className="ob-spotify-btn" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <Icon name="spotify" size={16} />
          Connect your Spotify account
        </button>
      )}
      <p style={{ marginTop: 14, fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--f-mono)' }}>
        Read-only for playback · write access only for your playlist
      </p>
    </>
  );
}

function StepSources() {
  const [sources, setSources] = React.useState([]);
  React.useEffect(() => {
    api.sources().then(setSources).catch(() => {});
  }, []);

  return (
    <>
      <h2 className="ob-title">Your sources</h2>
      <p className="ob-desc">These are the sources seeded by default. Toggle them on/off or add your own later.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sources.slice(0, 5).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--line-soft)' }}>
            <button
              className={`toggle${s.enabled ? ' on' : ''}`}
              onClick={() => api.patchSource(s.id, { enabled: !s.enabled }).then(() => setSources(prev => prev.map(p => p.id === s.id ? { ...p, enabled: !p.enabled } : p)))}
            />
            <div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--f-mono)' }}>{s.type}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function StepSchedule({ onDone }) {
  const [time, setTime] = React.useState('08:00');
  const [email, setEmail] = React.useState('');

  const save = async () => {
    await api.saveSchedule({ sendTime: time, digestTo: email, frequency: 'daily', enabled: true });
    onDone();
  };

  return (
    <>
      <h2 className="ob-title">Your schedule</h2>
      <p className="ob-desc">When should we send your daily digest?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Send time</div>
          <input type="time" value={time} onChange={e => setTime(e.target.value)}
            style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--f-mono)', fontSize: 14, outline: 'none' }} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Email address</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            style={{ background: 'var(--bg-elev)', border: '1px solid var(--line)', color: 'var(--text)', padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--f-mono)', fontSize: 14, outline: 'none', width: '100%' }} />
        </div>
      </div>
      <div className="ob-foot" style={{ paddingTop: 0, marginTop: 0 }}>
        <button className="ob-next" onClick={save}>Save &amp; continue →</button>
      </div>
    </>
  );
}

function StepDone({ onDone }) {
  return (
    <>
      <h2 className="ob-title">You're all set</h2>
      <p className="ob-desc">Music Digest is ready. Run your first scan now or let the scheduler kick in at your chosen time.</p>
      <button className="ob-next" style={{ display: 'inline-block', marginTop: 8 }} onClick={onDone}>
        Open dashboard →
      </button>
    </>
  );
}

// ─── MonthlyScreen ────────────────────────────────────────────

export function MonthlyScreen({ data }) {
  if (!data) {
    return (
      <div style={{ padding: '48px var(--content-pad)', color: 'var(--muted)', fontFamily: 'var(--f-mono)', fontSize: 13 }}>
        Loading monthly recap…
      </div>
    );
  }

  if (data.error) {
    return (
      <div style={{ padding: '48px var(--content-pad)' }}>
        <div style={{ color: 'var(--text)', fontSize: 15, marginBottom: 8 }}>Couldn't load monthly recap.</div>
        <div style={{ color: 'var(--muted)', fontFamily: 'var(--f-mono)', fontSize: 12 }}>Click "This Month" in the sidebar to try again.</div>
      </div>
    );
  }

  const { month, digestCount, headlineCount, artists, songs, topArtist, topSong } = data;

  if (digestCount === 0) {
    return (
      <div className="fade-in" style={{ padding: '48px var(--content-pad)' }}>
        <div className="section-eyebrow">Monthly Recap</div>
        <h2 className="section-title" style={{ marginTop: 4 }}>{month}</h2>
        <p style={{ color: 'var(--text-2)', marginTop: 16, fontSize: 15 }}>No digests yet this month — check back soon.</p>
      </div>
    );
  }

  return (
    <div className="fade-in">

      {/* ── Hero ── */}
      <div className="monthly-hero">
        <div className="section-eyebrow">Monthly Recap</div>
        <h1 className="monthly-title">{month}</h1>
        <div className="monthly-meta-row">
          <span>{digestCount} {digestCount === 1 ? 'digest' : 'digests'}</span>
          <span className="dot" />
          <span>{headlineCount} headlines</span>
          <span className="dot" />
          <span>{artists.length} artists</span>
          <span className="dot" />
          <span>{songs.length} songs discovered</span>
        </div>
      </div>

      {/* ── Top picks ── */}
      {(topArtist || topSong) && (
        <div className="section">
          <div className="monthly-top-grid">

            {topArtist && (
              <div className="monthly-top-card">
                <div className="section-eyebrow" style={{ marginBottom: 14 }}>Artist of the Month</div>
                <div className="monthly-top-artist-row">
                  <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                    <CoverArt initials={(topArtist.name || '').slice(0, 2)} bg={bgFromName(topArtist.name)} />
                  </div>
                  <div>
                    <div className="monthly-top-name">{topArtist.name}</div>
                    <div className="monthly-top-sub">
                      Featured {topArtist.count} of {digestCount} {digestCount === 1 ? 'day' : 'days'}
                    </div>
                  </div>
                </div>
                {topArtist.reasons?.[0] && (
                  <p className="monthly-top-reason">{topArtist.reasons[0]}</p>
                )}
              </div>
            )}

            {topSong && (
              <div className="monthly-top-card">
                <div className="section-eyebrow" style={{ marginBottom: 14 }}>Song of the Month</div>
                <div className="monthly-top-name">{topSong.title}</div>
                <div className="monthly-top-artist-name">{topSong.artist}</div>
                <div className="monthly-top-sub" style={{ marginTop: 8 }}>
                  Appeared in {topSong.count} of {digestCount} {digestCount === 1 ? 'digest' : 'digests'}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Artists grid ── */}
      {artists.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-eyebrow">This Month</div>
              <h2 className="section-title">Artists</h2>
            </div>
          </div>
          <div className="artists-grid">
            {artists.slice(0, 8).map((a, i) => (
              <div key={i} className="artist-card">
                <div className="artist-portrait">
                  <CoverArt initials={(a.name || '').slice(0, 2)} bg={bgFromName(a.name)} />
                </div>
                <div className="name">{a.name}</div>
                <div className="monthly-count-badge">{a.count}×</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top songs ── */}
      {songs.length > 0 && (
        <div className="section" style={{ paddingBottom: 80 }}>
          <div className="section-head">
            <div>
              <div className="section-eyebrow">This Month</div>
              <h2 className="section-title">Top Songs</h2>
            </div>
          </div>
          <div className="songs">
            {songs.slice(0, 10).map((s, i) => (
              <div key={i} className="song">
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <div className="cover">
                  <CoverArt initials={(s.title || '♪').slice(0, 2)} bg={bgFromName(s.artist)} fontSize="11px" />
                </div>
                <div className="title-cell">
                  <div className="title">{s.title}</div>
                  <div className="artist">{s.artist}</div>
                </div>
                <div className="meta-cell">
                  <span className="chip">{s.count}× this month</span>
                </div>
                <button
                  className="action"
                  title="Search on Spotify"
                  onClick={() => window.open(`https://open.spotify.com/search/${encodeURIComponent(`${s.title} ${s.artist}`)}`, '_blank')}
                >
                  <Icon name="external" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Loading Shell ─────────────────────────────────────────────

export function LoadingShell() {
  return (
    <div style={{ padding: '48px var(--content-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          height: i === 1 ? 200 : 60,
          borderRadius: 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--line-soft)',
          animation: 'pulse 1.4s ease infinite',
          animationDelay: `${i * 0.1}s`,
          opacity: 0.6,
        }} />
      ))}
    </div>
  );
}
