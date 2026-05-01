const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');

function buildPrompt(date, redditData, webData, tiktokData = [], playlistData = [], scoredData = null) {
  const lines = [`TODAY'S DATE: ${date}\n`];

  if (scoredData && (scoredData.breaking.length > 0 || scoredData.rising.length > 0)) {
    lines.push('=== SIGNAL SCORES (pre-computed — preserve tiers, write narrative only) ===\n');

    function formatTier(label, artists) {
      if (!artists.length) return;
      lines.push(`=== ${label} ===\n`);
      for (const s of artists) {
        const { entity: e } = s;
        lines.push(`[total: ${s.total.toFixed(2)} | chart: ${s.chart.toFixed(2)} | editorial: ${s.editorial.toFixed(2)} | community: ${s.community.toFixed(2)} | velocity: ${s.velocity.toFixed(2)}]`);
        lines.push(e.name);

        const chartParts = [];
        if (e.chartPositions.apple)  chartParts.push(`Apple Music #${e.chartPositions.apple}`);
        if (e.chartPositions.lastfm) chartParts.push(`Last.fm Top Artists #${e.chartPositions.lastfm}`);
        if (chartParts.length) lines.push(`  Charts: ${chartParts.join(', ')}`);

        const editSources = [...new Set(e.editorialArticles.map(a => a.source))];
        if (editSources.length) lines.push(`  Editorial: ${editSources.join(', ')}`);

        if (e.redditPosts.length) {
          const top = [...e.redditPosts].sort((a, b) => b.score - a.score).slice(0, 3);
          lines.push(`  Community: ${top.map(p => `${p.source} ${p.score}↑ ${p.comments}💬`).join(', ')}`);
        }

        const velParts = [];
        if (e.lastfmListeners?.baseline > 0) {
          const pct = Math.round((e.lastfmListeners.current - e.lastfmListeners.baseline) / e.lastfmListeners.baseline * 100);
          velParts.push(`Last.fm ${pct >= 0 ? '+' : ''}${pct}% WoW`);
        }
        if (e.geniusTrending) velParts.push(`Genius trending #${e.geniusTrending.rank}`);
        if (velParts.length) lines.push(`  Velocity: ${velParts.join(', ')}`);

        lines.push('');
      }
    }

    formatTier('BREAKING (chart-confirmed)', scoredData.breaking);
    formatTier('RISING (emerging signal)',   scoredData.rising);
  }

  lines.push('=== REDDIT MUSIC FORUMS ===');
  for (const { source, posts } of redditData) {
    lines.push(`\n[${source}]`);
    const top = [...posts].sort((a, b) => b.score - a.score).slice(0, 20);
    for (const p of top) {
      lines.push(`  • "${p.title}" (${p.score}↑ ${p.comments}💬${p.flair ? ` [${p.flair}]` : ''})`);
    }
  }

  if (tiktokData.length > 0 || playlistData.length > 0) {
    lines.push('\n=== TIKTOK TRENDING SOUNDS ===');
    for (const { source, items } of [...tiktokData, ...playlistData]) {
      lines.push(`\n[${source}]`);
      for (const item of items.slice(0, 50)) {
        lines.push(`  • ${item.title}${item.description ? ` (${item.description})` : ''}`);
      }
    }
  }

  lines.push('\n=== MUSIC NEWS (use the index numbers in your headlines response) ===');
  let idx = 0;
  for (const { source, items } of webData) {
    lines.push(`\n[${source}]`);
    for (const item of items.slice(0, 8)) {
      const desc = item.description ? ` — ${item.description.slice(0, 100)}` : '';
      lines.push(`  [${idx}] "${item.title}"${desc}`);
      idx++;
    }
  }

  return lines.join('\n');
}

async function processWithClaude(date, redditData, webData, tiktokData = [], playlistData = [], scoredData = null) {
  if (!config.CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY not set in .env');
  }

  const client = new Anthropic({ apiKey: config.CLAUDE_API_KEY });
  const rawContent = buildPrompt(date, redditData, webData, tiktokData, playlistData, scoredData);

  const systemPrompt = `You are a music industry analyst creating a daily briefing. Your job is to surface what is genuinely generating buzz today, stated plainly.

Rules:
- Focus on mainstream genres: hip-hop, pop, R&B, indie, electronic, rock, alt
- Ignore jazz, classical, ambient, experimental, niche genres
- When SIGNAL SCORES are provided: the tiers (BREAKING / RISING) are pre-computed from hard data — you MUST preserve them and MUST NOT reassign an artist to a different tier
- Write narrative that reflects the signal breakdown — cite the specific evidence (charts, publications, Reddit numbers, velocity %)
- Rising tier is the main story; breaking provides chart context
- Weight cross-source mentions heavily — an artist in 3+ sources = high signal
- Weight Reddit engagement: high upvotes + comments = real buzz
- Only include artists/songs with genuine multi-source signal OR exceptional single-source signal
- Be variable in count — surface exactly as many as the data actually supports, no filler
- Songs list: only songs you're confident exist as actual tracks (mentioned by title in sources)
- For each song, populate "sources" with the exact source names (e.g. "r/indieheads", "Pitchfork") that mentioned it
- For headline_indices: return the index numbers (e.g. [0, 3, 7]) of the 6-10 most newsworthy articles from the music news section

Writing style for the summary:
- Direct and factual — state what is happening, not how exciting it is
- No flowery language, superlatives, or hype ("electrifying", "dominating", "explosive", etc.)
- Cite specifics: names, numbers, release titles, platform data where available
- 5-8 bullet points, each covering a distinct story or trend
- Each bullet on its own line, separated by \n — never run them together in one block
- One artist or story per bullet — if two artists are mentioned, use two bullets

Respond with valid JSON only, no markdown, no explanation:
{
  "summary": "5-8 bullets, one per line separated by \\n. Each starts with '• '. One story per bullet. Example: '• Kendrick Lamar topped Apple Charts this week.\\n• Megan Thee Stallion released a surprise EP on Friday.'",
  "artists": [
    {"name": "string", "tier": "breaking|rising", "reason": "1-2 sentences: what specifically is driving attention, cite sources/numbers"}
  ],
  "songs": [
    {"title": "string", "artist": "string", "tier": "breaking|rising", "reason": "why this track is getting attention", "sources": ["source name 1", "source name 2"]}
  ],
  "headline_indices": [0, 4, 7]
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: rawContent }],
  });

  if (response.stop_reason === 'max_tokens') {
    console.error('[claude] Response was truncated — output hit token limit');
  }

  const text = response.content[0].text.trim();
  console.log('[claude] Response length:', text.length, 'chars, stop_reason:', response.stop_reason);

  // Extract JSON — handle code fences, leading/trailing text
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[claude] No JSON object found in response:', text.slice(0, 300));
    throw new Error('Claude returned no JSON object');
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.error('[claude] Failed to parse JSON response:', text.slice(0, 300));
    throw new Error('Claude returned invalid JSON');
  }
}

module.exports = { processWithClaude };
