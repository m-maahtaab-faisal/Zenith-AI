import { MODEL, PERSONAS, STORAGE } from "./constants.js";
import { qs } from "./dom.js";
import { escHtml, estTokens, formatElapsed, bytesToHuman } from "./utils.js";
import { buildExportMarkdown, downloadExport } from "./export.js";
import { renderAssistantMarkdown } from "./markdown.js";
import { sendChatToServer, serverHealthCheck } from "./api.js";
import { addMessageBubble, ensureAtBottom, setConnectionStatus, sidebarOpen } from "./ui.js";
import { parseFilesToAttachments, attachmentSummary } from "./attachments.js";

marked.setOptions({ gfm: true, breaks: true });

const SESSIONS_KEY = "zenith_elite_sessions_v2";

const el = {
  chat: qs("#chat"),
  prompt: qs("#prompt"),
  sendBtn: qs("#sendBtn"),
  stopBtn: qs("#stopBtn"),
  attachBtn: qs("#attachBtn"),
  fileInput: qs("#fileInput"),
  attachmentsWrap: qs("#attachments"),
  attachmentChips: qs("#attachmentChips"),

  statusPill: qs("#statusPill"),
  connDot: qs("#connDot"),
  connText: qs("#connText"),
  modelName: qs("#modelName"),

  openSidebar: qs("#openSidebar"),
  closeSidebar: qs("#closeSidebar"),
  sidebar: qs("#sidebar"),
  drawerBackdrop: qs("#drawerBackdrop"),

  newSessionBtn: qs("#newSessionBtn"),
  sessionsList: qs("#sessionsList"),

  servicePanel: qs("#servicePanel"),
  serverTestBtn: qs("#serverTestBtn"),
  serverStatus: qs("#serverStatus"),

  personaSelect: qs("#personaSelect"),
  personaHint: qs("#personaHint"),

  copyMdBtn: qs("#copyMdBtn"),
  downloadMdBtn: qs("#downloadMdBtn"),

  statElapsed: qs("#statElapsed"),
};

el.modelName.textContent = MODEL;

const state = {
  busy: false,
  abort: null,
  stopRequested: false,

  startedAt: Date.now(),
  personaId: "general",
  attachments: [],

  sessions: [],
  activeSessionId: "",
};

function setBusy(busy) {
  state.busy = busy;
  el.sendBtn.disabled = busy;
  if (busy) {
    el.stopBtn.classList.remove("hidden");
    setConnectionStatus(el, "busy", "Generating…");
  } else {
    el.stopBtn.classList.add("hidden");
    setConnectionStatus(el, "ok", "Online");
  }
}

function setServerStatus(msg, kind = "info") {
  const color =
    kind === "ok"
      ? "text-emerald-300"
      : kind === "bad"
        ? "text-rose-300"
        : kind === "warn"
          ? "text-amber-300"
          : "text-white/60";
  el.serverStatus.className = `mt-2 text-xs ${color}`;
  el.serverStatus.textContent = msg;
}

function autoSize() {
  el.prompt.style.height = "0px";
  const next = Math.min(220, Math.max(56, el.prompt.scrollHeight));
  el.prompt.style.height = `${next}px`;
}

function loadPersona() {
  const saved = localStorage.getItem(STORAGE.persona);
  state.personaId = PERSONAS[saved] ? saved : "general";
  el.personaSelect.value = state.personaId;
  updatePersonaHint();
}

function updatePersonaHint() {
  el.personaHint.textContent =
    state.personaId === "architect" ? "Sharper engineering mode." : "General-purpose assistant.";
}

function savePersona(nextId) {
  state.personaId = PERSONAS[nextId] ? nextId : "general";
  localStorage.setItem(STORAGE.persona, state.personaId);
  updatePersonaHint();
}

function persistSessions() {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
  } catch {}
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.sessions = Array.isArray(parsed) ? parsed : [];
  } catch {
    state.sessions = [];
  }
  if (state.sessions.length === 0) createSession();
  if (!state.activeSessionId) state.activeSessionId = state.sessions[0].id;
  renderSessionsList();
  switchSession(state.activeSessionId);
}

function titleFromMessages(messages) {
  const firstUser = (messages || []).find((m) => m.role === "user" && m.content);
  const t = String(firstUser?.content || "New chat").trim();
  return t.length > 42 ? `${t.slice(0, 42)}…` : t;
}

function updateSessionMeta(session) {
  session.updatedAt = Date.now();
  session.messageCount = (session.messages || []).filter((m) => m.role !== "system").length;
  if (!session.title || session.title === "New chat") session.title = titleFromMessages(session.messages);
  session.personaId = state.personaId;
}

function createSession() {
  const now = Date.now();
  const s = {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    personaId: state.personaId,
    messages: [],
    messageCount: 0,
  };
  state.sessions.unshift(s);
  state.activeSessionId = s.id;
  persistSessions();
  renderSessionsList();
  return s;
}

function getActiveSession() {
  return state.sessions.find((s) => s.id === state.activeSessionId) || null;
}

function renderSessionsList() {
  el.sessionsList.innerHTML = "";
  const ordered = [...state.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const s of ordered) {
    const active = s.id === state.activeSessionId;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "w-full text-left rounded-2xl px-3 py-2 border border-white/10 transition " +
      (active ? "bg-white/10" : "glass hover:bg-white/10");
    btn.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-xs font-medium truncate ${active ? "text-white/90" : "text-white/80"}">${escHtml(s.title || "New chat")}</div>
          <div class="mt-0.5 text-[11px] text-white/45 truncate">${s.messageCount ?? 0} messages</div>
        </div>
        <div class="shrink-0 h-2 w-2 rounded-full ${active ? "bg-emerald-400" : "bg-white/20"}"></div>
      </div>
    `;
    btn.addEventListener("click", () => switchSession(s.id));
    el.sessionsList.appendChild(btn);
  }
}

function switchSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  state.activeSessionId = id;
  state.personaId = PERSONAS[s.personaId] ? s.personaId : "general";
  el.personaSelect.value = state.personaId;
  updatePersonaHint();
  clearAttachments();

  // Keep initial assistant bubble (first child) then render messages.
  const first = el.chat.children[0] ? el.chat.children[0].cloneNode(true) : null;
  el.chat.innerHTML = "";
  if (first) el.chat.appendChild(first);

  for (const m of s.messages || []) {
    if (m.role === "user") addMessageBubble(el.chat, { role: "user", label: "You", text: m.content });
    else if (m.role === "assistant") {
      const b = addMessageBubble(el.chat, { role: "assistant", label: "Zenith", html: "" });
      renderAssistantMarkdown(b.body, m.content);
    }
  }
  ensureAtBottom(el.chat);
  renderSessionsList();
}

function renderAttachmentChips() {
  const has = state.attachments.length > 0;
  el.attachmentsWrap.classList.toggle("hidden", !has);
  el.attachmentChips.innerHTML = "";
  if (!has) return;

  for (const att of state.attachments) {
    const chip = document.createElement("div");
    chip.className =
      "inline-flex items-center gap-2 rounded-2xl glass px-3 py-2 text-xs text-white/80 border border-white/10";
    const icon = att.kind === "image" ? "IMG" : "DOC";
    const meta = att.sizeBytes ? bytesToHuman(att.sizeBytes) : "";
    chip.innerHTML = `
      <span class="text-white/60">${icon}</span>
      <span class="max-w-[180px] sm:max-w-[220px] truncate">${escHtml(att.name)}</span>
      <span class="text-white/45">${meta ? escHtml(meta) : ""}</span>
      <button type="button" class="ml-1 text-white/60 hover:text-white/85" aria-label="Remove attachment">✕</button>
    `;
    chip.querySelector("button").addEventListener("click", () => {
      state.attachments = state.attachments.filter((a) => a.id !== att.id);
      renderAttachmentChips();
    });
    el.attachmentChips.appendChild(chip);
  }
}

function clearAttachments() {
  state.attachments = [];
  if (el.fileInput) el.fileInput.value = "";
  renderAttachmentChips();
}

async function addAttachmentsFromFileList(fileList) {
  const files = Array.from(fileList || []);
  if (files.length === 0) return;
  try {
    state.attachments = await parseFilesToAttachments(files, state.attachments);
    renderAttachmentChips();
  } catch (e) {
    addMessageBubble(el.chat, {
      role: "assistant",
      label: "Zenith",
      html: `<div class="text-amber-200 text-sm">Attachment rejected.</div><div class="mt-2 text-xs text-white/60">${escHtml(
        String(e?.message || e),
      )}</div>`,
    });
  }
}

async function sendMessage() {
  const text = el.prompt.value.trim();
  if (!text && state.attachments.length === 0) return;
  if (state.busy) return;

  const session = getActiveSession() || createSession();

  el.prompt.value = "";
  autoSize();

  const userContent = text || "Analyze the attached files.";
  session.messages.push({ role: "user", content: userContent, ts: Date.now(), tokens: estTokens(userContent) });
  addMessageBubble(el.chat, { role: "user", label: "You", text: userContent });

  if (state.attachments.length > 0) {
    addMessageBubble(el.chat, {
      role: "assistant",
      label: "Zenith",
      html: `<div class="text-xs text-white/60">Received: ${escHtml(
        state.attachments.map(attachmentSummary).join(" · "),
      )}</div>`,
    });
  }

  updateSessionMeta(session);
  persistSessions();
  renderSessionsList();

  const assistant = addMessageBubble(el.chat, {
    role: "assistant",
    label: "Zenith",
    html: `<span class="dots" aria-label="Zenith is thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`,
    streaming: true,
  });

  setBusy(true);
  state.abort = new AbortController();
  state.stopRequested = false;

  const t0 = performance.now();
  try {
    const reply = await sendChatToServer({
      messages: session.messages,
      systemPersona: PERSONAS[state.personaId],
      attachments: state.attachments,
    });
    if (state.stopRequested) throw Object.assign(new Error("Aborted"), { name: "AbortError" });

    renderAssistantMarkdown(assistant.body, reply);
    session.messages.push({ role: "assistant", content: reply, ts: Date.now(), tokens: estTokens(reply) });
    updateSessionMeta(session);
    persistSessions();
    renderSessionsList();
    clearAttachments();
  } catch (e) {
    const isAbort = state.stopRequested || String(e?.name || "").toLowerCase().includes("abort");
    if (isAbort) {
      assistant.body.innerHTML = `<div class="text-xs text-white/60">Stopped.</div>`;
    } else {
      const msg = String(e?.message || e);
      assistant.body.innerHTML =
        `<div class="text-rose-200 text-sm">Generation failed.</div>` +
        `<div class="mt-2 text-xs text-white/60">${escHtml(msg)}</div>`;
      setConnectionStatus(el, "warn", "Service error");
      el.servicePanel.classList.remove("hidden");
      setServerStatus(msg.includes("Missing GEMINI_API_KEY") ? "Owner action: set GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables, then redeploy." : msg, "warn");
    }
  } finally {
    setBusy(false);
    state.abort = null;
    state.stopRequested = false;
    ensureAtBottom(el.chat);
  }

  const dt = Math.round(performance.now() - t0);
  // Keep a tiny “elapsed since app open” for a subtle sense of continuity
  if (el.statElapsed) el.statElapsed.textContent = formatElapsed(Date.now() - state.startedAt);
  void dt;
}

function stopGeneration() {
  state.stopRequested = true;
  if (state.abort) {
    try {
      state.abort.abort();
    } catch {}
  }
}

// Sidebar drawer
el.openSidebar?.addEventListener("click", () => sidebarOpen({ sidebar: el.sidebar, drawerBackdrop: el.drawerBackdrop }, true));
el.closeSidebar?.addEventListener("click", () => sidebarOpen({ sidebar: el.sidebar, drawerBackdrop: el.drawerBackdrop }, false));
el.drawerBackdrop?.addEventListener("click", () => sidebarOpen({ sidebar: el.sidebar, drawerBackdrop: el.drawerBackdrop }, false));

// Composer
el.prompt.addEventListener("input", autoSize);
el.prompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  if (e.key === "Escape") stopGeneration();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") stopGeneration();
});

el.sendBtn.addEventListener("click", sendMessage);
el.stopBtn.addEventListener("click", stopGeneration);

// Attachments
el.attachBtn.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", async () => {
  await addAttachmentsFromFileList(el.fileInput.files);
});
el.chat.addEventListener("dragover", (e) => e.preventDefault());
el.chat.addEventListener("drop", async (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) await addAttachmentsFromFileList(e.dataTransfer.files);
});

// Sessions
el.newSessionBtn.addEventListener("click", () => {
  createSession();
  switchSession(state.activeSessionId);
});

// Export
el.copyMdBtn.addEventListener("click", async () => {
  const session = getActiveSession();
  const md = buildExportMarkdown(session?.messages || []);
  try {
    await navigator.clipboard.writeText(md);
    el.copyMdBtn.textContent = "Copied";
    setTimeout(() => (el.copyMdBtn.textContent = "Copy"), 900);
  } catch {
    el.copyMdBtn.textContent = "Denied";
    setTimeout(() => (el.copyMdBtn.textContent = "Copy"), 900);
  }
});
el.downloadMdBtn.addEventListener("click", () => {
  const session = getActiveSession();
  downloadExport(session?.messages || []);
});

// Persona
loadPersona();
el.personaSelect.addEventListener("change", () => {
  savePersona(el.personaSelect.value);
  const session = getActiveSession();
  if (session) {
    session.personaId = state.personaId;
    updateSessionMeta(session);
    persistSessions();
    renderSessionsList();
  }
});

// Service
el.serverTestBtn.addEventListener("click", async () => {
  setServerStatus("Checking…", "info");
  try {
    const health = await serverHealthCheck();
    el.servicePanel.classList.toggle("hidden", !!health?.ok);
    setConnectionStatus(el, health?.ok ? "ok" : "warn", health?.ok ? "Online" : "Needs setup");
    setServerStatus(health?.ok ? "Service is ready." : "Missing GEMINI_API_KEY env var.", health?.ok ? "ok" : "warn");
  } catch (e) {
    el.servicePanel.classList.remove("hidden");
    setConnectionStatus(el, "warn", "Offline");
    setServerStatus(String(e?.message || e), "bad");
  }
});

// Init
autoSize();
setBusy(false);
setConnectionStatus(el, "ok", "Online");
loadSessions();

// Quiet health check
(async () => {
  try {
    const h = await serverHealthCheck();
    if (!h?.ok) el.servicePanel.classList.remove("hidden");
    else el.servicePanel.classList.add("hidden");
  } catch {
    el.servicePanel.classList.remove("hidden");
    setConnectionStatus(el, "warn", "Offline");
    setServerStatus("Service unreachable. If you're on Vercel, ensure env var GEMINI_API_KEY is set and redeploy.", "warn");
  }
})();

