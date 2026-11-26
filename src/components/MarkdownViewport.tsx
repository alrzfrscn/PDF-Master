import { useCallback, useEffect, useMemo, useRef } from "react";
import { Columns3, Copy, FileDown, Pencil, Printer, Save, Search } from "lucide-react";
import { findTextMatches } from "../lib/pdfSearch";
import { extractMarkdownHeadings, markdownStats, renderMarkdown, toggleMarkdownTask } from "../lib/markdown";
import { exportMarkdownAsPdf, saveMarkdownDocument } from "../lib/save";
import { isMarkdownTab, type DocumentTab, type MarkdownMode } from "../lib/types";
import { useContextMenuStore, keepsNativeMenu } from "../stores/useContextMenuStore";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

export function MarkdownViewport({ tab }: { tab: DocumentTab }) {
  const zoom = useDocStore((state) => state.zoom);
  const rootRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const marksRef = useRef<HTMLElement[]>([]);
  const searchRef = useRef<{ query: string; wholeWord: boolean } | null>(null);

  const markdown = isMarkdownTab(tab) ? tab.markdown : null;
  const html = useMemo(() => (markdown ? renderMarkdown(markdown.content) : ""), [markdown?.content]);
  const headings = useMemo(() => (markdown ? extractMarkdownHeadings(markdown.content) : []), [markdown?.content]);
  const stats = useMemo(() => (markdown ? markdownStats(markdown.content) : { words: 0, minutes: 1 }), [markdown?.content]);

  const setMode = (mode: MarkdownMode) => {
    if (markdown) useDocStore.getState().setMarkdownMode(tab.id, mode);
  };

  // Ctrl/⌘ + wheel and touchpad pinch scale the reading column.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const current = useDocStore.getState().zoom;
      const next = current + (event.deltaY < 0 ? 0.1 : -0.1);
      useDocStore.getState().setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const clearMarks = useCallback(() => {
    const article = articleRef.current;
    if (!article) return;
    for (const mark of [...article.querySelectorAll<HTMLElement>("mark[data-md-mark]")]) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
    marksRef.current = [];
  }, []);

  const focusMark = useCallback((index: number) => {
    const marks = marksRef.current;
    if (marks.length === 0) return;
    const next = ((index % marks.length) + marks.length) % marks.length;
    marks.forEach((mark) => mark.classList.remove("md-mark-active"));
    marks[next].classList.add("md-mark-active");
    marks[next].scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const applySearch = useCallback(
    (query: string, wholeWord: boolean, scroll = true) => {
      const article = articleRef.current;
      if (!article) return;
      clearMarks();
      if (!query.trim()) {
        window.dispatchEvent(new CustomEvent("pm:md-search-count", { detail: { total: 0 } }));
        return;
      }
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.nodeValue) continue;
        if (node.parentElement?.closest(".katex-mathml, .md-copy, .md-code-lang")) continue;
        nodes.push(node);
      }
      const marks: HTMLElement[] = [];
      for (const node of nodes) {
        const value = node.nodeValue ?? "";
        const matches = findTextMatches(value, query, wholeWord);
        if (matches.length === 0) continue;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const match of matches) {
          if (match.start > cursor) fragment.appendChild(document.createTextNode(value.slice(cursor, match.start)));
          const mark = document.createElement("mark");
          mark.dataset.mdMark = "1";
          mark.textContent = value.slice(match.start, match.end);
          fragment.appendChild(mark);
          marks.push(mark);
          cursor = match.end;
        }
        if (cursor < value.length) fragment.appendChild(document.createTextNode(value.slice(cursor)));
        node.parentNode?.replaceChild(fragment, node);
      }
      marksRef.current = marks;
      window.dispatchEvent(new CustomEvent("pm:md-search-count", { detail: { total: marks.length } }));
      if (marks.length > 0) focusMark(0);
      if (scroll) marks[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [clearMarks, focusMark],
  );

  // The reader DOM is replaced on every edit; re-apply an open search to it.
  useEffect(() => {
    const active = searchRef.current;
    if (active) applySearch(active.query, active.wholeWord, false);
  }, [html, applySearch]);

  useEffect(() => {
    const onSearch = (event: Event) => {
      const detail = (event as CustomEvent<{ query: string; wholeWord?: boolean }>).detail;
      const query = detail?.query ?? "";
      searchRef.current = query ? { query, wholeWord: Boolean(detail.wholeWord) } : null;
      applySearch(query, Boolean(detail?.wholeWord));
    };
    const onGoto = (event: Event) => {
      const detail = (event as CustomEvent<{ index: number }>).detail;
      focusMark(detail?.index ?? 0);
    };
    const onHeading = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      const target = articleRef.current?.querySelector<HTMLElement>(`[id="${id}"]`);
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    };
    window.addEventListener("pm:md-search", onSearch);
    window.addEventListener("pm:md-search-goto", onGoto);
    window.addEventListener("pm:md-goto-heading", onHeading);
    return () => {
      window.removeEventListener("pm:md-search", onSearch);
      window.removeEventListener("pm:md-search-goto", onGoto);
      window.removeEventListener("pm:md-goto-heading", onHeading);
    };
  }, [applySearch, focusMark]);

  if (!markdown) return null;

  const update = (content: string) => useDocStore.getState().updateMarkdownContent(tab.id, content);

  const toggleTask = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const copy = target.closest<HTMLButtonElement>(".md-copy");
    if (copy) {
      const pre = copy.closest(".md-code")?.querySelector("pre");
      if (pre) {
        void navigator.clipboard?.writeText(pre.textContent ?? "");
        copy.textContent = "Copied";
        window.setTimeout(() => {
          copy.textContent = "Copy";
        }, 1200);
      }
      return;
    }
    const input = target.closest<HTMLInputElement>('input[type="checkbox"][data-task-index]');
    if (!input) return;
    const index = Number(input.dataset.taskIndex);
    const doc = useDocStore.getState();
    doc.pushHistory(tab.id);
    doc.updateMarkdownContent(tab.id, toggleMarkdownTask(markdown.content, index), false);
  };

  const onContextMenu = (event: React.MouseEvent) => {
    if (keepsNativeMenu(event.target)) return;
    event.preventDefault();
    const selection = window.getSelection()?.toString() ?? "";
    const ui = useUIStore.getState();
    useContextMenuStore.getState().openAt(event.clientX, event.clientY, "Markdown", [
      ...(selection.trim()
        ? [
            {
              label: "Copy Selection",
              icon: Copy,
              onSelect: () => void navigator.clipboard?.writeText(selection),
            },
          ]
        : []),
      {
        label: "Switch to Edit",
        icon: Pencil,
        disabled: markdown.mode === "edit",
        onSelect: () => setMode("edit"),
      },
      {
        label: "Switch to Split",
        icon: Columns3,
        disabled: markdown.mode === "split",
        onSelect: () => setMode("split"),
      },
      "divider",
      { label: "Search", icon: Search, shortcut: "Ctrl+F", onSelect: () => ui.setSearchOpen(true) },
      { label: "Annotate as PDF", icon: FileDown, onSelect: () => void exportMarkdownAsPdf(true) },
      { label: "Save .md", icon: Save, shortcut: "Ctrl+S", onSelect: () => void saveMarkdownDocument() },
      { label: "Print", icon: Printer, shortcut: "Ctrl+P", onSelect: () => window.print() },
    ]);
  };

  const onEditorKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const element = event.currentTarget;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const value = element.value;
    update(`${value.slice(0, start)}  ${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      element.selectionStart = element.selectionEnd = start + 2;
    });
  };

  const editor = (
    <textarea
      className="h-full w-full resize-none bg-transparent p-6 font-mono text-[13px] leading-relaxed outline-none"
      style={{ color: "var(--fg)", tabSize: 2 }}
      value={markdown.content}
      dir="auto"
      spellCheck={false}
      aria-label="Markdown editor"
      onChange={(event) => update(event.target.value)}
      onKeyDown={onEditorKeyDown}
    />
  );

  const reader = (
    <div className="md-scroll h-full overflow-y-auto">
      <article
        ref={articleRef}
        className="md-doc mx-auto w-full max-w-[780px] px-6 py-10"
        style={{ fontSize: `${Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))}rem` }}
        onClick={toggleTask}
        onContextMenu={onContextMenu}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );

  return (
    <div ref={rootRef} className="md-viewport relative flex h-full min-h-0 w-full flex-col">
      {markdown.mode === "reader" && (
        <div className="mx-auto w-full max-w-[860px] px-6 pt-4 text-[10.5px] text-muted">
          {stats.words} words · {stats.minutes} min read
          {headings.length > 0 ? ` · ${headings.length} headings` : ""}
        </div>
      )}
      {markdown.mode === "reader" && reader}
      {markdown.mode === "edit" && <div className="min-h-0 flex-1">{editor}</div>}
      {markdown.mode === "split" && (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="min-h-0 flex-1 border-b border-[var(--border)] md:border-b-0 md:border-r">{editor}</div>
          <div className="min-h-0 flex-1">{reader}</div>
        </div>
      )}
      {/* Always available to the print sheet, even while editing. */}
      <article
        className="md-print-area md-print-only md-doc"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
