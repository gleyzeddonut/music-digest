'use strict';

// Union a persona's existing source IDs with the built-in source IDs,
// preserving order and de-duplicating. Pure — no DB access.
function mergeBuiltinIds(existing, builtinIds) {
  const out = Array.isArray(existing) ? [...existing] : [];
  const seen = new Set(out);
  for (const id of builtinIds) {
    if (!seen.has(id)) { out.push(id); seen.add(id); }
  }
  return out;
}

module.exports = { mergeBuiltinIds };
