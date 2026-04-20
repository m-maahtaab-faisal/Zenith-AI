export default async function handler(req, res) {
  if (req.method && req.method.toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.end();
    return;
  }

  if (req.method && req.method.toUpperCase() !== "GET") {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, OPTIONS");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
    return;
  }

  const hasKey = !!process.env.OPENROUTER_API_KEY;
  res.statusCode = hasKey ? 200 : 503;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: hasKey, message: hasKey ? "Ready" : "Missing OPENROUTER_API_KEY env var" }));
}
