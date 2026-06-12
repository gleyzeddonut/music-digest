// Resolves the digest's `feature` blob (written by Claude about the day's #1
// artist) into UI-ready data and attaches it to the matching artist:
//   artist.feature = { title, body, coverage, evidence }
// plus a real artist.mention_count. Coverage URLs come from prompt indices
// (same mechanism as headlines), evidence from the scorer's matched raw
// material — every number the UI shows is real.
const { normalizeArtist } = require('./scorer');

function buildEvidence(scorerEntry) {
  const e = scorerEntry?.entity;
  if (!e) return null;
  const sources = [...new Set((e.editorialArticles || []).map(a => a.source))];
  const redditSubs = [...new Set((e.redditPosts || []).map(p => p.source))];
  const charted = Object.values(e.chartPositions || {}).some(Boolean);
  const topPost = [...(e.redditPosts || [])].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  return {
    sources,
    reddit: topPost
      ? { posts: e.redditPosts.length, topUps: topPost.score || 0, topComments: topPost.comments || 0 }
      : null,
    mention_count: sources.length + redditSubs.length + (charted ? 1 : 0),
  };
}

function attachFeature(result, webIndex, scorerIndex) {
  const raw = result.feature;
  delete result.feature; // never persist the unresolved blob
  if (!raw || !raw.title || !raw.body || !(result.artists || []).length) return result;

  const coverage = (raw.related_headline_indices || [])
    .map(i => webIndex[i])
    .filter(Boolean)
    .map(item => ({
      source: item.source,
      title: item.title,
      url: item.url || null,
      published: item.published || null,
    }));

  const wanted = normalizeArtist(raw.artist || '');
  let target = result.artists.find(a => normalizeArtist(a.name) === wanted);
  if (!target) {
    console.warn(`[feature] Artist "${raw.artist}" not in artists list — attaching to "${result.artists[0].name}"`);
    target = result.artists[0];
  }

  const evidence = buildEvidence(scorerIndex[normalizeArtist(target.name)]);
  target.feature = {
    title: raw.title,
    // Claude occasionally writes \n separators as literal backslash-n text
    body: raw.body.replace(/\\n/g, '\n'),
    coverage,
    evidence,
  };
  if (evidence?.mention_count) target.mention_count = evidence.mention_count;
  return result;
}

module.exports = { attachFeature, buildEvidence };
