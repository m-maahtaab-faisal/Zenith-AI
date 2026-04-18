import { MODEL, PERSONAS, STORAGE } from "./constants.js";
import { qs } from "./dom.js";
import { escHtml, estTokens, formatElapsed } from "./utils.js";
import { buildExportMarkdown, downloadExport } from "./export.js";
import { renderAssistantMarkdown } from "./markdown.js";
import { sendChatToServer, serverHealthCheck } from "./api.js";
import { addMessageBubble, ensureAtBottom, setConnectionStatus, sidebarOpen } from "./ui.js";

marked.setOptions({ gfm: true, breaks: true });

const el = {
  chat: qs("#chat"),
  prompt: qs("#prompt"),
  sendBtn: qs("#sendBtn"),
  stopBtn: qs("#stopBtn"),
  statusPill: qs("#statusPill"),
  connDot: qs("#connDot"),
  connText: qs("#connText"),
  serverTestBtn: qs("#serverTestBtn"),
  serverStatus: qs("#serverStatus"),
  personaSelect: qs("#personaSelect"),
  personaHint: qs("#personaHint"),
  statMessages: qs("#statMessages"),
  statTokens: qs("#statTokens"),
  statLatency: qs("#statLatency"),
  statElapsed: qs("#statElapsed"),
  newSessionBtn: qs("#newSessionBtn"),
  copyMdBtn: qs("#copyMdBtn"),
  downloadMdBtn: qs("#downloadMdBtn"),
  modelName: qs("#modelName"),
  openSidebar: qs("#openSidebar"),
  closeSidebar: qs("#closeSidebar"),
  sidebar: qs("#sidebar"),
  drawerBackdrop: qs("#drawerBackdrop"),
};

el.modelName.textContent = MODEL;

const state = {
  busy: false,
  abort: null,
  stopRequested: false,
  messages: [],
  startedAt: Date.now(),
  latencySamples: [],
  personaId: "general",
};

function setServerStatus(msg, kind = "info") {
  const color =
    kind === "ok"
      ? "text-emerald-300"
      : kind === "bad"
        ? "text-rose-300"
        : kind === "warn"
          ? "text-amber-300"
          : "text-white/60";
  el.serverStatus.className = `mt-3 text-xs ${color}`;
  el.serverStatus.textContent = msg;
}

function setBusy(busy) {
  state.busy = busy;
  el.sendBtn.disabled = busy;
  if (busy) {
    el.stopBtn.classList.remove("hidden");
    setConnectionStatus(el, "busy", "Generating…");
  } else {
    el.stopBtn.classList.add("hidden");
    setConnectionStatus(el, "ok", "Server mode");
  }
}

function updateStats() {
  const msgCount = state.messages.filter((m) => m.role !== "system").length;
  el.statMessages.textContent = String(msgCount);
  const tokenSum = state.messages.reduce((acc, m) => acc + (m.tokens || 0), 0);
  el.statTokens.textContent = String(tokenSum);
  const avg =
    state.latencySamples.length > 0
      ? state.latencySamples.reduce((a, b) => a + b, 0) / state.latencySamples.length
      : null;
  el.statLatency.textContent = avg ? `${Math.round(avg)}ms` : "—";
}

function autoSize() {
  el.prompt.style.height = "0px";
  const next = Math.min(220, Math.max(56, el.prompt.scrollHeight));
  el.prompt.style.height = `${next}px`;
}

function newSession() {
  state.messages = [];
  state.latencySamples = [];
  state.startedAt = Date.now();

  const nodes = Array.from(el.chat.children);
  el.chat.innerHTML = "";
  if (nodes[0]) el.chat.appendChild(nodes[0]);
  ensureAtBottom(el.chat);
  updateStats();
}

async function sendMessage() {
  const text = el.prompt.value.trim();
  if (!text) return;
  if (state.busy) return;

  el.prompt.value = "";
  autoSize();

  state.messages.push({ role: "user", content: text, ts: Date.now(), tokens: estTokens(text) });
  addMessageBubble(el.chat, { role: "user", label: "You", text });
  updateStats();

  const assistant = addMessageBubble(el.chat, {
    role: "assistant",
    label: "Zenith",
    html: `<span class="dots" aria-label="Zenith is thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`,
    streaming: true,
  });

  setBusy(true);
  const t0 = performance.now();
  state.abort = new AbortController();
  state.stopRequested = false;

  let acc = "";
  try {
    // Non-streaming (server-side call). We show a premium "thinking" indicator while awaiting.
    acc = await sendChatToServer({ messages: state.messages, systemPersona: PERSONAS[state.personaId] });
    if (state.stopRequested) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    renderAssistantMarkdown(assistant.body, acc);

    const dt = Math.round(performance.now() - t0);
    state.latencySamples.push(dt);
    state.messages.push({ role: "assistant", content: acc, ts: Date.now(), tokens: estTokens(acc) });
    updateStats();
  } catch (e) {
    const isAbort = state.stopRequested || String(e?.name || "").toLowerCase().includes("abort");
    if (isAbort) {
      assistant.body.innerHTML = `<div class="text-xs text-white/60">Stopped.</div>`;
      setConnectionStatus(el, "ok", "Server mode");
    } else {
      const msg = String(e?.message || e);
      assistant.body.innerHTML =
        `<div class="text-rose-200 text-sm">Generation failed.</div>` +
        `<div class="mt-2 text-xs text-white/60">${escHtml(msg)}</div>`;
      setConnectionStatus(el, "warn", "Generation error");
    }
  } finally {
    setBusy(false);
    state.abort = null;
    state.stopRequested = false;
    ensureAtBottom(el.chat);
  }
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
el.drawerBackdrop?.addEventListener("click", () =>
  sidebarOpen({ sidebar: el.sidebar, drawerBackdrop: el.drawerBackdrop }, false),
);

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
el.newSessionBtn.addEventListener("click", newSession);

// Export
el.copyMdBtn.addEventListener("click", async () => {
  const md = buildExportMarkdown(state.messages);
  try {
    await navigator.clipboard.writeText(md);
    el.copyMdBtn.textContent = "Copied";
    setTimeout(() => (el.copyMdBtn.textContent = "Copy"), 900);
  } catch {
    el.copyMdBtn.textContent = "Denied";
    setTimeout(() => (el.copyMdBtn.textContent = "Copy"), 900);
  }
});
el.downloadMdBtn.addEventListener("click", () => downloadExport(state.messages));

// Server test
el.serverTestBtn.addEventListener("click", async () => {
  setServerStatus("Testing server…", "info");
  try {
    const health = await serverHealthCheck();
    setServerStatus(health?.ok ? "Server OK. Gemini key configured." : "Server reachable, but not OK.", health?.ok ? "ok" : "warn");
    setConnectionStatus(el, health?.ok ? "ok" : "warn", health?.ok ? "Server mode" : "Server needs config");
  } catch (e) {
    setServerStatus(`Server test failed: ${String(e?.message || e)}`, "bad");
    setConnectionStatus(el, "warn", "Server error");
  }
});

// Elapsed timer
setInterval(() => {
  el.statElapsed.textContent = formatElapsed(Date.now() - state.startedAt);
}, 250);

// Init
autoSize();
updateStats();
setBusy(false);
setConnectionStatus(el, "ok", "Server mode");
setServerStatus("Set GEMINI_API_KEY in Netlify → Site settings → Environment variables.", "warn");

function loadPersona() {
  const saved = localStorage.getItem(STORAGE.persona);
  if (saved && PERSONAS[saved]) state.personaId = saved;
  else state.personaId = "general";
  if (el.personaSelect) el.personaSelect.value = state.personaId;
  if (el.personaHint) {
    el.personaHint.textContent =
      state.personaId === "architect"
        ? "Elite engineering + architecture tone."
        : "Balanced general-purpose assistant.";
  }
}

function savePersona(nextId) {
  state.personaId = PERSONAS[nextId] ? nextId : "general";
  localStorage.setItem(STORAGE.persona, state.personaId);
  if (el.personaHint) {
    el.personaHint.textContent =
      state.personaId === "architect"
        ? "Elite engineering + architecture tone."
        : "Balanced general-purpose assistant.";
  }
}

loadPersona();
el.personaSelect?.addEventListener("change", () => {
  savePersona(el.personaSelect.value);
  // Keep UI clean: switching persona starts a new session (like changing system prompt).
  newSession();
});
