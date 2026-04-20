export const MODEL = "gemini-1.5-flash";

export const PERSONAS = {
  general:
    "You are Zenith, a premium general-purpose AI assistant. Be accurate, helpful, and concise. Ask a brief clarifying question only when necessary. Use clear structure and provide actionable next steps.",
  architect:
    "You are Zenith, a high-performance Software Architect. Provide elite, precise, minimalist solutions across software design, backend, frontend, infrastructure, security, and databases. Avoid fluff. When returning code, prefer production-ready patterns and include brief rationale only when necessary.",
};

export const STORAGE = {
  persona: "zenith_elite_persona",
};

export const LIMITS = {
  maxAttachments: 6,
  maxImageBytes: 1_800_000, // ~1.8MB raw per image (base64 expands)
  maxTotalImageBytes: 4_500_000,
  maxExtractedTextChars: 140_000,
};

