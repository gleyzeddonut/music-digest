# Install the menubar icon

## Files

In the `final/` folder:

- **`menuitemTemplate.png`** (22×22) — @1x version
- **`menuitemTemplate-2x.png`** (44×44) — @2x retina version
- `preview.png` — 308×308 reference, not for install

## Install steps

1. Drop `menuitemTemplate.png` into `Music Digest/visuals/`, overwriting the existing file.
2. Drop `menuitemTemplate-2x.png` into `Music Digest/visuals/`, then **rename it on disk** to:
   ```
   menuitemTemplate@2x.png
   ```
   (the literal `@2x` suffix — macOS uses this to select retina art automatically. The project filesystem here doesn't allow `@` in filenames, which is why the file ships as `-2x` and needs the rename.)
3. Restart your Electron app. The tray icon should swap immediately.

## Why "Template" matters

macOS requires menubar icons to be pure black + alpha. The OS handles inverting them automatically for dark menubar (Catalina+) and light menubar. Don't try to ship a colored or pre-inverted version — it'll look wrong in one of the two modes.

The `Template` suffix in the filename tells Electron / NSImage to treat the image as a template (black-mask) image. Keep the filename exactly `menuitemTemplate.png` and `menuitemTemplate@2x.png`.
</thinking>
