# Zenith AI

A clean, fast AI chat interface powered by OpenRouter. Deploy to Vercel in one click.

## Setup

1. Clone this repo
2. Deploy to Vercel
3. Add environment variable: `OPENROUTER_API_KEY` (from openrouter.ai)
4. Redeploy

## Features

- Multi-session chat with persistent history
- File attachments: Images, PDF, DOCX, TXT, JSON, CSV
- Markdown rendering with syntax highlighting
- Copy code blocks with one click
- Export chat as Markdown
- General + Architect persona modes
- Responsive (works on mobile)

## Structure

```
/
├── index.html
├── assets/styles.css
├── src/
│   ├── app.js
│   ├── api.js
│   ├── attachments.js
│   ├── constants.js
│   ├── export.js
│   ├── markdown.js
│   └── utils.js
├── api/
│   ├── gemini.js
│   └── health.js
└── vercel.json
```

## Model

Default: `openrouter/free` (OpenRouter free router)

Change in `src/constants.js` → `MODEL`.
