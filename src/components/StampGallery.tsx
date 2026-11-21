import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Search, X } from "lucide-react";
import { resolveStamp, useCustomStampStore } from "../lib/customStamps";
import { stampGroups, stamps, userStamps } from "../lib/data";
import type { UserStamp } from "../lib/types";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { SectionTitle } from "./ui/controls";

interface GalleryItem {
  id: string;
  name: string;
  sub: string;
  imageUrl: string;
  width: number;
  height: number;
}

const FACTORY_ITEMS: GalleryItem[] = stamps.map((stamp) => ({
  id: stamp.id,
  name: stamp.title.en,
  sub: stamp.title.de,
  imageUrl: stamp.imageUrl ?? "",
  width: stamp.width,
  height: stamp.height,
}));
const FACTORY_GROUP = new Map(stamps.map((stamp) => [stamp.id, stamp.groupSlug]));

const USER_ITEMS: GalleryItem[] = userStamps.map((stamp: UserStamp) => ({
  id: stamp.id,
  name: stamp.name,
  sub: stamp.groupName,
  imageUrl: stamp.imageUrl,
  width: stamp.inkWidth,
  height: stamp.inkHeight,
}));

const TILE_PX = 72;
const GAP = 8;

export function StampGallery({ variant = "panel", onPick }: { variant?: "panel" | "library"; onPick?: () => void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(320);
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedStampId = useToolStore((state) => state.selectedStampId);
  const selectStamp = useToolStore((state) => state.selectStamp);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  const customStamps = useCustomStampStore((state) => state.stamps);
  const removeCustomStamp = useCustomStampStore((state) => state.remove);
  const library = variant === "library";
  const groups = useMemo(stampGroups, []);
  const columns = library ? 7 : 3;

  const customItems = useMemo<GalleryItem[]>(
    () =>
      customStamps.map((stamp) => ({
        id: stamp.id,
        name: stamp.name,
        sub: "Saved stamp",
        imageUrl: stamp.imageUrl,
        width: stamp.width,
        height: stamp.height,
      })),
    [customStamps],
  );

  const customIds = useMemo(() => new Set(customStamps.map((stamp) => stamp.id)), [customStamps]);

  const items = useMemo(() => {    const needle = query.trim().toLowerCase();
    const source =
      group === "user"
        ? USER_ITEMS
        : group === "custom"
          ? customItems
          : group === "all"
            ? [...FACTORY_ITEMS, ...USER_ITEMS, ...customItems]
            : FACTORY_ITEMS.filter((item) => FACTORY_GROUP.get(item.id) === group);
    if (!needle) return source;
    return source.filter(
      (item) => item.name.toLowerCase().includes(needle) || item.sub.toLowerCase().includes(needle),
    );
  }, [customItems, group, query]);

  // A filter change starts the list over; a stale scrollTop would show blank rows.
  useEffect(() => {
    setScrollTop(0);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [group, query]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const stride = TILE_PX + GAP;
  const rows = Math.ceil(items.length / columns);
  const firstRow = Math.max(0, Math.floor(scrollTop / stride) - 1);
  const lastRow = Math.min(rows, Math.ceil((scrollTop + height) / stride) + 1);
  const visible = items.slice(firstRow * columns, lastRow * columns);
  const total = stamps.length + userStamps.length + customStamps.length;

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <SectionTitle
        aside={
          <span className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted">
              {items.length} / {total}
            </span>
            {!library && (
              <button
                type="button"
                className="icon-btn h-6 w-6"
                title="Open the full stamp library"
                aria-label="Open the full stamp library"
                onClick={() => setLibraryOpen(true)}
              >
                <Maximize2 size={13} strokeWidth={1.75} />
              </button>
            )}
          </span>
        }
      >
        Stamps
      </SectionTitle>

      <label className="relative block">
        <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          className="text-input pl-7"
          placeholder={`Search ${total} stamps and your own…`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search stamps"
        />
      </label>

      <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button type="button" className="chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
          All
        </button>
        <button type="button" className="chip" aria-pressed={group === "custom"} onClick={() => setGroup("custom")}>
          Custom <span className="opacity-60">{customStamps.length}</span>
        </button>
        <button type="button" className="chip" aria-pressed={group === "user"} onClick={() => setGroup("user")}>
          My stamps <span className="opacity-60">{userStamps.length}</span>
        </button>
        {groups.map((entry) => (
          <button
            key={entry.slug}
            type="button"
            className="chip"
            aria-pressed={group === entry.slug}
            onClick={() => setGroup(entry.slug)}
          >
            {entry.name} <span className="opacity-60">{entry.count}</span>
          </button>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="scroll-thin min-h-0 overflow-y-auto pr-1"
        style={library ? { maxHeight: "58vh" } : { maxHeight: 320 }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: rows * stride }}>
          <div
            className="absolute left-0 right-0 grid"
            style={{
              top: firstRow * stride,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
              gridAutoRows: TILE_PX,
            }}
          >
            {visible.map((item) => (
              <div key={item.id} className="relative h-full">
                <button
                  type="button"
                  className="tile group flex h-full w-full flex-col overflow-hidden text-left"
                  aria-pressed={selectedStampId === item.id}
                  title={`${item.name} — ${item.sub}`}
                  onClick={() => {
                    const resolved = resolveStamp(item.id);
                    if (resolved) selectStamp(resolved.id);
                    onPick?.();
                  }}
                >
                  <span className="checker flex h-[52px] w-full shrink-0 items-center justify-center p-1.5">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      loading="lazy"
                      decoding="async"
                      className="max-h-full max-w-full object-contain drop-shadow-sm"
                    />
                  </span>
                  <span className="truncate px-1.5 py-1 text-[9.5px] leading-tight text-muted group-hover:text-fg">
                    {item.name}
                  </span>
                </button>
                {editing && customIds.has(item.id) && (
                  <button
                    type="button"
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full border border-white/70 text-white shadow-[0_1px_4px_rgba(16,24,40,0.45)]"
                    style={{ background: "var(--danger)" }}
                    title={`Delete ${item.name}`}
                    aria-label={`Delete custom stamp ${item.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeCustomStamp(item.id);
                    }}
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {items.length === 0 && (
          <p className="py-6 text-center text-[11.5px] text-muted">No stamp matches “{query}”.</p>
        )}
      </div>

      {customStamps.length > 0 && (
        <button
          type="button"
          className="chip h-7 justify-center"
          aria-pressed={editing}
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Done" : "Edit"}
        </button>
      )}

      {library && (
        <p className="text-[10.5px] leading-relaxed text-muted">
          {stamps.length} factory stamps migrated · 3 recipes have no recoverable bitmap and keep their vector ink for
          Phase 3 · {userStamps.length} from your Tools folder · {customStamps.length} saved from snapshots.
        </p>
      )}
    </div>
  );
}
