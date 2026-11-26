// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportMarkdownToPdf, extractMarkdownHeadings, markdownStats, renderMarkdown, toggleMarkdownTask } from "./markdown";
import { parseWorkspaceBackup, workspaceBackup } from "./storage";
import type { DocumentTab } from "./types";
import { useDocStore } from "../stores/useDocStore";

// jsdom never loads the SVG image the real rasteriser draws; keep the page
// assembly testable with a 1×1 PNG instead.
vi.mock("./raster", () => ({
  rasterizeHtml: async () => ({
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    width: 1,
    height: 1,
  }),
}));

describe("renderMarkdown", () => {
  it("renders GitHub tables and task lists", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th");
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain("disabled");
    expect(html).toContain('data-task-index="0"');
    expect(html).toContain('data-task-index="1"');
  });

  it("marks prose with dir=auto, headings included, and code as LTR", () => {
    const html = renderMarkdown("# عنوان\n\nمتن فارسی\n\n```ts\nconst a = 1;\n```\n");
    expect(html).toMatch(/<h1[^>]*dir="auto"/);
    expect(html).toMatch(/<p dir="auto"/);
    expect(html).toMatch(/<pre[^>]*dir="ltr"/);
    expect(html).toMatch(/<code[^>]*dir="ltr"/);
  });

  it("renders inline and display math with KaTeX, leaving code alone", () => {
    const html = renderMarkdown("Inline $E=mc^2$ and block:\n\n$$\n\\int_0^1 x\\,dx\n$$\n\n`$not math$`\n");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<math");
    expect(html).toContain("$not math$");
  });

  it("sanitizes scripts, event handlers and javascript links", () => {
    const html = renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n[click](javascript:alert(1))\n',
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });
});

describe("extractMarkdownHeadings", () => {
  it("collects ATX headings, skips fenced code and makes ids unique", () => {
    const headings = extractMarkdownHeadings(
      "# One\n\n```md\n# Not a heading\n```\n\n## Two\n\n### One\n\n#### **Bold** title\n",
    );
    expect(headings.map((heading) => [heading.level, heading.title, heading.id])).toEqual([
      [1, "One", "one"],
      [2, "Two", "two"],
      [3, "One", "one-2"],
      [4, "Bold title", "bold-title"],
    ]);
    expect(headings[1].line).toBe(7);
  });
});

describe("toggleMarkdownTask", () => {
  it("toggles the addressed checkbox and ignores fenced code", () => {
    const source = "- [ ] first\n- [x] second\n\n```md\n- [ ] inside code\n```\n- [ ] third\n";
    const once = toggleMarkdownTask(source, 1);
    expect(once).toContain("- [ ] first\n- [ ] second");
    expect(once).toContain("- [ ] third");
    expect(once).toContain("- [ ] inside code");

    const twice = toggleMarkdownTask(toggleMarkdownTask(source, 0), 2);
    expect(twice).toContain("- [x] first");
    expect(twice).toContain("- [x] third");
  });
});

describe("markdownStats", () => {
  it("counts words outside code and never reports a zero-minute read", () => {
    expect(markdownStats("one two three")).toEqual({ words: 3, minutes: 1 });
    expect(markdownStats("```\ncode\n```")).toEqual({ words: 0, minutes: 1 });
  });
});

describe("markdown documents", () => {
  const tab: DocumentTab = {
    id: "doc-md",
    title: "Notes",
    templateId: "paper-000",
    landscape: false,
    pageCount: 0,
    pages: [],
    markdown: { content: "# Notes\n", mode: "reader", fileName: "Notes.md" },
  };

  beforeEach(() => {
    useDocStore.setState({ tabs: [], activeId: "", page: 1, history: {}, fitMode: null, zoom: 1 });
  });

  it("opens Markdown text as a page-less tab", () => {
    useDocStore.getState().openMarkdownText("# Hello\n", "hello.md");
    const opened = useDocStore.getState().tabs[0];
    expect(opened.title).toBe("hello");
    expect(opened.pages).toEqual([]);
    expect(opened.pageCount).toBe(0);
    expect(opened.markdown).toEqual({ content: "# Hello\n", mode: "reader", fileName: "hello.md" });
    expect(useDocStore.getState().fitMode).toBeNull();
  });

  it("undoes and redoes content edits", () => {
    useDocStore.setState({ tabs: [tab], activeId: tab.id });
    useDocStore.getState().updateMarkdownContent(tab.id, "# Notes\n\nFirst");
    useDocStore.getState().pushHistory(tab.id);
    useDocStore.getState().updateMarkdownContent(tab.id, "# Notes\n\nSecond", false);

    useDocStore.getState().undo(tab.id);
    expect(useDocStore.getState().tabs[0].markdown?.content).toBe("# Notes\n\nFirst");
    useDocStore.getState().redo(tab.id);
    expect(useDocStore.getState().tabs[0].markdown?.content).toBe("# Notes\n\nSecond");
  });

  it("round-trips through a workspace backup", async () => {
    const text = await workspaceBackup([tab], tab.id).text();
    const parsed = parseWorkspaceBackup(text);
    expect(parsed?.tabs[0].markdown).toEqual(tab.markdown);
    expect(parsed?.tabs[0].pages).toEqual([]);
  });

  it("rejects a tab whose markdown block is malformed", () => {
    const broken = JSON.stringify({
      version: 2,
      savedAt: "2026-01-01",
      activeId: "doc-md",
      tabs: [{ ...tab, markdown: { content: 42, mode: "reader" } }],
    });
    expect(parseWorkspaceBackup(broken)).toBeNull();
  });
});

describe("exportMarkdownToPdf", () => {
  it("produces an A4 PDF", async () => {
    const bytes = await exportMarkdownToPdf("Notes", renderMarkdown("# Notes\n\nBody"), "light");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });
});
