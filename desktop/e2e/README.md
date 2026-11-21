# Desktop E2E (Playwright + Electron)

Playwright’s `_electron.launch` starts our app, drives the real window, and
keeps **screenshots + video** per test. The interactive CDP `npm run bridge`
tool stays for live agent control; this suite is for repeatable validation.

## Commands

```bash
cd desktop
npm run build:ui           # Vite → renderer/dist (also runs before e2e/start)
npm run test:e2e           # headless-ish Electron run (still opens a window)
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:report    # open last HTML report
```

Artifacts land in `e2e/artifacts/`:

- `test-output/**/video.webm` — recording of each test
- `test-output/**/shots/*.png` — explicit checkpoints we attach
- `test-output/**/test-failed-*.png` — auto screenshots on failure
- `report/index.html` — HTML report with attachments

## Setup

Video recording needs Playwright’s ffmpeg (also installed via `npm` `postinstall`):

```bash
npx playwright install ffmpeg
```

Without it, `electron.launch({ recordVideo })` returns a blank window and hangs.

## Notes

- Workers are forced to `1` (one Electron app at a time).
- E2E uses CDP ports `9400+` and an isolated `--user-data-dir`, so a manual
  `npm start` on `:9333` can stay open.
- Config `use.video` does **not** apply to Electron — recording is wired in
  `helpers/electron.mjs` via `launch({ recordVideo })`, then attached on close.
- The “Connect & start” tests need `cli/.venv` / `vibe-app-server` working and
  whatever auth the CLI already uses on this machine.
