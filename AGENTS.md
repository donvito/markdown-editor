# AGENTS.md

## Cursor Cloud specific instructions

This is an Electron desktop app (Markdown Editor with AI). There are no backend services, databases, or Docker containers. The entire application is a single Electron process.

### Running the app

- Install dependencies: `npm install`
- Start the app: `DISPLAY=:1 npm start` (use display `:1` for the Desktop pane, or start Xvfb on `:99` for headless)
- Build for Linux: `npm run build:linux`
- See `README.md` for full build commands (mac/win/linux/all)

### Key caveats

- **Display server required**: Electron needs an X11 display. On Cloud Agent VMs, use `DISPLAY=:1` to render on the Desktop pane visible to the computerUse subagent. For headless-only validation, start Xvfb (`Xvfb :99 -screen 0 1280x1024x24 &`) and use `DISPLAY=:99`.
- **DBus errors are non-fatal**: The app logs many `dbus/bus.cc` and `dbus/object_proxy.cc` errors on headless Linux. These are cosmetic and do not affect functionality.
- **No test suite**: The project has no automated tests (`npm test` is not defined). Validation is manual via the GUI.
- **No linter configured**: There is no ESLint or other linter set up in the project.
- **AI features require configuration**: AI text transformations and chat require configuring an OpenAI-compatible API provider in Settings > Plugins. Core markdown editing works without any API keys.
