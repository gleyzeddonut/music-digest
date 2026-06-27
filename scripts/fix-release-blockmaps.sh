#!/usr/bin/env bash
# Fix electron-builder 25 .blockmap asset names on a GitHub Release.
#
# electron-builder 25 uploads ZIP .blockmap assets with the product name's
# spaces turned into DOTS (e.g. "Music.Digest-1.7.12-mac.zip.blockmap") while
# the ZIP itself is hyphenated ("Music-Digest-1.7.12-mac.zip"). electron-updater
# requests "<zip-name>.blockmap", so the dotted name 404s and differential
# updates silently break. This renames each .blockmap asset so it matches its
# sibling (zip/dmg) asset name exactly. Safe to run repeatedly — it's a no-op
# once every blockmap already matches a sibling.
#
# Run this AFTER `npm run release`, alongside publishing the draft:
#   gh release edit v1.7.12 --draft=false
#   scripts/fix-release-blockmaps.sh
#
# Usage: scripts/fix-release-blockmaps.sh [tag]
#   tag defaults to "v<version from package.json>".
set -euo pipefail

REPO="gleyzeddonut/music-digest"
ROOT="$(git rev-parse --show-toplevel)"
TAG="${1:-v$(node -p "require('$ROOT/package.json').version")}"

echo "Checking blockmap assets on $REPO release ${TAG}..."

# Use the REST API (not `gh release view`) so we reliably get numeric asset ids.
assets_json="$(gh api "repos/$REPO/releases/tags/$TAG" -q '.assets')"
names="$(echo "$assets_json" | jq -r '.[].name')"

# Normalize for sibling matching: dots and hyphens are interchangeable in the
# product-name segment (and version dots normalize identically on both sides).
norm() { printf '%s' "$1" | tr '.' '-'; }

fixed=0
while IFS=$'\t' read -r id name; do
  [ -z "${id:-}" ] && continue
  base="${name%.blockmap}"

  # Already correct: a sibling asset is named exactly <base>.
  if printf '%s\n' "$names" | grep -Fxq "$base"; then
    continue
  fi

  # Find the sibling (non-blockmap) asset whose normalized name matches.
  target=""
  nbase="$(norm "$base")"
  while IFS= read -r cand; do
    [ "$cand" = "$name" ] && continue
    case "$cand" in *.blockmap) continue ;; esac
    if [ "$(norm "$cand")" = "$nbase" ]; then target="$cand.blockmap"; break; fi
  done <<< "$names"

  if [ -z "$target" ]; then
    echo "  ! no sibling asset found for '$name' — skipping" >&2
    continue
  fi

  echo "  renaming '$name' -> '$target'"
  gh api -X PATCH "repos/$REPO/releases/assets/$id" -f name="$target" >/dev/null
  fixed=$((fixed + 1))
done <<< "$(echo "$assets_json" | jq -r '.[] | select(.name|endswith(".blockmap")) | "\(.id)\t\(.name)"')"

if [ "$fixed" -eq 0 ]; then
  echo "All blockmap names already correct — nothing to do."
else
  echo "Renamed $fixed asset(s). Differential updates should resolve now."
fi
