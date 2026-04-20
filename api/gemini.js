const DEFAULT_MODEL = "meta-llama/llama-4-scout:free";
const DEFAULT_PERSONA =
  "You are Zenith, a premium general-purpose AI assistant. Be accurate, helpful, and concise. Ask a brief clarifying question only when necessary. Use clear structure and provide actionable next steps.";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function json(res, statusCode, obj) {
  cors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function buildMessages(persona, messages, attachments) {
  const result = [];

  // System message
  result.push({ role: "system", content: persona });

  // Conversation history
  for (const m of messages || []) {
    if (!m?.content) continue;
    if (m.role === "user") {
      result.push({ role: "user", content: String(m.content) });
    } else if (m.role === "assistant") {
      result.push({ role: "assistant", content: String(m.content) });
    }
  }

  // Attach files to the last user message
  if (attachments && attachments.length > 0) {
    const lastUserIndex = result.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex >= 0) {
      let extra = "\n\nUse the attached files below to answer the user's request:";
      for (const a of attachments) {
        if (!a) continue;
        if (a.kind === "text") {
          const note = a.note ? ` (${a.note})` : "";
          extra += `\n\n[Attachment: ${a.name}${note}]\n${a.text || ""}\n[/Attachment]`;
        } else if (a.kind === "image") {
          // OpenRouter supports image URLs in content array for vision models
          // For non-vision free models, send a note instead
          extra += `\n\n[Image attached: ${a.name} — image content not supported on this model]`;
        }
      }
      result[lastUserIndex].content += extra;
    }
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method && req.method.toUpperCase() === "OPTIONS") {
    cors(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method && req.method.toUpperCase() !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    json(res, 503, { error: "Missing OPENROUTER_API_KEY env var" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const model =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : DEFAULT_MODEL;
  const persona =
    typeof payload.systemPersona === "string" && payload.systemPersona.trim()
      ? payload.systemPersona.trim()
      : DEFAULT_PERSONA;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  const builtMessages = buildMessages(persona, messages, attachments);

  const body = {
    model,
    messages: builtMessages,
    max_tokens: 8192,
    temperature: 0.35,
    top_p: 0.9,
  };

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://zenith-ai.vercel.app",
        "X-Title": "Zenith Elite",
      },
      body: JSON.stringify(body),
    });

    const data = await r.json().catch(() => null);

    if (!r.ok) {
      json(res, r.status, { error: "OpenRouter request failed", details: data || null });
      return;
    }

    const text = data?.choices?.[0]?.message?.content || "";
    json(res, 200, { text });
  } catch (e) {
    json(res, 500, { error: "Server exception", message: String(e?.message || e) });
  }
}
