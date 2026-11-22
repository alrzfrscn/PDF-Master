/** Ordered entries shown in the Combine Documents studio. */
export interface CombineTabItem {
  id: string;
  title: string;
  pageCount: number;
  checked: boolean;
}

export interface CombinePdfFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

/** Moves one row without mutating the source array; invalid indexes are ignored. */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function checkedTabIds(tabs: CombineTabItem[]): string[] {
  return tabs.filter((tab) => tab.checked).map((tab) => tab.id);
}

export function pdfFileIds(files: CombinePdfFile[]): string[] {
  return files.map((file) => file.id);
}

/** Checked tabs first, then chosen files: the exact export/merge order. */
export function combineOrder(tabs: CombineTabItem[], files: CombinePdfFile[]): { tabIds: string[]; fileIds: string[] } {
  return { tabIds: checkedTabIds(tabs), fileIds: pdfFileIds(files) };
}

export function combineSummary(tabs: CombineTabItem[], files: CombinePdfFile[]): { items: number; pages: number } {
  const checked = tabs.filter((tab) => tab.checked);
  return {
    items: checked.length + files.length,
    pages: checked.reduce((sum, tab) => sum + tab.pageCount, 0) + files.reduce((sum, file) => sum + file.pageCount, 0),
  };
}
