import { MODEL, PERSONAS, STORAGE } from "./constants.js";
import { qs } from "./dom.js";
import { escHtml, estTokens, formatElapsed, bytesToHuman } from "./utils.js";
import { downloadExport, buildExportMarkdown } from "./export.js";
import { renderAssistantMarkdown } from "./markdown.js";
import { sendChatToServer, serverHealthCheck } from "./api.js";
import { addMessageBubble, ensureAtBottom, setConnectionStatus, sidebarOpen } from "./ui.js";
import { parseFilesToAttachments, attachmentSummary } from "./attachments.js";

marked.setOptions({ gfm: true, breaks: true });

const el = {
  chat: qs("#chat"),
  prompt: qs("#prompt"),
  sendBtn: qs("#sendBtn"),
  stopBtn: qs("#stopBtn"),
  statusPill: qs("#statusPill"),
  connDot: qs("#connDot"),
  connText: qs("#connText"),
  modelName: qs("#modelName"),

  openSidebar: qs("#openSidebar"),
  closeSidebar: qs("#closeSidebar"),
  sidebar: qs("#sidebar"),
  drawerBackdrop: qs("#drawerBackdrop"),

  serverTestBtn: qs("#serverTestBtn"),
  serverStatus: qs("#serverStatus"),

  personaSelect: qs("#personaSelect"),
  personaHint: qs("#personaHint"),

  newSessionBtn: qs("#newSessionBtn"),
  copyMdBtn: qs("#copyMdBtn"),
  downloadMdBtn: qs("#downloadMdBtn"),

  attachBtn: qs("#attachBtn"),
  fileInput: qs("#fileInput"),
  attachmentsWrap: qs("#attachments"),
  attachmentChips: qs("#attachmentChips"),

  statMessages: qs("#statMessages"),
  statTokens: qs("#statTokens"),
  statLatency: qs("#statLatency"),
  statElapsed: qs("#statElapsed"),
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
  attachments: [],
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

function loadPersona() {
  const saved = localStorage.getItem(STORAGE.persona);
  if (saved && PERSONAS[saved]) state.personaId = saved;
  else state.personaId = "general";
  el.personaSelect.value = state.personaId;
  updatePersonaHint();
}

function updatePersonaHint() {
  el.personaHint.textContent =
    state.personaId === "architect"
      ? "Elite engineering + architecture tone."
      : "Balanced general-purpose assistant.";
}

function savePersona(nextId) {
  state.personaId = PERSONAS[nextId] ? nextId : "general";
  localStorage.setItem(STORAGE.persona, state.personaId);
  updatePersonaHint();
}

function newSession() {
  state.messages = [];
  state.latencySamples = [];
  state.startedAt = Date.now();
  clearAttachments();

  const nodes = Array.from(el.chat.children);
  el.chat.innerHTML = "";
  if (nodes[0]) el.chat.appendChild(nodes[0]);
  ensureAtBottom(el.chat);
  updateStats();
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
    const btn = chip.querySelector("button");
    btn.addEventListener("click", () => {
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
    const next = await parseFilesToAttachments(files, state.attachments);
    state.attachments = next;
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

  el.prompt.value = "";
  autoSize();

  const attachmentLine =
    state.attachments.length > 0
      ? `\n\n[Attachments: ${state.attachments.map((a) => a.name).join(", ")}]`
      : "";

  const userContent = text || "Analyze the attached files.";
  state.messages.push({
    role: "user",
    content: userContent + attachmentLine,
    ts: Date.now(),
    tokens: estTokens(userContent),
  });

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

  try {
    const reply = await sendChatToServer({
      messages: state.messages,
      systemPersona: PERSONAS[state.personaId],
      attachments: state.attachments,
    });

    if (state.stopRequested) throw Object.assign(new Error("Aborted"), { name: "AbortError" });

    renderAssistantMarkdown(assistant.body, reply);

    const dt = Math.round(performance.now() - t0);
    state.latencySamples.push(dt);
    state.messages.push({ role: "assistant", content: reply, ts: Date.now(), tokens: estTokens(reply) });
    updateStats();
    clearAttachments();
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
      setConnectionStatus(el, "warn", "Server error");
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
el.newSessionBtn.addEventListener("click", newSession);

// Attachments
el.attachBtn.addEventListener("click", () => el.fileInput.click());
el.fileInput.addEventListener("change", async () => {
  await addAttachmentsFromFileList(el.fileInput.files);
});

// Drag & drop files onto the chat area
el.chat.addEventListener("dragover", (e) => {
  e.preventDefault();
});
el.chat.addEventListener("drop", async (e) => {
  e.preventDefault();
  if (e.dataTransfer?.files?.length) await addAttachmentsFromFileList(e.dataTransfer.files);
});

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

// Persona
loadPersona();
el.personaSelect.addEventListener("change", () => {
  savePersona(el.personaSelect.value);
  newSession();
});

// Server test
el.serverTestBtn.addEventListener("click", async () => {
  setServerStatus("Testing server…", "info");
  try {
    const health = await serverHealthCheck();
    setServerStatus(
      health?.ok ? "Server OK. Gemini key configured." : "Server reachable, but missing key.",
      health?.ok ? "ok" : "warn",
    );
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

