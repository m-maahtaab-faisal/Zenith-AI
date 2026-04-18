import { escHtml } from "./utils.js";

export function ensureAtBottom(chatEl) {
  chatEl.scrollTop = chatEl.scrollHeight;
}

export function setConnectionStatus({ connDot, connText, statusPill }, kind, text) {
  const map = {
    off: { dot: "bg-white/25", pill: "Standby" },
    ok: { dot: "bg-emerald-400", pill: "Ready" },
    busy: { dot: "bg-amber-400", pill: "Thinking" },
    warn: { dot: "bg-rose-400", pill: "Attention" },
  };
  const v = map[kind] ?? map.off;
  connDot.className = `inline-block h-2 w-2 rounded-full ${v.dot}`;
  connText.textContent = text ?? (kind === "ok" ? "Connected" : "API key required");
  statusPill.textContent = v.pill;
}

export function sidebarOpen({ sidebar, drawerBackdrop }, open) {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  if (open) {
    sidebar.classList.remove("-translate-x-[110%]");
    drawerBackdrop.classList.remove("hidden");
  } else {
    sidebar.classList.add("-translate-x-[110%]");
    drawerBackdrop.classList.add("hidden");
  }
}

export function addMessageBubble(chatEl, { role, label, html, text, streaming = false }) {
  const row = document.createElement("div");
  row.className = `flex gap-3 ${role === "user" ? "justify-end" : ""} animate-slideUp`;

  if (role !== "user") {
    const avatar = document.createElement("div");
    avatar.className = "h-9 w-9 rounded-2xl glass grid place-items-center border border-white/10 shrink-0";
    avatar.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" class="h-4 w-4">
        <path d="M12 2l2.2 6.5H21l-5.4 3.9 2.1 6.6L12 15.6 6.3 19l2.1-6.6L3 8.5h6.8L12 2z"
          stroke="rgba(255,255,255,0.85)" stroke-width="1.35" stroke-linejoin="round" />
      </svg>
    `;
    row.appendChild(avatar);
  }

  const bubble = document.createElement("div");
  bubble.className =
    role === "user"
      ? "glass rounded-3xl px-4 py-3 border border-white/10 max-w-[920px] ml-auto"
      : "glass rounded-3xl px-4 py-3 border border-white/10 max-w-[920px]";

  const who = document.createElement("div");
  who.className = "text-xs text-white/55";
  who.textContent = label;

  const body = document.createElement("div");
  body.className = role === "assistant" ? "mt-1 markdown text-sm text-white/85" : "mt-1 text-sm text-white/85";

  if (html != null) body.innerHTML = html;
  else if (text != null) {
    if (streaming) body.textContent = text;
    else body.innerHTML = escHtml(text).replaceAll("\n", "<br/>");
  }

  bubble.appendChild(who);
  bubble.appendChild(body);
  row.appendChild(bubble);
  chatEl.appendChild(row);
  ensureAtBottom(chatEl);
  return { row, bubble, body };
}

