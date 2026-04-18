export async function handler() {
  const hasKey = !!process.env.GEMINI_API_KEY;
  return {
    statusCode: hasKey ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      ok: hasKey,
      message: hasKey ? "Ready" : "Missing GEMINI_API_KEY env var",
    }),
  };
}

