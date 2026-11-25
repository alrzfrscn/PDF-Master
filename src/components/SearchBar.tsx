import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { searchTab, useSearchStore } from "../lib/pdfSearch";
import { useDocStore } from "../stores/useDocStore";
import { useUIStore } from "../stores/useUIStore";

export function SearchBar() {
  const open = useUIStore((state) => state.searchOpen);
  const setOpen = useUIStore((state) => state.setSearchOpen);
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];

  const query = useSearchStore((state) => state.query);
  const matches = useSearchStore((state) => state.matches);
  const current = useSearchStore((state) => state.current);
  const searching = useSearchStore((state) => state.searching);
  const [text, setText] = useState(query);
  const [wholeWord, setWholeWord] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open]);

  // A new tab starts a fresh search.
  useEffect(() => {
    if (!open) return;
    setText("");
    useSearchStore.getState().setQuery("");
    useSearchStore.getState().setMatches([]);
  }, [open, tab?.id]);

  useEffect(() => {
    if (!open || !tab) return;
    const value = text.trim();
    if (!value) {
      useSearchStore.getState().setQuery("");
      useSearchStore.getState().setMatches([]);
      useSearchStore.getState().setSearching(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    useSearchStore.getState().setSearching(true);
    const timer = window.setTimeout(() => {
      void searchTab(tab, value, { wholeWord, signal: controller.signal })
        .then((found) => {
          if (cancelled) return;
          useSearchStore.getState().setQuery(value);
          useSearchStore.getState().setMatches(found);
          useSearchStore.getState().setSearching(false);
        })
        .catch(() => {
          if (cancelled) return;
          useSearchStore.getState().setMatches([]);
          useSearchStore.getState().setSearching(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, text, tab?.id, wholeWord]);

  if (!open || !tab) return null;

  const jump = (index: number) => {
    const list = useSearchStore.getState().matches;
    if (list.length === 0) return;
    const next = ((index % list.length) + list.length) % list.length;
    useSearchStore.getState().setCurrent(next);
    useDocStore.getState().setPage(list[next].pageIndex + 1);
    window.dispatchEvent(new CustomEvent("pm:search-focus", { detail: { pageIndex: list[next].pageIndex } }));
  };

  const close = () => {
    setOpen(false);
    useSearchStore.getState().setMatches([]);
    useSearchStore.getState().setQuery("");
  };

  return (
    <div className="absolute left-1/2 top-3 z-[90] -translate-x-1/2">
      <div className="menu-surface anim-in flex h-10 items-center gap-1 rounded-full pl-3 pr-1.5 shadow-lg">
        <Search size={14} className="shrink-0 text-muted" strokeWidth={1.9} />
        <input
          ref={inputRef}
          className="h-8 w-[220px] bg-transparent text-[12px] outline-none placeholder:text-muted"
          value={text}
          placeholder="Search this document…"
          aria-label="Search document"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jump(current + (event.shiftKey ? -1 : 1));
            }
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />
        <span className="min-w-[42px] shrink-0 text-center text-[10.5px] tabular-nums text-muted" aria-live="polite">
          {searching ? "…" : `${matches.length ? current + 1 : 0}/${matches.length}`}
        </span>
        <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />
        <button
          type="button"
          className="chip h-7 shrink-0 px-1.5 font-mono text-[10px]"
          aria-pressed={wholeWord}
          aria-label="Whole word only"
          title="Whole word only"
          onClick={() => setWholeWord((value) => !value)}
        >
          [ab]
        </button>
        <button
          type="button"
          className="icon-btn h-7 w-7"
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={matches.length === 0}
          onClick={() => jump(current - 1)}
        >
          <ChevronUp size={14} strokeWidth={1.9} />
        </button>
        <button
          type="button"
          className="icon-btn h-7 w-7"
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={matches.length === 0}
          onClick={() => jump(current + 1)}
        >
          <ChevronDown size={14} strokeWidth={1.9} />
        </button>
        <button type="button" className="icon-btn h-7 w-7" aria-label="Close search" title="Close (Esc)" onClick={close}>
          <X size={14} strokeWidth={1.9} />
        </button>
      </div>
    </div>
  );
}
