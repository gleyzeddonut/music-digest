# Music Digest — App Icon Install Guide

The `Music_Digest.iconset/` folder contains all the PNG sizes macOS needs. Compile them into a single `.icns` file with one command (Mac-only — macOS ships `iconutil` by default).

## 1. Rename the @2x files

The project filesystem here doesn't allow `@` in filenames, so every retina variant ships as `-2x`. macOS requires the literal `@2x` suffix. **Rename these five files** before compiling (Finder → select → Enter → edit):

| Current | Rename to |
|---|---|
| `icon_16x16-2x.png` | `icon_16x16@2x.png` |
| `icon_32x32-2x.png` | `icon_32x32@2x.png` |
| `icon_128x128-2x.png` | `icon_128x128@2x.png` |
| `icon_256x256-2x.png` | `icon_256x256@2x.png` |
| `icon_512x512-2x.png` | `icon_512x512@2x.png` |

Or run this one-liner from the Terminal inside the `Music_Digest.iconset/` folder:

```bash
cd /path/to/Music_Digest.iconset
for f in *-2x.png; do mv "$f" "${f/-2x/@2x}"; done
```

Also: macOS expects the folder to actually be named `.iconset` — not just contain it. Rename the folder to:

```
Music Digest.iconset
```

(spaces ok; lowercase `.iconset` extension matters.)

## 2. Compile to .icns

From the parent folder containing `Music Digest.iconset`:

```bash
iconutil -c icns "Music Digest.iconset"
```

This produces `Music Digest.icns` right next to it. Done.

## 3. Install into your Electron app

Copy `Music Digest.icns` to:

```
Music Digest/assets/icon.icns
```

Overwrite the existing one. Your `electron/main.js` or `electron-builder.yml` should already point at `assets/icon.icns` — verify with:

```bash
grep -r icon.icns "Music Digest/"
```

If you also have a `package.json` build config:

```json
"build": {
  "mac": {
    "icon": "assets/icon.icns"
  }
}
```

That's it. Restart Electron, the Dock icon swaps immediately. For a packaged build (`electron-builder` or similar), rebuild the app to bake the new icon into the bundle.

## 4. For non-macOS deploys

`appicon-final/icon.png` is a bare 1024×1024 PNG you can use anywhere a single image is needed (e.g. Windows `.ico`, Linux `.desktop`, social media, App Store screenshots).

For Windows `.ico`, use ImageMagick:

```bash
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

## Files in this folder

- `Music_Digest.iconset/` — 10 PNGs at all macOS-required sizes (rename @2x files first)
- `icon.png` — 1024×1024 reference / for non-macOS use
- `install.md` — this file

## Optical adjustments at small sizes

The stroke weight is automatically bumped at smaller pixel sizes (1.8 → 3.4 source units across the size range) and the accent dot is enlarged at 16/32 sizes — without these, the wave would disappear at Dock-minimized scale. This is the same trick Apple uses with their own multi-resolution icon sets.
