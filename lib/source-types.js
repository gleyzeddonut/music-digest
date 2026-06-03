'use strict';

// Single source of truth for source-type categorization.
// Custom: the user supplies a URL and can add/edit/delete.
// Built-in: fixed system feeds (charts/APIs) — toggle-only, no add/delete.
const CUSTOM_TYPES  = ['reddit', 'rss', 'html', 'spotify-playlist', 'youtube'];
const BUILTIN_TYPES = ['apple-charts', 'lastfm', 'genius', 'shazam', 'spotify-global', 'hypem', 'tiktok', 'tokchart'];

module.exports = { CUSTOM_TYPES, BUILTIN_TYPES };
