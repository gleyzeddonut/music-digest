# Music Digest — Welcome Page Install Guide

Drop-in welcome screen for the first-run empty state. Editorial-style hero with a curving dashed arrow that points up at the **Run digest** button in the topbar, teaching the user where to click to start.

**Visual reference:** what this looks like → see the [`Music Digest.html`](../Music%20Digest.html) prototype in this project, then toggle the **"First-run welcome"** switch in the Tweaks panel.

---

## Files in this folder

| File | Purpose |
|---|---|
| `WelcomeScreen.jsx` | The React component. Drop into `src/` or inline into `src/screens.jsx`. |
| `welcome.css` | CSS to append to the end of `src/styles.css`. |
| `INSTALL.md` | This file. |

---

## Step 1 — Add the CSS

Append the entire contents of `welcome.css` to the end of `Music Digest/src/styles.css`. No surgery needed — all selectors are namespaced `.welcome-*`.

The CSS uses these custom properties (already defined in your stylesheet):

```
--bg, --text, --text-2, --muted, --line-soft
--accent, --accent-dim, --accent-glow
--f-serif, --f-mono, --content-pad
```

Every reference has a hardcoded fallback, so it'll render even if a token is missing.

If `@keyframes pulse` is not already in your stylesheet, uncomment the block in `welcome.css` (it's clearly marked).

---

## Step 2 — Add the component

**Option A (recommended) — drop in as separate file:**

1. Copy `WelcomeScreen.jsx` to `Music Digest/src/WelcomeScreen.jsx`.
2. Import it in `src/main.jsx`:

   ```js
   import { WelcomeScreen } from './WelcomeScreen.jsx';
   ```

**Option B — inline into screens.jsx:**

1. Open `Music Digest/src/screens.jsx`.
2. Copy the `WelcomeScreen` function (lines starting with `export function WelcomeScreen()`) from `WelcomeScreen.jsx` into this file (anywhere near the other screen components).
3. The `export` keyword on the function is sufficient — no `export { ... }` list edits needed.

---

## Step 3 — Wire it up in main.jsx

Currently `src/main.jsx` has this fallback for when there's no digest yet (around line 395):

```jsx
case 'digest':
default:
  screen = data ? (
    <DigestScreen ... />
  ) : (
    <div className="empty-state">
      <p>No digest yet.</p>
      <button className="btn btn-primary" onClick={() => handleRun(true)}>
        Run First Digest
      </button>
    </div>
  );
  break;
```

**Replace the entire `: (` … `)` else branch with `<WelcomeScreen />`:**

```jsx
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
```

That's it. When `data` is null (no digest yet), the welcome page renders instead of the bare `empty-state` div. The topbar's existing Run digest button is what the arrow points to — no new buttons needed.

---

## Step 4 — Verify

1. From `Music Digest/`:
   ```bash
   npm run dev
   ```
2. The welcome screen should appear automatically if you have no digests in the DB.
3. To force-show it during development (even with existing data), temporarily change the conditional in step 3:
   ```jsx
   screen = false ? <DigestScreen ... /> : <WelcomeScreen />;
   ```
   Revert when done.

### What to check visually

- [ ] Big italic "Run your **first** digest" headline left-aligned with editorial weight
- [ ] Dashed green arrow curves up from the lower-left of the welcome content area
- [ ] Arrow tip points **straight up** toward the topbar (specifically in the direction of the Run digest button)
- [ ] Arrow draws itself in over ~1.4 seconds on first render, then gently pulses
- [ ] Eyebrow chip "Setup complete · Issue 00 awaiting" sits above the headline
- [ ] 3-step explainer row (Scan / Brief / Playlist) at the bottom, divided by vertical hairlines
- [ ] Sidebar + topbar remain fully visible and interactive throughout

### What the user does

Clicking the **Run digest** button in the topbar triggers `handleRun(true)` (already wired). After the run completes, `loadData()` repopulates `data`, and the next render swaps WelcomeScreen → DigestScreen automatically. No extra logic needed.

---

## Notes for Electron specifically

Nothing special. The welcome screen is pure HTML/CSS/React — no Electron APIs, no `window.require`, no IPC. It renders identically in dev (Vite on `:5173`) and in the packaged app (loaded from `file://`).

The SVG arrow is inline (no external assets to bundle). The animations are pure CSS keyframes (no JS animation libraries).

---

## Customization

| To change | Edit |
|---|---|
| Headline text | `WelcomeScreen.jsx` → `<h1 className="welcome-title">` |
| Arrow target direction | `welcome.css` → `.welcome-arrow { right: 130px }` (lower = more right) |
| Arrow curve shape | `WelcomeScreen.jsx` → the `d="..."` attribute on `<path>` |
| Arrow color | `welcome.css` uses `var(--accent)` — change globally or override locally |
| 3-step copy | `WelcomeScreen.jsx` → the three `<div className="welcome-step">` blocks |
| Schedule time | `WelcomeScreen.jsx` → the `welcome-or` line (or wire it to your real settings via prop) |

If you want the schedule time to reflect the user's actual settings:

```jsx
// In WelcomeScreen.jsx, accept a prop:
export function WelcomeScreen({ scheduledTime = '06:00 EST' }) {
  return (
    ...
    <div className="welcome-or">
      Or wait for tomorrow's scheduled run at {scheduledTime}.
    </div>
    ...
  );
}

// In main.jsx, pass it:
<WelcomeScreen scheduledTime={rawStatus?.scheduleTime || '06:00 EST'} />
```
