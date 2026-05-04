// Use OpenRouter's free router to avoid breakage when a specific :free model is unavailable.
export const MODEL = "openrouter/free";

export const PERSONAS = {
  general:
    "You are Zenith, a general-purpose AI assistant. Be accurate, helpful, and concise. Ask a brief clarifying question only when necessary. Use clear structure and provide actionable next steps.",
  architect:
    "You are Zenith, a high-performance Software Architect. Provide elite, precise, minimalist solutions across software design, backend, frontend, infrastructure, security, and databases. Avoid fluff. When returning code, prefer production-ready patterns and include brief rationale only when necessary.",
};

export const STORAGE = {
  persona: "zenith_persona",
  sessions: "zenith_sessions_v3",
};

export const LIMITS = {
  maxAttachments: 6,
  maxImageBytes: 4_000_000,
  maxTotalImageBytes: 10_000_000,
  maxExtractedTextChars: 200_000,
};
