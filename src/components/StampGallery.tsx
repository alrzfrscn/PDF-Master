import { useMemo, useState } from "react";
import { Maximize2, Search } from "lucide-react";
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

export function StampGallery({ variant = "panel", onPick }: { variant?: "panel" | "library"; onPick?: () => void }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const selectedStampId = useToolStore((state) => state.selectedStampId);
  const selectStamp = useToolStore((state) => state.selectStamp);
  const setLibraryOpen = useUIStore((state) => state.setLibraryOpen);
  const library = variant === "library";
  const groups = useMemo(stampGroups, []);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const source =
      group === "user"
        ? USER_ITEMS
        : group === "all"
          ? [...FACTORY_ITEMS, ...USER_ITEMS]
          : FACTORY_ITEMS.filter((item) => FACTORY_GROUP.get(item.id) === group);
    if (!needle) return source;
    return source.filter(
      (item) => item.name.toLowerCase().includes(needle) || item.sub.toLowerCase().includes(needle),
    );
  }, [group, query]);

  return (
    <div className="flex min-h-0 flex-col gap-2.5">
      <SectionTitle
        aside={
          <span className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted">
              {items.length} / {stamps.length + userStamps.length}
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
          placeholder="Search 464 factory stamps and your own…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search stamps"
        />
      </label>

      <div className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        <button type="button" className="chip" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
          All
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

      {/* auto-rows-max: the max-height scroller otherwise collapses every tile row to its 2 px border. */}
      <div
        className={`scroll-thin min-h-0 auto-rows-max overflow-y-auto pr-1 ${
          library ? "grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2" : "grid grid-cols-3 gap-1.5"
        }`}
        style={library ? { maxHeight: "58vh" } : { maxHeight: 320 }}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="tile group flex flex-col overflow-hidden text-left"
            aria-pressed={selectedStampId === item.id}
            title={`${item.name} — ${item.sub}`}
            onClick={() => {
              selectStamp(item.id);
              onPick?.();
            }}
          >
            <span className="checker flex h-[52px] w-full items-center justify-center p-1.5">
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
        ))}
        {items.length === 0 && (
          <p className="col-span-full py-6 text-center text-[11.5px] text-muted">No stamp matches “{query}”.</p>
        )}
      </div>

      {library && (
        <p className="text-[10.5px] leading-relaxed text-muted">
          {stamps.length} factory stamps migrated · 3 recipes have no recoverable bitmap and keep their vector ink for
          Phase 3 · {userStamps.length} stamps from your Tools folder.
        </p>
      )}
    </div>
  );
}
