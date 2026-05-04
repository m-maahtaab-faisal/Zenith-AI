const DEFAULT_MODEL = "openrouter/free";
const DEFAULT_PERSONA =
  "You are Zenith, a general-purpose AI assistant. Be accurate, helpful, and concise. Ask a brief clarifying question only when necessary. Use clear structure and provide actionable next steps.";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function json(res, status, obj) {
  cors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function buildMessages(persona, messages, attachments) {
  const result = [{ role: "system", content: persona }];

  for (const m of messages || []) {
    if (!m?.content) continue;
    if (m.role === "user" || m.role === "assistant")
      result.push({ role: m.role, content: String(m.content) });
  }

  // Attach files to last user message
  if (attachments?.length) {
    const idx = result.map((m) => m.role).lastIndexOf("user");
    if (idx >= 0) {
      let extra = "\n\nThe user has attached the following files — use them to answer:\n";
      for (const a of attachments) {
        if (!a) continue;
        if (a.kind === "text") {
          extra += `\n---\n[File: ${a.name}${a.note ? ` — ${a.note}` : ""}]\n${a.text || ""}\n---\n`;
        } else if (a.kind === "image") {
          // Most free OpenRouter models don't support vision; describe what was attached
          extra += `\n[Image attached: "${a.name}" — Note: analyze it if the model supports vision, otherwise acknowledge it.]`;
        }
      }
      result[idx].content += extra;
    }
  }

  return result;
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();
  if (method === "OPTIONS") { cors(res); res.statusCode = 204; res.end(); return; }
  if (method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) { json(res, 503, { error: "Missing OPENROUTER_API_KEY env var" }); return; }

  let payload;
  try { payload = await readBody(req); }
  catch { json(res, 400, { error: "Invalid JSON" }); return; }

  const model = typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : DEFAULT_MODEL;
  const persona = typeof payload.systemPersona === "string" && payload.systemPersona.trim() ? payload.systemPersona.trim() : DEFAULT_PERSONA;
  const messages = buildMessages(persona, payload.messages || [], payload.attachments || []);

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://zenith-ai.vercel.app",
        "X-Title": "Zenith AI",
      },
      body: JSON.stringify({ model, messages, max_tokens: 8192, temperature: 0.35, top_p: 0.9 }),
    });

    const data = await r.json().catch(() => null);
    if (!r.ok) { json(res, r.status, { error: "OpenRouter error", details: data }); return; }

    json(res, 200, { text: data?.choices?.[0]?.message?.content || "" });
  } catch (e) {
    json(res, 500, { error: "Server exception", message: String(e?.message || e) });
  }
}
