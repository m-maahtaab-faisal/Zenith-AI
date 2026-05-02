import { MODEL } from "./constants.js";

async function fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function serverHealthCheck() {
  const res = await fetchWithTimeout("/api/health", { method: "GET" }, 12_000);
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const data = await res.json();
  return data;
}

export async function sendChatToServer({ messages, systemPersona, attachments }) {
  const res = await fetchWithTimeout("/api/gemini", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      systemPersona,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      attachments,
    }),
  }, 60_000);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Server error ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();
  return data?.text ?? "";
}
