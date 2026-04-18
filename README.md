# Zenith Elite

Premium Gemini-powered chat UI (Obsidian glass aesthetic) built as a static project you can upload to GitHub and deploy anywhere.

## What it is

- A general-purpose chatbot (default), with an optional “Architect” persona for engineering-heavy sessions.
- Server-side Gemini key via Netlify Functions (users do not paste keys).

## Run locally

- Run with Netlify Dev so `/api/*` functions work locally.

Example:
- `npx netlify dev`

## No user API keys (server-side)

This project is configured so **users never paste API keys**.

Set this in Netlify:
- `GEMINI_API_KEY` = your Gemini API key (do **not** commit it to GitHub)

Then the browser calls:
- `/.netlify/functions/gemini` via `/api/gemini`

## Security note
Never put API keys directly into `index.html` or any client JS. Use environment variables + serverless functions.

## Upload to GitHub

From the project folder:
- `git init`
- `git add .`
- `git commit -m "Initial Zenith Elite"`
- Create a new repo on GitHub, then:
  - `git remote add origin YOUR_REPO_URL`
  - `git push -u origin main`
