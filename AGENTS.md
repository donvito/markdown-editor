# AGENTS.md

## Cursor Cloud specific instructions

### What this is
A single-product repo: an **Electron desktop Markdown editor** (`markdown-editor`). Plain JavaScript (no TypeScript, no transpile/build step for source). Entry point is `main.js` (Electron main process), with `preload.js` and the renderer (`index.html`, `renderer.js`, `styles.css`). An optional bundled AI plugin lives in `plugins/ai-editor/`.

### Running the app (dev)
- Standard run command is `npm start` (= `electron .`), documented in `README.md`. There is no dev server, hot reload, or watch task — `npm start` directly opens the desktop window.
- This is a GUI desktop app on a headless VM. The interactable desktop is the TigerVNC display `:1` (what computer-use/manual testing sees). Launch with `DISPLAY=:1 npm start` so the window appears on that display; plain `npm start` inherits `:1` already, but set it explicitly when launching from contexts where `DISPLAY` is unset. Using `xvfb-run` instead creates an invisible display the computer-use subagent cannot see.
- Launch it in a persistent tmux session (it's a foreground GUI process), then interact via the computer-use subagent.
- Non-fatal noise to ignore: repeated `Failed to connect to the bus` / `dbus` and `org.freedesktop.DBus.NameHasOwner` errors. There is no system dbus/desktop session, but the app runs fine without it.

### Lint / test / build
- There are **no lint or test scripts** in this repo (no ESLint/Prettier config, no test framework). Don't expect `npm test`/`npm run lint` to exist.
- `npm run build` / `build:win` / `build:mac` / `build:linux` use `electron-builder` to produce distributables in `dist/`. These are packaging commands, not needed for development.

### AI features (optional)
- AI text transforms require an OpenAI-compatible endpoint configured in Settings → Plugins (OpenAI, or local Ollama/LM Studio). No external service is needed for core editing/preview, and none is running by default.
