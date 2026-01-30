# Markdown Editor

A simple and lightweight Markdown editor for Windows and Mac

If you like this project, please consider supporting it 

[![Donate](https://img.shields.io/badge/☕_Click_here_to_donate-ffdd00?style=flat&logoColor=black)](https://buymeacoffee.com/donvitocodes)

## Features

- **Live Preview** - Real-time preview of Markdown content as you type
- **Split View** - Edit and preview side by side (default view)
- **Syntax Highlighting** - Code blocks with syntax coloring for multiple languages
- **Multi-Tab Support** - Open and work with multiple files simultaneously
- **Sidebar** - Quick access to all open files
- **Unsaved Changes Warning** - Prompts to save when closing tabs or the app
- **Dark Mode** - Toggle between light and dark themes
- **Line Numbers** - Optional line numbers in the editor with word wrap support
- **Word Wrap** - Toggle word wrap on/off in the editor
- **Cursor Position** - Shows current line and column in status bar
- **Cross-Platform** - Works on Mac, Windows, and Linux
- **AI-Powered Editing** - Transform text using AI (see below)

### Light Mode
![Markdown Editor - Light Mode](images/markdown-editor-light.png)

## AI Features

The editor includes a built-in AI plugin for intelligent text editing. Select any text and right-click to access AI-powered transformations:

- **Generate from prompt** - Describe what you want and let AI generate it
- **Make shorter** - Condense text while keeping key information
- **Make longer** - Expand text with more detail and examples
- **More formal tone** - Rewrite in a professional tone
- **More casual tone** - Rewrite in a conversational tone
- **Fix grammar & spelling** - Correct errors automatically

### Generate text using AI
![Markdown Editor - AI Generate](images/mde-blog.png)

### Translate text using AI
![Markdown Editor - AI Generate](images/mde-translate.png)


### Inline Streaming Preview

AI-generated text streams in real-time with an inline diff view:
- Original text shown in purple
- Generated text shown in green with live streaming
- Accept (`Cmd/Ctrl+Enter`) or Reject (`Esc`) changes instantly

### Supported AI Providers

Configure any OpenAI-compatible API in Settings:
- **OpenAI** - GPT-4o, GPT-4o-mini
- **Ollama** - Local models (Llama, Mistral, etc.)
- **LM Studio** - Local models
- **Custom** - Any OpenAI-compatible endpoint

### Setup

1. Open **Settings** (`Cmd/Ctrl+,`)
2. Go to the **Plugins** tab
3. Select your AI provider and enter your API key
4. Choose your preferred model

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

### File Operations
- `Cmd/Ctrl+N` - New file
- `Cmd/Ctrl+O` - Open file
- `Cmd/Ctrl+S` - Save file
- `Cmd/Ctrl+Shift+S` - Save As
- `Cmd/Ctrl+W` - Close current tab
- `Cmd/Ctrl+Q` - Quit application
- `Cmd/Ctrl+,` - Open Settings

### AI Editing
- `Cmd/Ctrl+K` - AI Generate with prompt
- `Cmd/Ctrl+Enter` - Accept AI-generated text
- `Esc` - Reject and close

## Dependencies

- [Electron](https://www.electronjs.org/) - Cross-platform desktop app framework
- [Marked](https://marked.js.org/) - Markdown parser
- [highlight.js](https://highlightjs.org/) - Syntax highlighting
- [electron-store](https://github.com/sindresorhus/electron-store) - Persistent storage for settings and API keys

## License

MIT
