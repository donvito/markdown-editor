# Markdown Editor

A simple Markdown viewer and editor for Mac, Windows and Linux, built with Electron.

## Features

- **Live Preview** - Real-time preview of Markdown content as you type
- **Split View** - Edit and preview side by side (default view)
- **Syntax Highlighting** - Code blocks with syntax coloring for multiple languages
- **Multi-Tab Support** - Open and work with multiple files simultaneously
- **Sidebar** - Quick access to all open files
- **Unsaved Changes Warning** - Prompts to save when closing tabs or the app
- **Dark Mode** - Toggle between light and dark themes
- **Line Numbers** - Optional line numbers in the editor
- **Cursor Position** - Shows current line and column in status bar
- **Cross-Platform** - Works on Mac, Windows, and Linux

## Installation

```bash
npm install
```

## Usage

```bash
npm start
```

## Build

Build distributable packages:

```bash
# Windows
npm run build:win

# Mac
npm run build:mac

# All platforms
npm run build:all
```

## Keyboard Shortcuts

- `Ctrl+N` / `Cmd+N` - New file
- `Ctrl+O` / `Cmd+O` - Open file
- `Ctrl+S` / `Cmd+S` - Save file
- `Ctrl+Shift+S` / `Cmd+Shift+S` - Save As
- `Ctrl+W` / `Cmd+W` - Close current tab
- `Ctrl+Q` / `Cmd+Q` - Quit application

## Dependencies

- [Electron](https://www.electronjs.org/) - Cross-platform desktop app framework
- [Marked](https://marked.js.org/) - Markdown parser
- [highlight.js](https://highlightjs.org/) - Syntax highlighting

## License

MIT
