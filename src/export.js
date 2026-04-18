import { MODEL } from "./constants.js";
import { downloadText } from "./utils.js";

export function buildExportMarkdown(messages) {
  const lines = [];
  lines.push(`# Zenith Elite Export`);
  lines.push(`- Model: ${MODEL}`);
  lines.push(`- Exported: ${new Date().toISOString()}`);
  lines.push("");
  for (const m of messages) {
    if (m.role === "system") continue;
    const who = m.role === "user" ? "User" : "Zenith";
    lines.push(`## ${who}`);
    lines.push(m.content || "");
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadExport(messages) {
  const md = buildExportMarkdown(messages);
  const name = `zenith-elite-export-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.md`;
  downloadText(name, md);
}

