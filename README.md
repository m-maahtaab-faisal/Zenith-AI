# Zenith Elite

Premium “Apple-site” obsidian glass chatbot UI powered by **Gemini** (server-side key) with **document + image understanding**.

## Features

- General chatbot + optional “Architect” persona (Brain → Persona)
- Upload/attach:
  - Images (PNG/JPG/WebP/GIF)
  - PDFs (text extracted client-side)
  - DOCX (text extracted client-side)
  - Text-like files (`.txt .md .json .csv .log`)
- Markdown rendering + syntax highlighting + copy buttons
- Netlify Functions backend (users never paste API keys)

## Deploy on Vercel (recommended)

This repo includes Vercel Serverless Functions in `api/`.

1. Import the GitHub repo in Vercel
2. Add environment variable:
   - `GEMINI_API_KEY` = your Gemini API key
3. Redeploy
4. Open:
   - `/api/health` (should return `{ ok: true }`)

## Local dev (Vercel)

- `npx vercel dev`

## Deploy on Netlify (optional)

Netlify Functions are also included in `netlify/functions/`.

1. Connect the GitHub repo in Netlify
2. Set `GEMINI_API_KEY`
3. Redeploy
4. Open:
   - `/api/health` or `/.netlify/functions/health`

## GitHub upload

From `C:\Users\m-mahtab-faisal\Desktop\Zenith`:

- `git init`
- `git add .`
- `git commit -m "Initial Zenith Elite"`
- Create a GitHub repo, then:
  - `git branch -M main`
  - `git remote add origin YOUR_REPO_URL`
  - `git push -u origin main`

## Notes / Limits

- Attachments are limited to keep requests small (Netlify has request-size limits).
- For PDFs/DOCX, the app extracts text in the browser and sends that extracted text to Gemini.
- For best results: ask a precise question after attaching, e.g. “Summarize, list decisions, and extract action items with owners/dates.”
