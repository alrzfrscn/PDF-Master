import { paperById, paperTemplates } from "./data";
import { pageMm } from "./paper";
import type { DocumentPage, DocumentTab, PaperTemplate } from "./types";

export function pageTemplate(page: DocumentPage): PaperTemplate {
  return paperById.get(page.templateId) ?? paperTemplates[0];
}

/** Unrotated page size; rotation is applied as a view transform only. */
export function pageSizeMm(tab: DocumentTab, page: DocumentPage): { widthMm: number; heightMm: number } {
  if (page.pdf) return { widthMm: page.pdf.widthMm, heightMm: page.pdf.heightMm };
  return pageMm(pageTemplate(page), tab.landscape);
}
