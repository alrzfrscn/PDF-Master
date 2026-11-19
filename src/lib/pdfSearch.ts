import { create } from "zustand";
import { getPdfDocument } from "./pdfEngine";
import type { DocumentPage, DocumentTab } from "./types";

const PDF_PT_TO_MM = 25.4 / 72;
const MAX_PAGES = 500;

export interface SearchMatch {
  /** 0-based page index inside the tab. */
  pageIndex: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  source: "pdf" | "text";
}

/**
 * NFKC folds Arabic presentation forms to base letters; the replacements unify
 * Arabic/Persian yeh and kaf, drop harakat, tatweel and bidi marks, and remove
 * ZWNJ and whitespace so "باکتری شناسی" and "باکتری‌شناسی" compare equal.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u064A\u0649]/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/[\u064B-\u065F\u0640]/g, "")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** Also matches legacy RTL fonts that store the visual (reversed) run. */
export function searchTextContains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const text = normalizeSearchText(haystack);
  if (text.includes(needle)) return true;
  const reversedNeedle = [...needle].reverse().join("");
  return [...text].reverse().join("").includes(needle) || text.includes(reversedNeedle);
}

export interface TextRunMatch {
  /** Original string index range, end exclusive. */
  start: number;
  end: number;
}

interface NormalizedRun {
  text: string;
  /** normalized index → index in the original string. */
  map: number[];
}

/**
 * Per-character normalisation that keeps a 1-to-1 map back to `item.str`.
 * Whitespace and combining marks collapse out of `text`, never out of the map.
 */
function normalizeWithMap(value: string): NormalizedRun {
  const chars: string[] = [];
  const map: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const normalized = normalizeSearchText(value[index]);
    for (const char of normalized) {
      chars.push(char);
      map.push(index);
    }
  }
  return { text: chars.join(""), map };
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

/** Matches of `query` inside `value`, in original string indices. */
export function findTextMatches(value: string, query: string, wholeWord = false): TextRunMatch[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const run = normalizeWithMap(value);
  const matches: TextRunMatch[] = [];
  let from = 0;
  while (from <= run.text.length - needle.length) {
    const index = run.text.indexOf(needle, from);
    if (index < 0) break;
    const start = run.map[index] ?? 0;
    const end = (run.map[index + needle.length - 1] ?? value.length - 1) + 1;
    if (!wholeWord || (!isWordChar(value[start - 1]) && !isWordChar(value[end]))) {
      matches.push({ start, end });
    }
    from = index + Math.max(1, needle.length);
  }
  // Legacy fonts drawing visual-order runs cannot be sliced word by word.
  if (!wholeWord && matches.length === 0 && searchTextContains(value, needle)) {
    matches.push({ start: 0, end: value.length });
  }
  return matches;
}

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

/** Horizontal slice of one text item that covers `[startIndex, endIndex)`. */
export function pdfTextRect(
  item: PdfTextItem,
  startIndex: number,
  endIndex: number,
  viewportHeight: number,
): Pick<SearchMatch, "xMm" | "yMm" | "widthMm" | "heightMm"> {
  const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
  const fontSize = Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || 10;
  const heightPt = item.height && item.height > 0 ? item.height : fontSize;
  const text = item.str ?? "";
  const total = Math.max(1, text.length);
  const start = Math.min(total, Math.max(0, startIndex));
  const end = Math.min(total, Math.max(start, endIndex));
  const widthMm = Math.max(2, (item.width ?? 0) * PDF_PT_TO_MM);
  // RTL text starts at the right edge and flows left.
  const rtl = /[\u0600-\u06FF]/.test(text);
  const offsetRatio = rtl ? (total - end) / total : start / total;
  return {
    xMm: Math.max(0, transform[4] * PDF_PT_TO_MM + offsetRatio * widthMm),
    yMm: Math.max(0, (viewportHeight - transform[5] - heightPt) * PDF_PT_TO_MM),
    widthMm: Math.max(1.5, ((end - start) / total) * widthMm),
    heightMm: Math.max(2, heightPt * PDF_PT_TO_MM),
  };
}

function pdfPageMatches(
  page: DocumentPage,
  pageIndex: number,
  needle: string,
  viewportHeight: number,
  items: PdfTextItem[],
  wholeWord: boolean,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim() || !Array.isArray(item.transform)) continue;
    for (const run of findTextMatches(item.str, needle, wholeWord)) {
      matches.push({ pageIndex, ...pdfTextRect(item, run.start, run.end, viewportHeight), source: "pdf" });
    }
  }
  for (const annotation of page.annotations) {
    if (annotation.type !== "text" || findTextMatches(annotation.text, needle, wholeWord).length === 0) continue;
    matches.push({
      pageIndex,
      xMm: annotation.xMm,
      yMm: annotation.yMm,
      widthMm: Math.max(2, annotation.widthMm),
      heightMm: Math.max(2, annotation.heightMm),
      source: "text",
    });
  }
  return matches;
}

async function pageMatches(page: DocumentPage, pageIndex: number, needle: string, wholeWord: boolean): Promise<SearchMatch[]> {
  if (!page.pdf) return pdfPageMatches(page, pageIndex, needle, 0, [], wholeWord);
  const pdf = await getPdfDocument(page.pdf.url);
  const pdfPage = await pdf.getPage(page.pdf.pageNumber);
  const viewport = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  return pdfPageMatches(page, pageIndex, needle, viewport.height, content.items as PdfTextItem[], wholeWord);
}

/** Every text hit in the tab, in page order. PDF text and text-box annotations both count. */
export async function searchTab(
  tab: DocumentTab,
  query: string,
  options: { wholeWord?: boolean } = {},
): Promise<SearchMatch[]> {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const wholeWord = Boolean(options.wholeWord);
  const matches: SearchMatch[] = [];
  const limit = Math.min(tab.pages.length, MAX_PAGES);
  for (let index = 0; index < limit; index += 1) {
    try {
      matches.push(...(await pageMatches(tab.pages[index], index, needle, wholeWord)));
    } catch {
      // A broken page must not stop the search.
    }
  }
  return matches;
}

interface SearchState {
  query: string;
  matches: SearchMatch[];
  current: number;
  searching: boolean;
  setQuery: (query: string) => void;
  setMatches: (matches: SearchMatch[]) => void;
  setCurrent: (index: number) => void;
  setSearching: (searching: boolean) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: "",
  matches: [],
  current: 0,
  searching: false,
  setQuery: (query) => set({ query }),
  setMatches: (matches) => set({ matches, current: 0 }),
  setCurrent: (current) => set({ current }),
  setSearching: (searching) => set({ searching }),
}));
