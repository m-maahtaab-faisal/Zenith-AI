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

## Run locally (recommended)

You need the Netlify dev server so `/api/*` works:

1. Install Netlify CLI (one-time):
   - `npm i -g netlify-cli`
2. Start dev server:
   - `netlify dev`
3. Open the URL Netlify prints (usually `http://localhost:8888`)

## Deploy on Netlify

1. Connect the GitHub repo in Netlify
2. Add environment variable:
   - `GEMINI_API_KEY` = your Gemini API key
3. Redeploy
4. In the app, click **Test Server**

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

