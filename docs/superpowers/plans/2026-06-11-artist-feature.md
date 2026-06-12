# Artist of the Day Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a real daily feature (article + linked coverage + signal evidence + listen section) for the hero artist inside the existing digest Claude call, and render it on `ArtistScreen`.

**Architecture:** Extend the `submit_digest` tool schema with a `feature` object (title, body, related headline indices). A new `processor/feature.js` resolves indices to URLs (reusing the digest's `webIndex`) and attaches scorer evidence, storing everything on the artist object inside the existing `digests.artists` JSON column — no migration. The UI branches on `artist.feature`.

**Tech Stack:** Node (CommonJS pipeline), React (Vite, JSX), plain-`assert` node test scripts. **No local production builds (hook-enforced).** Spec: `docs/superpowers/specs/2026-06-11-artist-feature-design.md`.

---

### Task 1: Feature resolution module (TDD)

**Files:**
- Create: `processor/feature.js`
- Test: `test/feature-attach.test.js`

- [ ] **Step 1: Write the failing test**

`test/feature-attach.test.js` (project convention: plain node script, `assert`, stubs, exit non-zero on failure):

```js
const assert = require('assert');
const { attachFeature, buildEvidence } = require('../processor/feature');
const { normalizeArtist } = require('../processor/scorer');

function scorerEntry(name) {
  return {
    entity: {
      name,
      editorialArticles: [
        { source: 'Pitchfork', title: 'A review', published: '2026-06-10' },
        { source: 'Stereogum', title: 'News item', published: '2026-06-11' },
        { source: 'Pitchfork', title: 'Another piece', published: '2026-06-11' },
      ],
      redditPosts: [
        { source: 'r/indieheads', title: 'thread', score: 4200, comments: 310 },
        { source: 'r/Music', title: 'thread2', score: 90, comments: 12 },
      ],
      chartPositions: { shazam: 4 },
    },
  };
}

const webIndex = [
  { source: 'Pitchfork', title: 'A review', url: 'https://p4k.example/a', published: '2026-06-10' },
  { source: 'Stereogum', title: 'News item', url: 'https://gum.example/b', published: '2026-06-11' },
];

function makeResult(featureArtist) {
  return {
    artists: [
      { name: 'Mk.gee', tier: 'rising', reason: 'r1' },
      { name: 'Drake', tier: 'breaking', reason: 'r2' },
    ],
    feature: {
      artist: featureArtist,
      title: 'The story in one line',
      body: 'Para one.\\n\\nPara two.',
      related_headline_indices: [0, 1, 99],
    },
  };
}

try {
  // 1 — coverage resolves by index, drops out-of-range, body \n is normalized
  let r = makeResult('Mk.gee');
  attachFeature(r, webIndex, { [normalizeArtist('Mk.gee')]: scorerEntry('Mk.gee') });
  const f = r.artists[0].feature;
  assert.ok(f, 'feature attached to artists[0]');
  assert.strictEqual(f.coverage.length, 2, 'out-of-range index dropped');
  assert.strictEqual(f.coverage[0].url, 'https://p4k.example/a');
  assert.strictEqual(f.body, 'Para one.\n\nPara two.', 'literal \\n normalized');
  assert.strictEqual(r.feature, undefined, 'raw feature blob removed from result');

  // 2 — evidence assembled from scorer entity
  assert.deepStrictEqual(f.evidence.sources, ['Pitchfork', 'Stereogum']);
  assert.strictEqual(f.evidence.reddit.posts, 2);
  assert.strictEqual(f.evidence.reddit.topUps, 4200);
  assert.strictEqual(f.evidence.reddit.topComments, 310);
  // 2 editorial sources + 2 reddit subs + 1 (charted)
  assert.strictEqual(f.evidence.mention_count, 5);
  assert.strictEqual(r.artists[0].mention_count, 5, 'mention_count set on artist');

  // 3 — name mismatch falls back to artists[0]
  r = makeResult('Someone Else');
  attachFeature(r, webIndex, {});
  assert.ok(r.artists[0].feature, 'fallback to artists[0]');
  assert.strictEqual(r.artists[0].feature.evidence, null, 'no scorer entry -> null evidence');

  // 4 — name match attaches to the matching artist, not [0]
  r = makeResult('Drake');
  attachFeature(r, webIndex, {});
  assert.ok(!r.artists[0].feature && r.artists[1].feature, 'attached to named artist');

  // 5 — missing/empty feature or artists is a no-op
  r = { artists: [{ name: 'A' }] };
  attachFeature(r, webIndex, {});
  assert.ok(!r.artists[0].feature);
  r = { artists: [], feature: { artist: 'A', title: 't', body: 'b', related_headline_indices: [] } };
  attachFeature(r, webIndex, {});
  assert.strictEqual(r.feature, undefined);

  // 6 — buildEvidence handles missing entry
  assert.strictEqual(buildEvidence(undefined), null);

  console.log('feature-attach: all tests passed');
} catch (err) {
  console.error('feature-attach: FAIL —', err.message);
  process.exit(1);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/feature-attach.test.js`
Expected: FAIL — `Cannot find module '../processor/feature'`

- [ ] **Step 3: Write the implementation**

`processor/feature.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/feature-attach.test.js`
Expected: `feature-attach: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add processor/feature.js test/feature-attach.test.js
git commit -m "feat(digest): Add feature resolution module for artist of the day"
```

---

### Task 2: Digest call — schema + prompt

**Files:**
- Modify: `processor/claude.js` (~L119 rules list, ~L138 schema)

- [ ] **Step 1: Add the prompt rule**

After the `headline_indices` bullet (`- For headline_indices: ...`), add:

```
- For feature: write the daily mini-feature on the FIRST artist in your artists list. title = the story in one line (not just the artist's name). body = 3-5 short paragraphs separated by \\n\\n covering what happened, why attention is rising now, and the concrete evidence (sources, numbers, releases) — same factual, no-hype style as the summary. related_headline_indices = index numbers of the 2-5 news articles most relevant to that artist ([] if none are about them)
```

- [ ] **Step 2: Add `feature` to the tool schema**

In `digestTool.input_schema`: change `required` to
`['summary', 'artists', 'songs', 'headline_indices', 'mentioned_artists', 'feature']`
and add after `mentioned_artists`:

```js
        feature: {
          type: 'object',
          required: ['artist', 'title', 'body', 'related_headline_indices'],
          description: "Daily mini-feature on the first artist in 'artists'.",
          properties: {
            artist: { type: 'string', description: "Exactly the name of the first artist in 'artists'" },
            title:  { type: 'string', description: "Editorial headline — the story in one line, not just the artist's name" },
            body:   { type: 'string', description: '3-5 short paragraphs separated by \\n\\n. Factual, no hype, cite sources and numbers.' },
            related_headline_indices: {
              type: 'array',
              items: { type: 'integer' },
              description: 'index numbers (music news section) of the 2-5 articles most relevant to this artist; [] if none',
            },
          },
        },
```

- [ ] **Step 3: Syntax check**

Run: `node --check processor/claude.js`
Expected: no output (exit 0)

- [ ] **Step 4: Commit**

```bash
git add processor/claude.js
git commit -m "feat(digest): Ask Claude for a daily artist feature in the digest call"
```

---

### Task 3: Pipeline integration + brief newline fix

**Files:**
- Modify: `processor/digest.js` (require at ~L13, after Claude call ~L141, after artists merge ~L170)

- [ ] **Step 1: Require the module**

Next to the scorer require:

```js
const { attachFeature } = require('./feature');
```

- [ ] **Step 2: Normalize summary newlines (bug fix)**

Immediately after `const result = await processWithClaude(...)`:

```js
  // Claude occasionally writes the \n bullet separators as literal
  // backslash-n text — normalize so splitting works and the DB stores real
  // newlines (seen in the 2026-06-11 digest: the whole brief rendered as one
  // bullet).
  if (typeof result.summary === 'string') result.summary = result.summary.replace(/\\n/g, '\n');
```

- [ ] **Step 3: Attach the feature**

Immediately after the scorer-merge block (`result.artists = (result.artists || []).map(...)`):

```js
  // Resolve the feature: coverage URLs from prompt indices, evidence from the
  // scorer's raw material. Lands on the artist object inside the existing
  // artists JSON column — no migration.
  attachFeature(result, webIndex, scorerIndex);
```

- [ ] **Step 4: Syntax check + full test run**

Run: `node --check processor/digest.js && for t in test/*.test.js; do node "$t" || exit 1; done`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add processor/digest.js
git commit -m "feat(digest): Resolve and persist the artist feature; fix literal \\n in brief"
```

---

### Task 4: Adapter (`src/main.jsx`)

**Files:**
- Modify: `src/main.jsx` (hero block ~L71-91, brief block ~L92)

- [ ] **Step 1: Hero teases the feature; real evidence stats**

In the `hero:` object: `sub` becomes

```js
      sub:
        heroArtist.feature?.title ||
        heroArtist.long_summary ||
        heroArtist.reason ||
        '',
```

Replace the `listens:` field (dead `streams`-based) with:

```js
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
```

- [ ] **Step 2: Brief newline fix for already-saved digests**

The 2026-06-11 digest is stored with literal `\n`. In the `brief:` adapter, change the source string:

```js
    brief: (digest.summary || digest.brief || '').replace(/\\n/g, '\n')
```

(rest of the chain unchanged).

- [ ] **Step 3: Syntax check** — esbuild transform (no build):

```bash
node -e "const{transformSync}=require('esbuild');const fs=require('fs');transformSync(fs.readFileSync('src/main.jsx','utf8'),{loader:'jsx'});console.log('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx
git commit -m "feat(ui): Hero teases the feature title; real evidence stats; brief \\n fallback"
```

---

### Task 5: Screens (`src/screens.jsx`)

**Files:**
- Modify: `src/screens.jsx` (hero button ~L68-73, hero-meta-row ~L83-88, `ArtistScreen` ~L1126-1200)

- [ ] **Step 1: Honest hero button**

```jsx
              {artists[0] && (
                <button className="btn-play" onClick={() => onArtistClick(artists[0])}>
                  {artists[0].feature ? 'Read feature →' : 'View artist →'}
                </button>
              )}
```

- [ ] **Step 2: Hero meta row reads `signal`**

```jsx
        {hero?.signal && (
          <div className="hero-meta-row">
            <div className="hero-stat"><b>{hero.signal}</b></div>
            <div className="hero-stat">{hero.rank}</div>
          </div>
        )}
```

- [ ] **Step 3: `ArtistScreen` feature layout**

Replace the body of `ArtistScreen` below `detail-actions` (keep detail-hero and back button as-is). Full component body:

```jsx
export function ArtistScreen({ artist, data, onBack }) {
  if (!artist) return null;
  const bg = artist.bg || 'linear-gradient(160deg, #1a2a1f, #08090a 70%)';
  const artistSongs = (data?.songs || []).filter(s => s.artist === artist.name);
  const feature = artist.feature;
  const evidence = feature?.evidence;
  const subScores = [
    ['Chart', artist.chart_score],
    ['Editorial', artist.editorial_score],
    ['Community', artist.community_score],
    ['Velocity', artist.velocity_score],
  ].filter(([, v]) => typeof v === 'number' && v > 0);

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
        {feature ? (
          <div className="feature">
            <div className="section-eyebrow" style={{ marginBottom: 12 }}>Today's feature</div>
            <h2 className="feature-title">{feature.title}</h2>
            <div className="feature-body">
              {feature.body.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </div>
        ) : artist.reason && (
          <div style={{ marginBottom: 32 }}>
            <div className="section-eyebrow" style={{ marginBottom: 12 }}>Why they're featured</div>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', maxWidth: 640 }}>{artist.reason}</p>
          </div>
        )}

        {feature?.coverage?.length > 0 && (
          <>
            <div className="section-head" style={{ marginTop: 40 }}>
              <div>
                <div className="section-eyebrow">From the sources</div>
                <h2 className="section-title sans">Coverage</h2>
              </div>
            </div>
            <div className="headlines">
              {feature.coverage.map((h, i) => (
                <a
                  key={i}
                  className="headline"
                  href={h.url || `https://www.google.com/search?q=${encodeURIComponent(h.title)}`}
                  target="_blank"
                  rel="noopener"
                >
                  <div className="src-line">
                    <span className="src-dot" />
                    <span>{h.source}</span>
                  </div>
                  <div className="headline-title">{h.title}</div>
                </a>
              ))}
            </div>
          </>
        )}

        {(subScores.length > 0 || evidence) && (
          <>
            <div className="section-head" style={{ marginTop: 40 }}>
              <div>
                <div className="section-eyebrow">Why it ranks</div>
                <h2 className="section-title sans">The signal</h2>
              </div>
            </div>
            <div className="signal-block">
              {subScores.length > 0 && (
                <div className="signal-scores">
                  {subScores.map(([label, v]) => (
                    <React.Fragment key={label}>
                      <div className="signal-score-label">{label}</div>
                      <div className="signal-score-bar">
                        <i style={{ width: `${Math.round(Math.min(1, v) * 100)}%` }} />
                      </div>
                      <div className="signal-score-val">{Math.round(Math.min(1, v) * 100)}</div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {evidence && (
                <div className="signal-facts">
                  {evidence.sources?.length > 0 && (
                    <div className="signal-fact">
                      <span className="signal-fact-label">Covered by</span>
                      {evidence.sources.join(', ')}
                    </div>
                  )}
                  {evidence.reddit && (
                    <div className="signal-fact">
                      <span className="signal-fact-label">Reddit</span>
                      {evidence.reddit.posts} post{evidence.reddit.posts === 1 ? '' : 's'} · top {evidence.reddit.topUps}↑ {evidence.reddit.topComments}💬
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="section-head" style={{ marginTop: 40 }}>
          <div>
            <div className="section-eyebrow">{artistSongs.length > 0 ? 'Songs in this issue' : 'On Spotify'}</div>
            <h2 className="section-title sans">Listen</h2>
          </div>
          <button
            className="section-action"
            onClick={() => window.open(`https://open.spotify.com/search/${encodeURIComponent(artist.name)}/artists`, '_blank')}
          >
            Open artist on Spotify →
          </button>
        </div>
        {artistSongs.length > 0 && (
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
                <div className="meta-cell"><SignalBadge signals={s.sig} /></div>
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
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Syntax check** (esbuild transform, as Task 4 Step 3, on `src/screens.jsx`)

- [ ] **Step 5: Commit**

```bash
git add src/screens.jsx
git commit -m "feat(ui): Render the artist feature — article, coverage, signal, listen"
```

---

### Task 6: Styles (`src/styles.css`)

**Files:**
- Modify: `src/styles.css` (append after the §7 RUN DIGEST block at EOF)

- [ ] **Step 1: Append the feature styles**

```css


/* ── 8 · ARTIST FEATURE — daily mini-article on ArtistScreen ─────────────────
   Pairs with the feature branch of ArtistScreen (screens.jsx). Editorial
   serif title, readable body, and a quiet "signal" stat block built from the
   scorer's persisted sub-scores + evidence. */

.feature-title {
  font-family: var(--f-serif);
  font-size: 34px;
  line-height: 1.15;
  letter-spacing: -0.01em;
  max-width: 680px;
  margin: 0 0 18px;
}
.feature-body { max-width: 640px; }
.feature-body p {
  font-size: 16px;
  line-height: 1.75;
  color: var(--text-2);
  margin: 0 0 18px;
}

.signal-block {
  display: flex;
  gap: 48px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.signal-scores {
  display: grid;
  grid-template-columns: auto 160px auto;
  gap: 10px 14px;
  align-items: center;
}
.signal-score-label {
  font-family: var(--f-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.signal-score-bar {
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.07);
  overflow: hidden;
}
.signal-score-bar i {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
}
.signal-score-val {
  font-family: var(--f-mono);
  font-size: 11px;
  color: var(--text-2);
}
.signal-facts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 380px;
}
.signal-fact {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.signal-fact-label {
  font-family: var(--f-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat(ui): Styles for the artist feature and signal block"
```

---

### Task 7: Changelog + verification

**Files:**
- Modify: `CHANGELOG.md` (Unreleased)

- [ ] **Step 1: Changelog entries** — under `## [Unreleased]`, an `### Added` for the feature and `### Fixed` for the literal-`\n` brief bug.

- [ ] **Step 2: Full verification (no build)**

```bash
for t in test/*.test.js; do node "$t" || exit 1; done
node --check processor/feature.js && node --check processor/claude.js && node --check processor/digest.js
node -e "const{transformSync}=require('esbuild');const fs=require('fs');for(const f of['src/main.jsx','src/screens.jsx']){transformSync(fs.readFileSync(f,'utf8'),{loader:'jsx'});console.log(f,'OK')}"
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: Changelog for artist feature + brief newline fix"
```

**Manual verification (Dan):** run a digest, confirm the hero shows the feature title + evidence stats, "Read feature →" opens the article with coverage/signal/listen, an old digest still renders, and the brief shows separate bullets again. Production build is run manually by Dan only.
