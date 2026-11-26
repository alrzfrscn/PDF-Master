import "katex/dist/katex.min.css";
import DOMPurify from "dompurify";
import katex from "katex";
import { marked, type Token } from "marked";
import { PDFDocument } from "pdf-lib";
import { rasterizeHtml } from "./raster";
import type { ThemeName } from "./types";

/** Inline/block math is parked behind private-use markers while marked parses. */
const MATH_START = "\uE000";
const MATH_END = "\uE001";
const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?!\$)([^$\n]+?)\$(?!\$)/g;

interface MathFormula {
  tex: string;
  display: boolean;
}

export interface MarkdownHeading {
  id: string;
  title: string;
  level: number;
  /** 1-based line in the source. */
  line: number;
}

export interface MarkdownStats {
  words: number;
  minutes: number;
}

interface WalkableToken {
  type: string;
  text?: string;
  tokens?: WalkableToken[];
  items?: WalkableToken[];
  header?: WalkableToken[][];
  rows?: WalkableToken[][];
}

function slugBase(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[`*_~[\]()#>!]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function uniqueSlug(text: string, used: Map<string, number>): string {
  const base = slugBase(text);
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

/** Strips inline Markdown markers so an id and a sidebar title read the same. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

export function extractMarkdownHeadings(content: string): MarkdownHeading[] {
  const lines = content.split(/\r?\n/);
  const used = new Map<string, number>();
  const headings: MarkdownHeading[] = [];
  let fence: string | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const title = stripInlineMarkdown(match[2]);
    if (!title) continue;
    headings.push({ id: uniqueSlug(title, used), title, level: match[1].length, line: index + 1 });
  }
  return headings;
}

/** Toggles the checkbox at `index` in the Markdown source, ignoring fenced code. */
export function toggleMarkdownTask(content: string, index: number): string {
  const lines = content.split("\n");
  let fence: string | null = null;
  let seen = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const match = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/.exec(line);
    if (!match) continue;
    if (seen === index) {
      const checked = match[2].toLowerCase() === "x";
      lines[lineIndex] = line.replace(match[0], `${match[1]}${checked ? " " : "x"}${match[3]}`);
      return lines.join("\n");
    }
    seen += 1;
  }
  return content;
}

export function markdownStats(content: string): MarkdownStats {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#*_>`~|[\]()!-]/g, " ");
  const words = plain.trim() ? plain.trim().split(/\s+/).filter(Boolean).length : 0;
  return { words, minutes: Math.max(1, Math.round(words / 220)) };
}

function replaceMath(text: string, formulas: MathFormula[]): string {
  return text.replace(MATH_PATTERN, (match, displayTex: string | undefined, inlineTex: string | undefined) => {
    const tex = (displayTex ?? inlineTex ?? "").trim();
    if (!tex) return match;
    const index = formulas.length;
    formulas.push({ tex, display: displayTex !== undefined });
    return `${MATH_START}${index}${MATH_END}`;
  });
}

/** Walks marked's inline text tokens; code and raw HTML are never touched. */
function walkTokens(tokens: WalkableToken[], replace: (text: string) => string): void {
  for (const token of tokens) {
    if (token.type === "code" || token.type === "codespan" || token.type === "html") continue;
    if (token.type === "text" && typeof token.text === "string") {
      token.text = replace(token.text);
      continue;
    }
    if (Array.isArray(token.tokens)) walkTokens(token.tokens, replace);
    if (Array.isArray(token.items)) walkTokens(token.items, replace);
    for (const cell of [
      ...(Array.isArray(token.header) ? token.header : []),
      ...(Array.isArray(token.rows) ? token.rows : []),
    ].flat())
      walkTokens([cell], replace);
  }
}

const PURIFY_CONFIG = {
  ADD_ATTR: ["dir", "data-task-index"],
  ADD_TAGS: [
    "annotation",
    "semantics",
    "math",
    "mrow",
    "mi",
    "mo",
    "mn",
    "ms",
    "mtext",
    "mspace",
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "munder",
    "mover",
    "munderover",
    "mtable",
    "mtr",
    "mtd",
    "msqrt",
    "mroot",
    "mstyle",
    "mpadded",
    "mphantom",
    "menclose",
  ],
  FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
};

/**
 * Renders Markdown to safe, BiDi-aware HTML: math through KaTeX, Persian and
 * English paragraphs aligned by `dir="auto"`, code always LTR, GFM task
 * checkboxes addressable by index, and every heading id matching the outline.
 */
export function renderMarkdown(content: string): string {
  const formulas: MathFormula[] = [];
  const tokens = marked.lexer(content, { gfm: true }) as unknown as WalkableToken[];
  walkTokens(tokens, (text) => replaceMath(text, formulas));

  const parsed = marked.parser(tokens as unknown as Token[], { gfm: true });
  let html = DOMPurify.sanitize(parsed, PURIFY_CONFIG);

  html = html.replace(new RegExp(`${MATH_START}(\\d+)${MATH_END}`, "g"), (_match, index: string) => {
    const formula = formulas[Number(index)];
    if (!formula) return "";
    return katex.renderToString(formula.tex, {
      displayMode: formula.display,
      throwOnError: false,
      strict: false,
    });
  });

  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const headings = extractMarkdownHeadings(content);
  const used = new Map<string, number>();
  [...doc.body.querySelectorAll("h1,h2,h3,h4,h5,h6")].forEach((heading, index) => {
    heading.setAttribute("dir", "auto");
    if (headings[index]) heading.id = headings[index].id;
    else if (!heading.id) heading.id = uniqueSlug(heading.textContent ?? "", used);
  });

  for (const element of doc.body.querySelectorAll("p,li,blockquote,th,td")) element.setAttribute("dir", "auto");
  for (const element of doc.body.querySelectorAll("pre,code")) element.setAttribute("dir", "ltr");

  let taskIndex = 0;
  for (const input of doc.body.querySelectorAll<HTMLInputElement>('li > input[type="checkbox"]')) {
    input.removeAttribute("disabled");
    input.setAttribute("data-task-index", String(taskIndex));
    taskIndex += 1;
  }

  for (const pre of [...doc.body.querySelectorAll("pre")]) {
    const code = pre.querySelector("code");
    const language = /language-([\w+#-]+)/.exec(code?.className ?? "")?.[1] ?? "";
    const wrapper = doc.createElement("div");
    wrapper.className = "md-code";
    if (language) {
      const badge = doc.createElement("span");
      badge.className = "md-code-lang";
      badge.textContent = language;
      wrapper.appendChild(badge);
    }
    const copy = doc.createElement("button");
    copy.type = "button";
    copy.className = "md-copy";
    copy.textContent = "Copy";
    wrapper.appendChild(copy);
    pre.replaceWith(wrapper);
    wrapper.appendChild(pre);
  }

  return doc.body.innerHTML;
}

interface PdfColors {
  paper: string;
  ink: string;
  muted: string;
  border: string;
  code: string;
}

const PDF_THEME: Record<ThemeName, PdfColors> = {
  light: { paper: "#fffdf8", ink: "#14161b", muted: "#6a7280", border: "rgba(17,24,39,0.14)", code: "#f3f4f6" },
  dark: { paper: "#161a22", ink: "#f2f4f8", muted: "#9aa3b2", border: "rgba(255,255,255,0.16)", code: "#0f1218" },
  sepia: { paper: "#fffaf0", ink: "#3a2f22", muted: "#8a775e", border: "rgba(74,56,32,0.2)", code: "#f3e9d6" },
};

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PX_PER_MM = 96 / 25.4;
const PAGE_WIDTH_PX = Math.round(210 * PX_PER_MM);
const PAGE_HEIGHT_PX = Math.round(297 * PX_PER_MM);
const PAGE_MARGIN_PX = Math.round(16 * PX_PER_MM);

function pdfCss(colors: PdfColors): string {
  return `
*{box-sizing:border-box}
.md-pdf{font-family:-apple-system,"Segoe UI",Tahoma,"Noto Naskh Arabic",sans-serif;font-size:15px;line-height:1.7;color:${colors.ink};}
.md-pdf h1{font-size:26px;line-height:1.3;margin:0 0 14px}
.md-pdf h2{font-size:21px;line-height:1.35;margin:20px 0 10px}
.md-pdf h3{font-size:17px;margin:16px 0 8px}
.md-pdf h4{font-size:15px;margin:14px 0 6px}
.md-pdf p{margin:0 0 12px}
.md-pdf ul,.md-pdf ol{margin:0 0 12px;padding-inline-start:26px}
.md-pdf li{margin:4px 0}
.md-pdf blockquote{margin:0 0 12px;border-inline-start:3px solid ${colors.border};padding-inline-start:14px;color:${colors.muted}}
.md-pdf table{width:100%;border-collapse:collapse;margin:0 0 14px;font-size:14px}
.md-pdf th,.md-pdf td{border:1px solid ${colors.border};padding:7px 9px;text-align:start;vertical-align:top}
.md-pdf th{background:${colors.code};font-weight:600}
.md-pdf pre{background:${colors.code};padding:12px 14px;border-radius:8px;white-space:pre-wrap;word-break:break-word;margin:0 0 12px}
.md-pdf code{font-family:ui-monospace,Consolas,monospace;font-size:13px}
.md-pdf pre code{font-size:12.5px}
.md-pdf img{max-width:100%}
.md-pdf hr{border:0;border-top:1px solid ${colors.border};margin:18px 0}
.md-pdf a{color:${colors.ink};text-decoration:underline}
.md-pdf .md-code-lang,.md-pdf .md-copy{display:none}
.md-pdf .katex{font-size:1.05em}
`;
}

/** Drops KaTeX's CSS-dependent HTML twin so native MathML carries the formula. */
function mathmlOnly(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const element of doc.querySelectorAll(".katex-html")) element.remove();
  for (const math of doc.querySelectorAll("math")) {
    for (const node of [...math.childNodes]) if (node.nodeType === 3) node.remove();
  }
  return doc.body.innerHTML;
}

/**
 * Converts rendered Markdown to a paginated A4 PDF. Pages are rasterised at 2×
 * so Persian shaping, tables and formulas keep the reader's exact look.
 */
export async function exportMarkdownToPdf(
  title: string,
  renderedHtml: string,
  theme: ThemeName,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const colors = PDF_THEME[theme] ?? PDF_THEME.light;

  if (typeof document === "undefined") {
    pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    return pdf.save();
  }

  const content = mathmlOnly(renderedHtml);
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_WIDTH_PX}px;box-sizing:border-box;`;
  host.innerHTML = `<style>${pdfCss(colors)}</style><div class="md-pdf">${content}</div>`;
  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const body = host.querySelector<HTMLElement>(".md-pdf");
    const pageHeight = PAGE_HEIGHT_PX - PAGE_MARGIN_PX * 2;
    const pages: string[][] = [];
    let current: string[] = [];
    let used = 0;
    for (const child of [...(body?.children ?? [])]) {
      const element = child as HTMLElement;
      const height = element.getBoundingClientRect().height;
      // shortcut: a block taller than one page overflows its page instead of splitting.
      if (used > 0 && used + height > pageHeight) {
        pages.push(current);
        current = [];
        used = 0;
      }
      current.push(element.outerHTML);
      used += height;
    }
    if (current.length > 0) pages.push(current);
    if (pages.length === 0) pages.push([]);

    for (const children of pages) {
      const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
      const pageHtml = `<style>${pdfCss(colors)}</style><div style="width:${PAGE_WIDTH_PX}px;height:${PAGE_HEIGHT_PX}px;padding:${PAGE_MARGIN_PX}px;background:${colors.paper};box-sizing:border-box;"><div class="md-pdf">${children.join("")}</div></div>`;
      const raster = await rasterizeHtml(pageHtml, PAGE_WIDTH_PX, PAGE_HEIGHT_PX, 2);
      if (!raster) continue;
      const base64 = raster.dataUrl.split(",")[1] ?? "";
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const image = await pdf.embedPng(bytes);
      page.drawImage(image, { x: 0, y: 0, width: A4_WIDTH_PT, height: A4_HEIGHT_PT });
    }
  } finally {
    host.remove();
  }

  return pdf.save();
}
