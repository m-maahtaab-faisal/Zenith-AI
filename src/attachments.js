import { LIMITS } from "./constants.js";
import { arrayBufferToBase64, bytesToHuman } from "./utils.js";

const PDF_WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.js";

function isImage(mime) {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isTextLike(mime, name) {
  if (mime && (mime.startsWith("text/") || mime === "application/json")) return true;
  const ext = String(name || "").toLowerCase().split(".").pop();
  return ["txt", "md", "json", "csv", "log"].includes(ext);
}

function isPdf(mime, name) {
  return mime === "application/pdf" || String(name || "").toLowerCase().endsWith(".pdf");
}

function isDocx(mime, name) {
  return (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    String(name || "").toLowerCase().endsWith(".docx")
  );
}

function clampText(text, maxChars) {
  const s = String(text || "");
  return s.length <= maxChars ? s : `${s.slice(0, maxChars)}\n\n[Truncated to ${maxChars.toLocaleString()} chars]`;
}

async function readAsArrayBuffer(file) {
  return await file.arrayBuffer();
}

async function readAsText(file) {
  return await file.text();
}

async function extractPdfText(arrayBuffer) {
  if (!globalThis.pdfjsLib) throw new Error("PDF parser not loaded");
  globalThis.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  const loadingTask = globalThis.pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((it) => (it && it.str ? String(it.str) : "")).filter(Boolean);
    pageTexts.push(strings.join(" "));
  }
  return pageTexts.join("\n\n");
}

async function extractDocxText(arrayBuffer) {
  if (!globalThis.mammoth) throw new Error("DOCX parser not loaded");
  const res = await globalThis.mammoth.extractRawText({ arrayBuffer });
  return res?.value ?? "";
}

export function attachmentSummary(attachment) {
  if (!attachment) return "";
  const size = attachment.sizeBytes ? bytesToHuman(attachment.sizeBytes) : "";
  return `${attachment.name}${size ? ` · ${size}` : ""}`;
}

export async function parseFilesToAttachments(files, existingAttachments = []) {
  const attachments = [...existingAttachments];

  const totalImageBytesExisting = attachments
    .filter((a) => a.kind === "image")
    .reduce((acc, a) => acc + (a.sizeBytes || 0), 0);

  let totalImageBytes = totalImageBytesExisting;

  for (const file of files) {
    if (attachments.length >= LIMITS.maxAttachments) {
      throw new Error(`Max ${LIMITS.maxAttachments} attachments per message.`);
    }

    const name = file.name || "file";
    const mime = file.type || "";

    if (isImage(mime)) {
      if (file.size > LIMITS.maxImageBytes) {
        throw new Error(`Image too large (${bytesToHuman(file.size)}). Max ${bytesToHuman(LIMITS.maxImageBytes)}.`);
      }
      if (totalImageBytes + file.size > LIMITS.maxTotalImageBytes) {
        throw new Error(`Total image size too large. Max ${bytesToHuman(LIMITS.maxTotalImageBytes)}.`);
      }

      const buf = await readAsArrayBuffer(file);
      const base64 = arrayBufferToBase64(buf);
      attachments.push({
        id: crypto.randomUUID(),
        kind: "image",
        name,
        mime,
        sizeBytes: file.size,
        dataBase64: base64,
      });
      totalImageBytes += file.size;
      continue;
    }

    if (isPdf(mime, name)) {
      const buf = await readAsArrayBuffer(file);
      const text = await extractPdfText(buf);
      attachments.push({
        id: crypto.randomUUID(),
        kind: "text",
        name,
        mime: "application/pdf",
        sizeBytes: file.size,
        text: clampText(text, LIMITS.maxExtractedTextChars),
        note: "Extracted text from PDF",
      });
      continue;
    }

    if (isDocx(mime, name)) {
      const buf = await readAsArrayBuffer(file);
      const text = await extractDocxText(buf);
      attachments.push({
        id: crypto.randomUUID(),
        kind: "text",
        name,
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        sizeBytes: file.size,
        text: clampText(text, LIMITS.maxExtractedTextChars),
        note: "Extracted text from DOCX",
      });
      continue;
    }

    if (isTextLike(mime, name)) {
      const text = await readAsText(file);
      attachments.push({
        id: crypto.randomUUID(),
        kind: "text",
        name,
        mime: mime || "text/plain",
        sizeBytes: file.size,
        text: clampText(text, LIMITS.maxExtractedTextChars),
      });
      continue;
    }

    throw new Error(`Unsupported file type: ${name}`);
  }

  return attachments;
}

