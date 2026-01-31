# Markdown Editor with AI

A simple and lightweight Markdown editor with AI features for Windows, Mac, and Linux

AI features work with local models via Ollama or LMStudio

If you like this project, please consider supporting it 

[![Donate](https://img.shields.io/badge/☕_Click_here_to_donate-ffdd00?style=flat&logoColor=black)](https://buymeacoffee.com/donvitocodes)

## Features

- **Live Preview** - Real-time preview of Markdown content as you type
- **Split View** - Edit and preview side by side (default view)
- **Syntax Highlighting** - Code blocks with syntax coloring for multiple languages
- **Multi-Tab Support** - Open and work with multiple files simultaneously
- **Sidebar** - Quick access to all open files
- **Dark Mode** - Toggle between light and dark themes
- **AI Features** (see below)

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

### Supported AI Providers

Configure any OpenAI-compatible API in Settings:
- **OpenAI** - GPT-4o, GPT-4o-mini
- **Ollama** - Local models (Llama, Mistral, etc.)
- **LM Studio** - Local models
- **Custom** - Any OpenAI-compatible endpoint

### Configure your AI provider

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

## License

MIT
