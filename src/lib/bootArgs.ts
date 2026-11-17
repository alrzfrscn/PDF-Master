import type { PaperTemplate } from "./types";

/**
 * Desktop launch contract, shared by URL query (`?new=A4+Landscape&fullscreen=1`)
 * and PDFAnnotator.exe-style arguments (`--new "A4 Landscape" --fullscreen`).
 */
export interface BootArgs {
  /** Requested paper recipe, e.g. "A4 Landscape". */
  newDoc: string | null;
  fullscreen: boolean;
  print: boolean;
}

const NEW_KEYS = new Set(["new", "newdoc", "new-doc"]);

function isOn(value: string | null): boolean {
  return value === null || value === "" || ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

/** Splits on whitespace outside quotes, dropping the quotes themselves. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (const char of input) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export function parseBootArgs(input: string): BootArgs {
  const raw = input.trim();
  const args: BootArgs = { newDoc: null, fullscreen: false, print: false };
  if (!raw) return args;

  // A query string, or a bare `key=value` list.
  if (raw.startsWith("?") || (!raw.startsWith("-") && !raw.startsWith("/") && raw.includes("="))) {
    for (const [key, value] of new URLSearchParams(raw)) {
      const name = key.replace(/^--?/, "").toLowerCase();
      if (NEW_KEYS.has(name)) args.newDoc = value.trim() || null;
      else if (name === "fullscreen") args.fullscreen = isOn(value);
      else if (name === "print") args.print = isOn(value);
    }
    return args;
  }

  const tokens = tokenize(raw);
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(?:--?|\/)([a-z-]+)(?:[:=](.*))?$/i.exec(tokens[index]);
    if (!match) continue;
    const name = match[1].toLowerCase();
    const inline = match[2];
    if (NEW_KEYS.has(name)) {
      const next = inline ?? tokens[index + 1] ?? "";
      if (inline === undefined) index += 1;
      const value = next.trim();
      if (value) args.newDoc = value;
    } else if (name === "fullscreen") {
      args.fullscreen = isOn(inline ?? null);
    } else if (name === "print") {
      args.print = isOn(inline ?? null);
    }
  }
  return args;
}

const STYLE_RANK = ["blank", "ruled", "squared", "grid"];

/** Maps a requested size to a shipped paper recipe, preferring the least busy style. */
export function resolvePaperTarget(
  request: string,
  templates: PaperTemplate[],
): { templateId: string; landscape: boolean } | null {
  const normalized = request.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return null;

  const exact = templates.find((template) => template.name.toLowerCase() === normalized);
  if (exact) return { templateId: exact.id, landscape: exact.page.landscape };

  const landscape = /\b(landscape|wide)\b/.test(normalized);
  const pool = templates.filter((template) => normalized.includes(template.page.size.toLowerCase()));
  if (pool.length === 0) return null;

  const ranked = [...pool].sort(
    (a, b) =>
      (STYLE_RANK.indexOf(a.styleLabel.toLowerCase()) + 1 || 99) -
      (STYLE_RANK.indexOf(b.styleLabel.toLowerCase()) + 1 || 99),
  );
  return { templateId: ranked[0].id, landscape };
}
