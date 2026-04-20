import { MODEL } from "./constants.js";

export async function serverHealthCheck() {
  const res = await fetch("/api/health", { method: "GET" });
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  const data = await res.json();
  return data;
}

export async function sendChatToServer({ messages, systemPersona, attachments }) {
  const res = await fetch("/api/gemini", {
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
    const text = await res.text().catch(() => "");
    throw new Error(`Server error ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();
  return data?.text ?? "";
}
