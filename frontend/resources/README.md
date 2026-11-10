# App icon & splash sources

These SVGs are inputs for `@capacitor/assets`. Native icon/splash assets are
generated on the HOST (macOS with Xcode + Android SDK), not in Docker.

## Regenerate native assets (run on host, from `frontend/`)

Use the full package name so `npx` resolves it even when it is not in the host
`node_modules` (it lives in the Docker volume):

    npx @capacitor/assets@3 generate \
      --iconBackgroundColor '#006FFD' --iconBackgroundColorDark '#006FFD' \
      --splashBackgroundColor '#f4f5f7' --splashBackgroundColorDark '#0f1115'

This generates: iOS AppIcon + Splash imageset (incl. `-dark`), Android mipmaps +
`drawable-*` / `drawable-night-*` splash (theme-adaptive first frame), and a PWA
icon set.

### Clean up the tool's PWA output (IMPORTANT)

`@capacitor/assets` also writes `frontend/icons/*.webp` and
`frontend/public/manifest.webmanifest`. This project's PWA is driven by
`vite-plugin-pwa` (see `vite.config.ts`, icons in `public/icons/*.png`), so those
two artifacts are unused and conflict with the real manifest. Delete them:

    rm -rf frontend/icons frontend/public/manifest.webmanifest

Then confirm the web build still works: `make fe-build`.

## Sync into native projects

    npx cap sync ios
    npx cap sync android

## Verify (host)

- iOS: open in Xcode, run on simulator in Light AND Dark → launch splash
  background matches theme; AppIcon correct.
- Android: run on emulator Light AND Dark → splash + adaptive icon correct.

## Sources

- `icon.svg`        — app icon (blue #006FFD bg + cream arrow), 1024×1024
- `splash.svg`      — light splash (surface #f4f5f7, centered mark), 2732×2732
- `splash-dark.svg` — dark splash (surface #0f1115, centered mark), 2732×2732

> Verified against `@capacitor/assets@3.0.5`: the flags above and the
> `npx @capacitor/assets@3 generate` invocation work as written. Note: these
> `--*BackgroundColor*` flags are NOT listed by `generate --help` (the CLI help
> only shows `--help`/`--version`), but they are valid and take effect — don't be
> misled by the sparse help output.

> Keep in sync: the surface hex literals in the splash SVGs (`#f4f5f7`, `#0f1115`)
> and in `capacitor.config.ts` must match `src/shared/lib/theme/surface.ts` — a
> palette change touches all of these.
