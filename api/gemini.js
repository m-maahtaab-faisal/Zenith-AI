const DEFAULT_MODEL = "gemini-1.5-flash";
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

function toBaseContents(messages) {
  const out = [];
  for (const m of messages || []) {
    if (!m?.content) continue;
    if (m.role === "user") out.push({ role: "user", parts: [{ text: String(m.content) }] });
    else if (m.role === "assistant") out.push({ role: "model", parts: [{ text: String(m.content) }] });
  }
  return out;
}

function attachToLastUser(contents, attachments) {
  if (!attachments || attachments.length === 0) return contents;
  let lastUserIndex = -1;
  for (let i = contents.length - 1; i >= 0; i--) {
    if (contents[i]?.role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return contents;

  const last = contents[lastUserIndex];
  last.parts = Array.isArray(last.parts) ? last.parts : [];

  last.parts.push({
    text: "\n\nUse the attached files below to answer the user’s request. Quote relevant excerpts when helpful.",
  });

  for (const a of attachments) {
    if (!a) continue;
    if (a.kind === "text") {
      const name = String(a.name || "document");
      const note = a.note ? ` (${a.note})` : "";
      const text = String(a.text || "");
      last.parts.push({ text: `\n\n[Attachment: ${name}${note}]\n${text}\n[/Attachment]` });
    } else if (a.kind === "image") {
      const mimeType = String(a.mime || "image/png");
      const data = String(a.dataBase64 || "");
      if (!data) continue;
      if (data.length > 8_000_000) continue;
      last.parts.push({ inlineData: { mimeType, data } });
    }
  }
  return contents;
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    json(res, 503, { error: "Missing GEMINI_API_KEY env var" });
    return;
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const model = typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : DEFAULT_MODEL;
  const persona =
    typeof payload.systemPersona === "string" && payload.systemPersona.trim() ? payload.systemPersona.trim() : DEFAULT_PERSONA;
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  let contents = toBaseContents(messages);
  contents = attachToLastUser(contents, attachments);
  if (contents.length === 0) {
    json(res, 400, { error: "No messages provided" });
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: persona }] },
    contents,
    generationConfig: {
      temperature: 0.35,
      topP: 0.9,
      maxOutputTokens: 1024,
    },
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      json(res, r.status, { error: "Gemini request failed", details: data || null });
      return;
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("") ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";
    json(res, 200, { text });
  } catch (e) {
    json(res, 500, { error: "Server exception", message: String(e?.message || e) });
  }
}

