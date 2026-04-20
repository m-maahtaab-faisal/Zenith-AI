export function renderAssistantMarkdown(targetEl, md) {
  const rawHtml = marked.parse(md ?? "");
  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ["href", "title", "target", "rel", "class"],
  });

  targetEl.innerHTML = clean;

  targetEl.querySelectorAll("a[href]").forEach((a) => {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  });

  targetEl.querySelectorAll("pre code").forEach((codeEl) => {
    try {
      hljs.highlightElement(codeEl);
    } catch {}
  });

  targetEl.querySelectorAll("pre").forEach((pre) => {
    if (pre.dataset.enhanced === "1") return;
    pre.dataset.enhanced = "1";
    pre.classList.add("codeblock");
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = (code ? code.innerText : pre.innerText) || "";
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = "Copied";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      } catch {
        btn.textContent = "Denied";
        setTimeout(() => (btn.textContent = "Copy"), 900);
      }
    });
    pre.appendChild(btn);
  });
}

