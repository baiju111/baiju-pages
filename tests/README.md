# Browser tests

These scripts use the installed Chrome (Headless) over CDP; they do not require Playwright or npm packages.

Prerequisites:

1. Start the site from the project root:
   ```powershell
   python -m http.server 8765 --bind 127.0.0.1
   ```
2. Chrome must exist at `C:\Program Files\Google\Chrome\Application\chrome.exe`.
3. Run one test at a time. Each script creates a temporary Chrome profile under `tests/`; delete the profile folders after the run.

```powershell
node tests/browser_test.mjs      # layout, pause/replay, mouse/touch, reduced motion, egg, stage-click replay
node tests/resilience_test.mjs   # phases, blocked image/data/scripts, works fallback
node tests/keyboard_test.mjs     # Space on the artwork and Enter/Esc on the egg
node tests/carousel_test.mjs     # auto-rotate, hover pause, drag/snap, flip, keyboard, props, responsive
```

`browser_test.mjs` and `carousel_test.mjs` write review screenshots to `.impeccable/review/`.

The revised hero no longer has a visible control strip. Pause/resume is tested through `Space` in `keyboard_test.mjs` and through the engine API in `browser_test.mjs`; replay is tested through the artwork click.
