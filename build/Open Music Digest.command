#!/bin/bash
APP="/Applications/Music Digest.app"

if [ ! -d "$APP" ]; then
  osascript -e 'display dialog "Please drag Music Digest to your Applications folder first, then double-click this script." buttons {"OK"} default button "OK" with title "Music Digest"'
  exit 0
fi

# Remove macOS quarantine flag so the app can open without the security warning
xattr -cr "$APP"
open "$APP"
