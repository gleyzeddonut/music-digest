const axios = require('axios');

const EMBED_BASE = 'https://open.spotify.com/embed/playlist/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchViaEmbed(playlistId) {
  const { data } = await axios.get(EMBED_BASE + playlistId, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    timeout: 15000,
  });
  const match = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('__NEXT_DATA__ not found in embed page');
  const json = JSON.parse(match[1]);
  const entity = json?.props?.pageProps?.state?.data?.entity;
  if (!entity?.trackList) throw new Error('trackList missing in embed data');
  return {
    name: entity.name,
    tracks: entity.trackList.map(t => ({ title: t.title, artist: t.subtitle })),
  };
}

async function scrapeSpotifyPlaylists(sources) {
  const results = [];

  for (const source of sources) {
    const playlistId = source.url.replace('spotify:playlist:', '').trim();
    try {
      const { name, tracks } = await fetchViaEmbed(playlistId);
      const displayName = source.name === 'My Spotify Playlist' ? name : source.name;
      const items = tracks.map(t => ({
        title: `${t.title} — ${t.artist}`,
        description: '',
        url: `https://open.spotify.com/search/${encodeURIComponent(t.title + ' ' + t.artist)}`,
      }));
      console.log(`[spotify-playlist] ${displayName}: ${items.length} tracks`);
      if (items.length) results.push({ source: displayName, items });
    } catch (err) {
      console.warn(`[spotify-playlist] Failed ${source.name}: ${err.message}`);
      results.push({ source: source.name, items: [] });
    }
  }

  return results;
}

module.exports = { scrapeSpotifyPlaylists };
