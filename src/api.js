import { MODEL } from "./constants.js";

async function fetchWithFallback(pathPrimary, pathFallback, init) {
  const res1 = await fetch(pathPrimary, init);
  if (res1.status !== 404) return res1;
  // Some deployments don't have /api redirects configured; try Netlify default functions path.
  return await fetch(pathFallback, init);
}

export async function serverHealthCheck() {
  const res = await fetchWithFallback("/api/health", "/.netlify/functions/health", { method: "GET" });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Functions not found (404). Run with `netlify dev` or deploy on Netlify with functions enabled.");
    }
    throw new Error(`Health failed: ${res.status}`);
  }
  const data = await res.json();
  return data;
}

export async function sendChatToServer({ messages, systemPersona, attachments }) {
  const res = await fetchWithFallback("/api/gemini", "/.netlify/functions/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      systemPersona,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      attachments,
    }),
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Functions not found (404). Run with `netlify dev` or deploy on Netlify with functions enabled.");
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Server error ${res.status}: ${text || res.statusText}`);
  }
  const data = await res.json();
  return data?.text ?? "";
}
