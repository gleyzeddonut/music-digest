# Personas — Requirements

**Date:** 2026-05-27  
**Status:** Draft  
**Type:** Feature

---

## Problem

Switching focus between music worlds (indie, hyperpop, no-mainstream, all sources) requires manually toggling individual sources every time. There's no way to save a named source configuration and run a targeted brief without re-configuring from scratch.

---

## Solution

Personas are **profiles**. Each one owns a named set of sources, its own digest history, and its own Spotify playlist. Switching persona shifts the entire app context — like Safari profiles — so Today, History, This Month, and Playlist all reflect that persona's world. "All Sources" is the built-in default persona and always includes every source.

---

## Core Behavior

### Personas

- A persona has a **name**, a **source list** (a subset of the global source pool), and a **Spotify playlist** (created on first digest run).
- **"All Sources"** is a built-in, undeletable persona that automatically includes every source in the pool. It is the default on first launch.
- Users can create any number of additional personas. Examples: "Indie World", "Hyperpop", "No Mainstream".
- The **active persona** is persisted across app restarts (stored in settings).

### Switching Personas

- A **persona switcher** lives at the top of the sidebar (or as a top-level tab bar) — always visible.
- Clicking a persona immediately shifts the app context:
  - **Today** → last digest run under that persona
  - **History** → digests run under that persona only
  - **This Month** → monthly recap for that persona
  - **Playlist** → that persona's Spotify playlist
  - **Sources** → sources that belong to that persona (with access to the global pool to add/remove)
- A **"+" button** in the switcher creates a new persona.

### Running a Digest

- Running a digest always uses the **active persona's source list**.
- Multiple digests on the same date are valid (one per persona).
- The resulting digest, songs, and artists are tagged to that persona.

### Source Management

- The **global source pool** is shared — sources can be added, removed, and tested regardless of which persona is active.
- The **Sources screen** shows sources in the active persona, with a way to see/add from the global pool.
- Adding a new source to the global pool does **not** auto-add it to custom personas; it is automatically included in "All Sources" only.
- Removing a source from the global pool removes it from all personas.

### Spotify Playlists

- Each persona gets its own Spotify playlist, named `{persona name} · Music Digest` by default (e.g., "Indie World · Music Digest"). The name can be customized.
- The playlist is created on the **first digest run** under that persona (same lazy-creation pattern as today).
- The global Spotify connection is shared — no separate OAuth per persona.

---

## What Stays Shared (Not Per-Persona)

- Spotify connection (OAuth)
- SMTP / email delivery settings
- Schedule settings (delivery time, frequency)
- App-level settings (version, login item, etc.)

---

## Deferred / Out of Scope

- **Per-persona schedules** — one schedule for all personas, uses the active persona at run time. Future consideration.
- **Persona-specific AI prompt tuning** — future consideration (e.g., "Indie" persona uses a different editorial voice).
- **Persona sharing / export** — out of scope.
- **Auto-switching based on time of day** — out of scope.

---

## Data Model Changes

### New: `personas` table

```sql
CREATE TABLE personas (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  source_ids   TEXT NOT NULL DEFAULT '[]',  -- JSON array of source IDs
  playlist_id  TEXT,                        -- Spotify playlist ID (null until first run)
  playlist_name TEXT,                       -- Display name for the playlist
  is_default   INTEGER NOT NULL DEFAULT 0, -- 1 = built-in All Sources
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Modified: `digests` table

- Add `persona_id INTEGER` (FK → personas.id, nullable for backward compat with existing rows)
- Change unique constraint from `UNIQUE(date)` → `UNIQUE(date, persona_id)` (or use a surrogate key with a unique index on the pair)

### Modified: `settings`

- Add `active_persona_id` key → the currently active persona's ID

### No change: `playlist_tracks`

- Already tagged by `digest_date`; persona is inferrable via the digest. No structural change needed for v1.

---

## UI Entry Points

1. **Persona switcher** — pills or tabs at the top of the sidebar. Shows persona name, "+" to add.
2. **Persona editor** — accessible from the switcher ("Manage" or via persona settings icon). Name + source checklist.
3. **Sources screen** — filtered to active persona, with a global toggle or section to see all sources.
4. **Settings screen** — persona section shows a list of personas; entry point to manage them.

---

## Success Criteria

- User can switch from "All Sources" to "Indie World" persona in one click.
- Running a digest under "Indie World" only scrapes indie-tagged sources and produces a digest tagged to that persona.
- History and This Month reflect only the active persona's digests.
- Each persona has its own Spotify playlist, created lazily on first run.
- "All Sources" always includes all sources and cannot be deleted.
- Existing digests (pre-persona) appear under "All Sources" only.

---

## Open Questions

- **Source membership UX in the editor**: checkboxes from a flat list, or drag-to-add? (Decide in planning.)
- **Persona switcher placement**: pills in the sidebar header vs. a horizontal tab bar above the content area. (Decide in planning / design.)
- **What happens to the old per-source `enabled` toggle?** Options: (a) remove it entirely — "in a persona = enabled", (b) keep as "archived/hidden from all personas". Recommend removing for simplicity since personas replace the concept.
