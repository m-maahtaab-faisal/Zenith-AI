# Zenith — Premium AI Chat

A clean, fast AI chat interface powered by OpenRouter. Deploy to Vercel in one click.

## Setup

1. Clone this repo
2. Deploy to [Vercel](https://vercel.com)
3. Add environment variable: `OPENROUTER_API_KEY` → your key from [openrouter.ai](https://openrouter.ai)
4. Redeploy

## Features

- Multi-session chat with persistent history
- File attachments: **Images, PDF, DOCX, TXT, JSON, CSV**
- Markdown rendering with syntax highlighting
- Copy code blocks with one click
- Export chat as Markdown
- General + Architect persona modes
- Responsive — works on mobile

## Structure

```
/
├── index.html          # App entry
├── assets/styles.css   # All styles
├── src/
│   ├── app.js          # Main application logic
│   ├── api.js          # Server communication
│   ├── attachments.js  # File parsing
│   ├── constants.js    # Config
│   ├── export.js       # Chat export
│   ├── markdown.js     # Markdown rendering
│   └── utils.js        # Helpers
├── api/
│   ├── gemini.js       # OpenRouter proxy
│   └── health.js       # Health check
└── vercel.json
```

## Model

Default: `meta-llama/llama-4-scout:free` (free on OpenRouter)

Change in `src/constants.js` → `MODEL`.
