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

function pdfPageMatches(page: DocumentPage, pageIndex: number, needle: string, viewportHeight: number, items: unknown[]): SearchMatch[] {
  const matches: SearchMatch[] = [];
  for (const entry of items) {
    const item = entry as { str?: string; transform?: number[]; width?: number; height?: number };
    if (typeof item.str !== "string" || !item.str.trim() || !Array.isArray(item.transform)) continue;
    if (!searchTextContains(item.str, needle)) continue;
    const transform = item.transform;
    const fontSize = Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || 10;
    const heightPt = item.height && item.height > 0 ? item.height : fontSize;
    matches.push({
      pageIndex,
      xMm: Math.max(0, transform[4] * PDF_PT_TO_MM),
      yMm: Math.max(0, (viewportHeight - transform[5] - heightPt) * PDF_PT_TO_MM),
      widthMm: Math.max(2, (item.width ?? 0) * PDF_PT_TO_MM),
      heightMm: Math.max(2, heightPt * PDF_PT_TO_MM),
      source: "pdf",
    });
  }
  for (const annotation of page.annotations) {
    if (annotation.type !== "text" || !searchTextContains(annotation.text, needle)) continue;
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

async function pageMatches(page: DocumentPage, pageIndex: number, needle: string): Promise<SearchMatch[]> {
  if (!page.pdf) return pdfPageMatches(page, pageIndex, needle, 0, []);
  const pdf = await getPdfDocument(page.pdf.url);
  const pdfPage = await pdf.getPage(page.pdf.pageNumber);
  const viewport = pdfPage.getViewport({ scale: 1 });
  const content = await pdfPage.getTextContent();
  return pdfPageMatches(page, pageIndex, needle, viewport.height, content.items);
}

/** Every text hit in the tab, in page order. PDF text and text-box annotations both count. */
export async function searchTab(tab: DocumentTab, query: string): Promise<SearchMatch[]> {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  const matches: SearchMatch[] = [];
  const limit = Math.min(tab.pages.length, MAX_PAGES);
  for (let index = 0; index < limit; index += 1) {
    try {
      matches.push(...(await pageMatches(tab.pages[index], index, needle)));
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
