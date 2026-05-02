import { LIMITS } from "./constants.js";
import { arrayBufferToBase64, bytesToHuman } from "./utils.js";

function isImage(mime) { return typeof mime === "string" && mime.startsWith("image/"); }
function isTextLike(mime, name) {
  if (mime && (mime.startsWith("text/") || mime === "application/json")) return true;
  return ["txt", "md", "json", "csv", "log"].includes(String(name || "").split(".").pop().toLowerCase());
}
function isPdf(mime, name) {
  return mime === "application/pdf" || String(name || "").toLowerCase().endsWith(".pdf");
}
function isDocx(mime, name) {
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || String(name || "").toLowerCase().endsWith(".docx");
}
function clamp(text, max) {
  const s = String(text || "");
  return s.length <= max ? s : `${s.slice(0, max)}\n\n[Truncated to ${max.toLocaleString()} chars]`;
}

async function extractPdfText(buf) {
  if (!globalThis.pdfjsLib) throw new Error("PDF.js not loaded");
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str || "").join(" "));
  }
  return pages.join("\n\n");
}

async function extractDocxText(buf) {
  if (!globalThis.mammoth) throw new Error("Mammoth not loaded");
  return (await mammoth.extractRawText({ arrayBuffer: buf }))?.value ?? "";
}

export function chipLabel(att) {
  const size = att.sizeBytes ? bytesToHuman(att.sizeBytes) : "";
  return `${att.name}${size ? ` · ${size}` : ""}`;
}

export async function parseFiles(files, existing = []) {
  const list = [...existing];
  let imgBytes = list.filter((a) => a.kind === "image").reduce((s, a) => s + (a.sizeBytes || 0), 0);

  for (const file of files) {
    if (list.length >= LIMITS.maxAttachments)
      throw new Error(`Max ${LIMITS.maxAttachments} attachments per message.`);

    const name = file.name || "file";
    const mime = file.type || "";

    if (isImage(mime)) {
      if (file.size > LIMITS.maxImageBytes)
        throw new Error(`Image too large (${bytesToHuman(file.size)}). Max ${bytesToHuman(LIMITS.maxImageBytes)}.`);
      if (imgBytes + file.size > LIMITS.maxTotalImageBytes)
        throw new Error(`Total image size exceeds limit.`);
      const base64 = arrayBufferToBase64(await file.arrayBuffer());
      list.push({ id: crypto.randomUUID(), kind: "image", name, mime, sizeBytes: file.size, dataBase64: base64 });
      imgBytes += file.size;
      continue;
    }

    if (isPdf(mime, name)) {
      const buf = await file.arrayBuffer();
      const text = await extractPdfText(buf);
      list.push({ id: crypto.randomUUID(), kind: "text", name, mime: "application/pdf", sizeBytes: file.size, text: clamp(text, LIMITS.maxExtractedTextChars), note: "Extracted from PDF" });
      continue;
    }

    if (isDocx(mime, name)) {
      const buf = await file.arrayBuffer();
      const text = await extractDocxText(buf);
      list.push({ id: crypto.randomUUID(), kind: "text", name, mime, sizeBytes: file.size, text: clamp(text, LIMITS.maxExtractedTextChars), note: "Extracted from DOCX" });
      continue;
    }

    if (isTextLike(mime, name)) {
      const text = await file.text();
      list.push({ id: crypto.randomUUID(), kind: "text", name, mime: mime || "text/plain", sizeBytes: file.size, text: clamp(text, LIMITS.maxExtractedTextChars) });
      continue;
    }

    throw new Error(`Unsupported file type: ${name}`);
  }

  return list;
}
