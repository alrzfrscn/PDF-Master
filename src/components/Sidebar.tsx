import { Bookmark, FileText, MessageSquareText, Plus, Star } from "lucide-react";
import { paperById, paperTemplates, stamps, userStamps } from "../lib/data";
import { PX_PER_MM, pageMm } from "../lib/paper";
import type { SidebarTab } from "../stores/useUIStore";
import { useDocStore } from "../stores/useDocStore";
import { useToolStore } from "../stores/useToolStore";
import { useUIStore } from "../stores/useUIStore";
import { PaperSheet } from "./canvas/PaperSheet";
import { Segmented, SectionTitle, Switch } from "./ui/controls";

const TABS: { id: SidebarTab; label: string; Icon: typeof FileText }[] = [
  { id: "pages", label: "Pages", Icon: FileText },
  { id: "bookmarks", label: "Bookmarks", Icon: Bookmark },
  { id: "annotations", label: "Annotations", Icon: MessageSquareText },
  { id: "favorites", label: "Favourites", Icon: Star },
];

function EmptyState({ Icon, title, body }: { Icon: typeof FileText; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--track)", color: "var(--muted)" }}>
        <Icon size={18} strokeWidth={1.75} />
      </div>
      <div className="text-[12px] font-medium">{title}</div>
      <p className="max-w-[180px] text-[10.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen);
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);
  const setNewDocOpen = useUIStore((state) => state.setNewDocOpen);
  const auxLines = useUIStore((state) => state.auxLines);
  const toggleAuxLines = useUIStore((state) => state.toggleAuxLines);
  const tabs = useDocStore((state) => state.tabs);
  const activeId = useDocStore((state) => state.activeId);
  const setLandscape = useDocStore((state) => state.setLandscape);
  const page = useDocStore((state) => state.page);
  const recentStamps = useToolStore((state) => state.recentStamps);
  const selectStamp = useToolStore((state) => state.selectStamp);

  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0];
  const template = paperById.get(tab.templateId) ?? paperTemplates[0];
  const size = pageMm(template, tab.landscape);
  const previewScale = 52 / (size.widthMm * PX_PER_MM);

  if (!sidebarOpen) {
    return (
      <div className="glass m-2 mr-0 flex w-11 shrink-0 flex-col items-center gap-1 rounded-2xl py-2">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="icon-btn"
            aria-label={label}
            title={label}
            aria-pressed={sidebarTab === id}
            onClick={() => setSidebarTab(id)}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        ))}
      </div>
    );
  }

  const recent = recentStamps
    .map((id) => stamps.find((stamp) => stamp.id === id) ?? userStamps.find((stamp) => stamp.id === id))
    .filter((stamp): stamp is NonNullable<typeof stamp> => Boolean(stamp));

  const styleCounts = new Map<string, number>();
  for (const recipe of paperTemplates) styleCounts.set(recipe.styleLabel, (styleCounts.get(recipe.styleLabel) ?? 0) + 1);

  return (
    <aside className="glass anim-in m-2 mr-0 flex w-[248px] shrink-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-1 border-b border-[var(--border)] p-1.5">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="icon-btn flex-1"
            aria-label={label}
            title={label}
            aria-pressed={sidebarTab === id}
            onClick={() => setSidebarTab(id)}
          >
            <Icon size={16} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {sidebarTab === "pages" && (
          <>
            <SectionTitle aside={<span className="text-[10px] text-muted">{tab.pageCount} page</span>}>Pages</SectionTitle>
            <button
              type="button"
              className="tile flex items-center gap-2.5 p-2 text-left"
              aria-pressed
              onClick={() => useDocStore.getState().setPage(1)}
            >
              <span
                className="overflow-hidden rounded-[3px]"
                style={{ width: 52, height: size.heightMm * PX_PER_MM * previewScale, boxShadow: "var(--shadow-soft)" }}
              >
                <span style={{ display: "block", transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
                  <PaperSheet template={template} landscape={tab.landscape} />
                </span>
              </span>
              <span className="min-w-0">
                <span className="block text-[11.5px] font-medium">Page {page}</span>
                <span className="block truncate text-[10px] text-muted">{template.name}</span>
              </span>
            </button>

            <div className="divider" />
            <SectionTitle>Document setup</SectionTitle>
            <Segmented
              value={tab.landscape ? "landscape" : "portrait"}
              options={[
                { value: "portrait", label: "Portrait" },
                { value: "landscape", label: "Landscape" },
              ]}
              onChange={(value) => setLandscape(value === "landscape")}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px]">Alignment guides</span>
              <Switch checked={auxLines} onChange={toggleAuxLines} label="Alignment guides" />
            </div>
            <button
              type="button"
              className="chip h-8 justify-center"
              onClick={() => setNewDocOpen(true)}
            >
              <Plus size={13} strokeWidth={1.75} /> Change template…
            </button>

            <div className="divider" />
            <SectionTitle aside={<span className="text-[10px] text-muted">{paperTemplates.length} recipes</span>}>
              Paper styles
            </SectionTitle>
            <div className="flex flex-wrap gap-1">
              {[...styleCounts.entries()].map(([label, count]) => (
                <button key={label} type="button" className="chip" onClick={() => setNewDocOpen(true)}>
                  {label} <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {sidebarTab === "bookmarks" && (
          <EmptyState
            Icon={Bookmark}
            title="No bookmarks yet"
            body="Bookmarks are stored with the document once you open a PDF in Phase 3."
          />
        )}

        {sidebarTab === "annotations" && (
          <EmptyState
            Icon={MessageSquareText}
            title="No annotations yet"
            body="Ink and stamps you draw on the page will be listed here with their presets."
          />
        )}

        {sidebarTab === "favorites" && (
          <>
            <SectionTitle aside={<span className="text-[10px] text-muted">{recent.length}</span>}>Recent stamps</SectionTitle>
            {recent.length === 0 ? (
              <EmptyState Icon={Star} title="Nothing pinned yet" body="Stamp picked from the gallery shows up here for one-click reuse." />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {recent.map((stamp) => {
                  const name = "title" in stamp ? stamp.title.en : stamp.name;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      className="tile checker grid h-[52px] place-items-center p-1"
                      title={name}
                      onClick={() => selectStamp(stamp.id)}
                    >
                      <img src={stamp.imageUrl ?? ""} alt={name} className="max-h-full max-w-full object-contain" />
                    </button>
                  );
                })}
              </div>
            )}
            <div className="divider" />
            <p className="text-[10.5px] leading-relaxed text-muted">
              {stamps.length} factory stamps and {userStamps.length} of your own stay available through the stamp library at
              any time.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
