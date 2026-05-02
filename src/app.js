import { MODEL, PERSONAS, STORAGE } from "./constants.js";
import { qs, escHtml, estTokens, formatElapsed, bytesToHuman, downloadText } from "./utils.js";
import { buildExportMarkdown, downloadExport } from "./export.js";
import { renderMarkdown } from "./markdown.js";
import { sendChatToServer, serverHealthCheck } from "./api.js";
import { parseFiles, chipLabel } from "./attachments.js";

if (typeof globalThis.marked !== "undefined" && typeof globalThis.marked.setOptions === "function") {
  globalThis.marked.setOptions({ gfm: true, breaks: true });
}

// ─── DOM refs ──────────────────────────────────────────────────────
const el = {
  chat:           qs("#chat"),
  prompt:         qs("#prompt"),
  sendBtn:        qs("#sendBtn"),
  stopBtn:        qs("#stopBtn"),
  attachBtn:      qs("#attachBtn"),
  fileInput:      qs("#fileInput"),
  attachWrap:     qs("#attachments"),
  chips:          qs("#attachmentChips"),
  statusPill:     qs("#statusPill"),
  connDot:        qs("#connDot"),
  connText:       qs("#connText"),
  modelName:      qs("#modelName"),
  openSidebar:    qs("#openSidebar"),
  closeSidebar:   qs("#closeSidebar"),
  sidebar:        qs("#sidebar"),
  backdrop:       qs("#drawerBackdrop"),
  newSessionBtn:  qs("#newSessionBtn"),
  sessionsList:   qs("#sessionsList"),
  servicePanel:   qs("#servicePanel"),
  serverTestBtn:  qs("#serverTestBtn"),
  serverStatus:   qs("#serverStatus"),
  personaSelect:  qs("#personaSelect"),
  personaHint:    qs("#personaHint"),
  copyMdBtn:      qs("#copyMdBtn"),
  downloadMdBtn:  qs("#downloadMdBtn"),
  statElapsed:    qs("#statElapsed"),
  chatTitle:      qs("#chatTitle"),
  clearChatBtn:   qs("#clearChatBtn"),
};

el.modelName.textContent = MODEL;

// ─── State ─────────────────────────────────────────────────────────
const state = {
  busy: false,
  stopRequested: false,
  personaId: "general",
  attachments: [],
  sessions: [],
  activeId: null,
  startedAt: Date.now(),
};

// ─── Status helpers ────────────────────────────────────────────────
function setStatus(kind, label) {
  const dots = { off: "", ok: "ok", busy: "busy", warn: "warn" };
  el.connDot.className = `status-dot ${dots[kind] || ""}`;
  el.connText.textContent = label;
  const pills = { off: "Standby", ok: "Online", busy: "Thinking", warn: "Attention" };
  el.statusPill.textContent = pills[kind] || "Standby";
}

function setServerMsg(msg, kind = "info") {
  el.serverStatus.className = `text-xs mb-2 ${kind === "ok" ? "text-emerald-400" : kind === "bad" ? "text-red-400" : kind === "warn" ? "text-yellow-400" : "text-white/60"}`;
  el.serverStatus.textContent = msg;
}

function setBusy(busy) {
  state.busy = busy;
  el.sendBtn.disabled = busy;
  if (busy) {
    el.stopBtn.classList.remove("hidden");
    setStatus("busy", "Generating…");
  } else {
    el.stopBtn.classList.add("hidden");
    setStatus("ok", "Online");
  }
}

// ─── Auto-size textarea ────────────────────────────────────────────
function autoSize() {
  el.prompt.style.height = "0";
  el.prompt.style.height = Math.min(200, Math.max(52, el.prompt.scrollHeight)) + "px";
}

// ─── Scroll to bottom ──────────────────────────────────────────────
function scrollBottom() {
  el.chat.scrollTop = el.chat.scrollHeight;
}

// ─── Sessions ──────────────────────────────────────────────────────
function saveSessions() {
  try { localStorage.setItem(STORAGE.sessions, JSON.stringify(state.sessions)); } catch {}
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE.sessions);
    state.sessions = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(state.sessions)) state.sessions = [];
  } catch { state.sessions = []; }
}

function getSession(id) {
  return state.sessions.find((s) => s.id === id) || null;
}

function getActive() {
  return getSession(state.activeId);
}

function titleFromMessages(messages) {
  const first = (messages || []).find((m) => m.role === "user" && m.content);
  const t = String(first?.content || "New chat").trim().replace(/\s+/g, " ");
  return t.length > 44 ? t.slice(0, 44) + "…" : t;
}

function updateSessionMeta(session) {
  session.updatedAt = Date.now();
  session.messageCount = (session.messages || []).filter((m) => m.role !== "system").length;
  if (!session.title || session.title === "New chat")
    session.title = titleFromMessages(session.messages);
}

/** Create a new session ONLY if called explicitly by user */
function createSession() {
  const s = {
    id: crypto.randomUUID(),
    title: "New chat",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    personaId: state.personaId,
    messages: [],
    messageCount: 0,
  };
  state.sessions.unshift(s);
  return s;
}

/** Switch to a session and re-render chat */
function switchSession(id) {
  const s = getSession(id);
  if (!s) return;
  state.activeId = id;
  state.personaId = PERSONAS[s.personaId] ? s.personaId : "general";
  el.personaSelect.value = state.personaId;
  updatePersonaHint();
  clearAttachments();
  renderChat(s);
  renderSessions();
  updateChatTitle(s);
  sidebarClose();
}

function renderSessions() {
  el.sessionsList.innerHTML = "";
  const sorted = [...state.sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const s of sorted) {
    const active = s.id === state.activeId;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `session-item${active ? " active" : ""}`;
    btn.innerHTML = `
      <span class="session-dot"></span>
      <span class="session-item-inner">
        <span class="session-title">${escHtml(s.title || "New chat")}</span>
        <span class="session-meta">${s.messageCount ?? 0} messages</span>
      </span>
      <button type="button" class="session-del" data-id="${s.id}" title="Delete chat">×</button>
    `;
    btn.addEventListener("click", (e) => {
      if (e.target.closest(".session-del")) return;
      switchSession(s.id);
    });
    btn.querySelector(".session-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    el.sessionsList.appendChild(btn);
  }
}

function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (state.activeId === id) {
    if (state.sessions.length === 0) {
      const s = createSession();
      state.activeId = s.id;
    } else {
      state.activeId = state.sessions[0].id;
    }
    const s = getActive();
    renderChat(s);
    updateChatTitle(s);
  }
  saveSessions();
  renderSessions();
}

function updateChatTitle(session) {
  el.chatTitle.textContent = session?.title || "New conversation";
}

// ─── Chat rendering ────────────────────────────────────────────────
function renderChat(session) {
  el.chat.innerHTML = "";

  // Welcome message
  const welcome = document.createElement("div");
  welcome.className = "message-row assistant-row";
  welcome.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 32 32" fill="none" width="16" height="16">
        <path d="M16 3L28 26H4L16 3Z" stroke="url(#gw)" stroke-width="1.8" stroke-linejoin="round" fill="rgba(255,255,255,0.04)"/>
        <defs><linearGradient id="gw" x1="4" y1="3" x2="28" y2="26" gradientUnits="userSpaceOnUse"><stop stop-color="#7dd3fc"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
      </svg>
    </div>
    <div class="bubble assistant-bubble">
      <span class="bubble-name">Zenith</span>
      <div class="bubble-body markdown">
        <p>Hello! I'm <strong>Zenith</strong>. Ask me anything or drop a file — I read PDFs, images, DOCX, and more.</p>
      </div>
    </div>
  `;
  el.chat.appendChild(welcome);

  for (const m of session?.messages || []) {
    if (m.role === "user") appendUserBubble(m.content);
    else if (m.role === "assistant") {
      const b = appendAssistantBubble();
      renderMarkdown(b, m.content);
    }
  }
  scrollBottom();
}

function appendUserBubble(text) {
  const row = document.createElement("div");
  row.className = "message-row user-row";
  row.innerHTML = `
    <div class="bubble user-bubble">
      <span class="bubble-name">You</span>
      <div class="bubble-body" style="white-space:pre-wrap">${escHtml(text)}</div>
    </div>
  `;
  el.chat.appendChild(row);
  scrollBottom();
  return row;
}

function appendAssistantBubble(html = "") {
  const row = document.createElement("div");
  row.className = "message-row assistant-row";
  row.innerHTML = `
    <div class="avatar">
      <svg viewBox="0 0 32 32" fill="none" width="16" height="16">
        <path d="M16 3L28 26H4L16 3Z" stroke="url(#gb)" stroke-width="1.8" stroke-linejoin="round" fill="rgba(255,255,255,0.04)"/>
        <defs><linearGradient id="gb" x1="4" y1="3" x2="28" y2="26" gradientUnits="userSpaceOnUse"><stop stop-color="#7dd3fc"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
      </svg>
    </div>
    <div class="bubble assistant-bubble">
      <span class="bubble-name">Zenith</span>
      <div class="bubble-body markdown">${html}</div>
    </div>
  `;
  el.chat.appendChild(row);
  scrollBottom();
  return row.querySelector(".bubble-body");
}

// ─── Attachments ───────────────────────────────────────────────────
function clearAttachments() {
  state.attachments = [];
  el.fileInput.value = "";
  renderChips();
}

function renderChips() {
  const has = state.attachments.length > 0;
  el.attachWrap.classList.toggle("hidden", !has);
  el.chips.innerHTML = "";
  for (const att of state.attachments) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span class="chip-kind">${att.kind === "image" ? "IMG" : "DOC"}</span>
      <span class="chip-name" title="${escHtml(att.name)}">${escHtml(att.name)}</span>
      <span style="font-size:10px;color:var(--text-3)">${att.sizeBytes ? bytesToHuman(att.sizeBytes) : ""}</span>
      <button type="button" class="chip-del" aria-label="Remove">×</button>
    `;
    chip.querySelector(".chip-del").addEventListener("click", () => {
      state.attachments = state.attachments.filter((a) => a.id !== att.id);
      renderChips();
    });
    el.chips.appendChild(chip);
  }
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  try {
    state.attachments = await parseFiles(files, state.attachments);
    renderChips();
  } catch (e) {
    appendAssistantBubble(`<div style="color:var(--danger);font-size:13px;">Attachment error: ${escHtml(String(e?.message || e))}</div>`);
  }
}

// ─── Persona ───────────────────────────────────────────────────────
function loadPersona() {
  const saved = localStorage.getItem(STORAGE.persona);
  state.personaId = PERSONAS[saved] ? saved : "general";
  el.personaSelect.value = state.personaId;
  updatePersonaHint();
}

function updatePersonaHint() {
  el.personaHint.textContent = state.personaId === "architect"
    ? "Optimized for engineering & architecture."
    : "All-purpose assistant mode.";
}

function savePersona(id) {
  state.personaId = PERSONAS[id] ? id : "general";
  localStorage.setItem(STORAGE.persona, state.personaId);
  updatePersonaHint();
}

// ─── Sidebar ───────────────────────────────────────────────────────
function sidebarOpen() {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  el.sidebar.classList.add("open");
  el.backdrop.classList.remove("hidden");
}

function sidebarClose() {
  el.sidebar.classList.remove("open");
  el.backdrop.classList.add("hidden");
}

// ─── Send message ──────────────────────────────────────────────────
async function sendMessage() {
  const text = el.prompt.value.trim();
  if (!text && state.attachments.length === 0) return;
  if (state.busy) return;

  // Get or use existing session — do NOT auto-create empty sessions
  let session = getActive();
  if (!session) {
    session = createSession();
    state.activeId = session.id;
    state.sessions.unshift(session);
  }

  el.prompt.value = "";
  autoSize();

  const userContent = text || "Analyze the attached files.";
  session.messages.push({ role: "user", content: userContent, ts: Date.now() });
  appendUserBubble(userContent);

  // Show attachment notice inline
  if (state.attachments.length > 0) {
    const names = state.attachments.map((a) => a.name).join(", ");
    appendAssistantBubble(`<div style="font-size:12px;color:var(--text-3);">Attached: ${escHtml(names)}</div>`);
  }

  updateSessionMeta(session);
  saveSessions();
  renderSessions();
  updateChatTitle(session);

  // Thinking indicator
  const bodyEl = appendAssistantBubble(
    `<span class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`
  );

  setBusy(true);
  state.stopRequested = false;
  const t0 = performance.now();

  try {
    const reply = await sendChatToServer({
      messages: session.messages,
      systemPersona: PERSONAS[state.personaId],
      attachments: state.attachments,
    });

    if (state.stopRequested) throw Object.assign(new Error("Stopped"), { name: "AbortError" });

    renderMarkdown(bodyEl, reply);
    session.messages.push({ role: "assistant", content: reply, ts: Date.now() });
    updateSessionMeta(session);
    saveSessions();
    renderSessions();
    updateChatTitle(session);
    clearAttachments();
  } catch (e) {
    const aborted = state.stopRequested || e?.name === "AbortError";
    if (aborted) {
      bodyEl.innerHTML = `<span style="font-size:12px;color:var(--text-3);">Stopped.</span>`;
    } else {
      const msg = String(e?.message || e);
      bodyEl.innerHTML = `<div style="color:var(--danger);margin-bottom:6px;font-size:13px;">Generation failed.</div><div style="font-size:12px;color:var(--text-2);">${escHtml(msg)}</div>`;
      setStatus("warn", "Error");
      el.servicePanel.classList.remove("hidden");
      setServerMsg(msg, "warn");
    }
  } finally {
    setBusy(false);
    state.stopRequested = false;
    scrollBottom();
    const dt = Math.round(performance.now() - t0);
    if (el.statElapsed) el.statElapsed.textContent = formatElapsed(Date.now() - state.startedAt);
  }
}

// ─── Clear current chat ────────────────────────────────────────────
function clearCurrentChat() {
  const s = getActive();
  if (!s) return;
  if (s.messages.length === 0) return;
  if (!confirm("Clear this chat?")) return;
  s.messages = [];
  s.messageCount = 0;
  s.title = "New chat";
  s.updatedAt = Date.now();
  saveSessions();
  renderSessions();
  renderChat(s);
  updateChatTitle(s);
}

// ─── New chat (only when user clicks) ─────────────────────────────
function handleNewChat() {
  // If the current active session is already empty, just stay on it
  const cur = getActive();
  if (cur && cur.messages.length === 0) {
    sidebarClose();
    el.prompt.focus();
    return;
  }
  const s = createSession();
  state.activeId = s.id;
  saveSessions();
  renderSessions();
  renderChat(s);
  updateChatTitle(s);
  clearAttachments();
  sidebarClose();
  el.prompt.focus();
}

// ─── Init sessions ─────────────────────────────────────────────────
function initSessions() {
  loadSessions();
  if (state.sessions.length === 0) {
    const s = createSession();
    state.activeId = s.id;
    saveSessions();
  } else {
    state.activeId = state.sessions[0].id;
  }
  renderSessions();
  renderChat(getActive());
  updateChatTitle(getActive());
}

// ─── Event bindings ────────────────────────────────────────────────
el.openSidebar?.addEventListener("click", sidebarOpen);
el.closeSidebar?.addEventListener("click", sidebarClose);
el.backdrop?.addEventListener("click", sidebarClose);

el.prompt.addEventListener("input", autoSize);
el.prompt.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === "Escape") { state.stopRequested = true; }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") state.stopRequested = true; });

el.sendBtn.addEventListener("click", sendMessage);
el.stopBtn.addEventListener("click", () => { state.stopRequested = true; });

el.attachBtn.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", () => handleFiles(el.fileInput.files));

// Drag & drop onto chat
el.chat.addEventListener("dragover", (e) => e.preventDefault());
el.chat.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
});

el.newSessionBtn.addEventListener("click", handleNewChat);
el.clearChatBtn.addEventListener("click", clearCurrentChat);

el.personaSelect.addEventListener("change", () => {
  savePersona(el.personaSelect.value);
  const s = getActive();
  if (s) { s.personaId = state.personaId; saveSessions(); }
});

el.copyMdBtn.addEventListener("click", async () => {
  const md = buildExportMarkdown(getActive()?.messages || []);
  try {
    await navigator.clipboard.writeText(md);
    el.copyMdBtn.textContent = "Copied!";
  } catch { el.copyMdBtn.textContent = "Error"; }
  setTimeout(() => (el.copyMdBtn.textContent = "Copy MD"), 1200);
});

el.downloadMdBtn.addEventListener("click", () => downloadExport(getActive()?.messages || []));

el.serverTestBtn.addEventListener("click", async () => {
  setServerMsg("Checking…");
  try {
    const h = await serverHealthCheck();
    el.servicePanel.classList.toggle("hidden", !!h?.ok);
    setStatus(h?.ok ? "ok" : "warn", h?.ok ? "Online" : "Needs setup");
    setServerMsg(h?.ok ? "Service is ready." : "Missing OPENROUTER_API_KEY.", h?.ok ? "ok" : "warn");
  } catch (e) {
    el.servicePanel.classList.remove("hidden");
    setStatus("warn", "Offline");
    setServerMsg(String(e?.message || e), "bad");
  }
});

// ─── Bootstrap ─────────────────────────────────────────────────────
loadPersona();
autoSize();
initSessions();
setStatus("ok", "Online");

// Quiet health check
(async () => {
  try {
    const h = await serverHealthCheck();
    if (!h?.ok) {
      el.servicePanel.classList.remove("hidden");
      setStatus("warn", "Needs setup");
      setServerMsg("Set OPENROUTER_API_KEY in Vercel → Settings → Environment Variables, then redeploy.", "warn");
    } else {
      el.servicePanel.classList.add("hidden");
    }
  } catch {
    el.servicePanel.classList.remove("hidden");
    setStatus("warn", "Offline");
    setServerMsg("Service unreachable. Check OPENROUTER_API_KEY in Vercel environment variables.", "warn");
  }
})();
