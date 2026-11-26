// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportMarkdownToPdf,
  extractMarkdownHeadings,
  isPredominantlyRtl,
  markdownStats,
  renderMarkdown,
  slugifyHeading,
  splitTablePages,
  toggleMarkdownTask,
} from "./markdown";
import { toXhtmlFragment } from "./raster";
import { parseWorkspaceBackup, workspaceBackup } from "./storage";
import type { DocumentTab } from "./types";
import { useDocStore } from "../stores/useDocStore";

// jsdom never loads the SVG image the real rasteriser draws; keep the page
// assembly testable with a 1×1 PNG instead and record every page it is given.
const { rasterPages } = vi.hoisted(() => ({ rasterPages: [] as string[] }));

vi.mock("./raster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./raster")>();
  return {
    ...actual,
    rasterizeHtml: async (html: string) => {
      rasterPages.push(html);
      return {
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
        width: 1,
        height: 1,
      };
    },
  };
});

describe("renderMarkdown", () => {
  it("renders GitHub tables and task lists", () => {
    const html = renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n");
    expect(html).toContain("<table");
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

describe("slugifyHeading", () => {
  it("keeps Persian letters while dropping ZWNJ, punctuation and inline Markdown", () => {
    expect(slugifyHeading("1. دستورات شل و زیرفرمان‌ها (`agy`)")).toBe("1-دستورات-شل-و-زیرفرمانها-agy");
    expect(slugifyHeading("4. اسلش‌کامندها (Slash Commands)")).toBe("4-اسلشکامندها-slash-commands");
    // Old TOC links sometimes carry a doubled hyphen; collapsing it resolves them.
    expect(slugifyHeading("4-اسلشکامندها--slash-commands")).toBe("4-اسلشکامندها-slash-commands");
    expect(slugifyHeading("Café **Bold**")).toBe("café-bold");
  });

  it("gives Persian headings ids that TOC links can target", () => {
    const headings = extractMarkdownHeadings(
      "## 1. دستورات شل و زیرفرمان‌ها (`agy`)\n\n## 4. اسلش‌کامندها (Slash Commands)\n",
    );
    expect(headings.map((heading) => heading.id)).toEqual([
      "1-دستورات-شل-و-زیرفرمانها-agy",
      "4-اسلشکامندها-slash-commands",
    ]);
  });
});

describe("isPredominantlyRtl", () => {
  it("detects Persian prose and ignores fenced code", () => {
    expect(isPredominantlyRtl("این یک متن فارسی است.")).toBe(true);
    expect(isPredominantlyRtl("This is an English sentence.")).toBe(false);
    expect(isPredominantlyRtl("سلام\n\n```bash\nagy --output-format json\n```")).toBe(true);
  });
});

describe("renderMarkdown RTL and code cards", () => {
  it("flows Persian tables and lists right-to-left", () => {
    const html = renderMarkdown("| دستور | کاربرد |\n|---|---|\n| `agy` | اجرا |\n\n1. اول\n2. دوم\n");
    expect(html).toMatch(/<table[^>]*dir="rtl"/);
    expect(html).toMatch(/<ol[^>]*dir="rtl"/);
  });

  it("keeps an English table left-to-right", () => {
    const html = renderMarkdown("| Command | Use |\n|---|---|\n| `agy` | run |\n");
    expect(html).toMatch(/<table[^>]*dir="ltr"/);
  });

  it("isolates inline code inside Persian prose", () => {
    const html = renderMarkdown("اجرای `--output-format json` را ببینید\n");
    expect(html).toMatch(/<code[^>]*dir="ltr"/);
  });

  it("wraps every fence in a header card with a visible Copy button", () => {
    const html = renderMarkdown("```bash\nagy --output-format json\n```\n");
    expect(html).toContain('class="md-code-block"');
    expect(html).toContain('class="md-code-head"');
    expect(html).toMatch(/<span class="md-code-lang">BASH<\/span>/);
    expect(html).toMatch(/<button[^>]*class="md-copy"[^>]*>/);
    expect(html).toContain("<span>Copy</span>");
  });
});

describe("XHTML page serialization", () => {
  it("self-closes HTML5 void tags so the SVG foreignObject parses", () => {
    const xhtml = toXhtmlFragment('<hr><br><input type="checkbox"><img src="x">');
    expect(xhtml).not.toContain("<hr>");
    expect(xhtml).not.toContain("<br>");
    expect(xhtml).toMatch(/<hr\b[^>]*\/>/);
    expect(xhtml).toMatch(/<br\b[^>]*\/>/);
    expect(xhtml).toMatch(/<input\b[^>]*\/>/);
    expect(xhtml).toMatch(/<img\b[^>]*\/>/);

    const parsed = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>${xhtml}</foreignObject></svg>`,
      "image/svg+xml",
    );
    expect(parsed.querySelector("parsererror")).toBeNull();
  });

  it("strips interactive copy chrome before serializing", () => {
    const xhtml = toXhtmlFragment(
      '<div class="md-code-block"><div class="md-code-head"><button class="md-copy">Copy</button></div><pre>echo hi</pre></div>',
    );
    expect(xhtml).not.toContain("<button");
    expect(xhtml).toContain("echo hi");
  });
});

describe("splitTablePages", () => {
  const buildTable = (rows: number) => {
    const table = document.createElement("table");
    table.innerHTML = `<thead><tr><th>a</th></tr></thead><tbody>${"<tr><td>1</td></tr>".repeat(rows)}</tbody>`;
    return table;
  };

  it("splits between body rows and repeats the header on every chunk", () => {
    const table = buildTable(10);
    const pages = splitTablePages(table, Array<number>(10).fill(40), 30, 150);
    expect(pages.map((page) => page.height)).toEqual([150, 150, 150, 70]);
    for (const page of pages) expect(page.html).toContain("<thead>");
    const rowCount = pages.reduce((sum, page) => sum + (page.html.match(/<tr>/g)?.length ?? 0), 0);
    expect(rowCount).toBe(10 + pages.length);
  });

  it("fills only the space left on the current page first", () => {
    const table = buildTable(10);
    const pages = splitTablePages(table, Array<number>(10).fill(40), 30, 150, 70);
    expect(pages[0].height).toBe(70);
    expect(pages[0].html.match(/<tr>/g)).toHaveLength(2);
  });
});

describe("exportMarkdownToPdf", () => {
  it("produces an A4 PDF", async () => {
    const bytes = await exportMarkdownToPdf("Notes", renderMarkdown("# Notes\n\nBody"), "light");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("never emits a blank page for a document full of --- rules, tables and code", async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const height =
        this.tagName === "TR" ? 40 : this.tagName === "THEAD" ? 30 : this.tagName === "TABLE" ? 900 : this.tagName === "HR" ? 10 : 120;
      return {
        height,
        width: 700,
        top: 0,
        left: 0,
        right: 700,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
    rasterPages.length = 0;
    try {
      const table = ["| # | Command |", "|---|---|", ...Array.from({ length: 30 }, (_, index) => `| ${index} | run ${index} |`)].join("\n");
      const source = `# Title\n\n---\n\n## Section\n\n${table}\n\n---\n\n\`\`\`bash\necho hi\n\`\`\`\n\n---\n\n### End\n\nTail text.\n`;
      await exportMarkdownToPdf("Mixed", renderMarkdown(source), "light");

      expect(rasterPages.length).toBeGreaterThan(1);
      const bodies = rasterPages.map((page) => page.replace(/<style>[\s\S]*?<\/style>/g, ""));
      for (const body of bodies) expect(body).toMatch(/<(h1|h2|h3|p|table|pre|hr)\b/);

      const continued = bodies.filter((body) => body.includes("<thead>"));
      expect(continued.length).toBeGreaterThan(1);

      const bodyRows = bodies.reduce(
        (sum, body) =>
          sum +
          (body.match(/<tbody[\s\S]*?<\/tbody>/g) ?? []).reduce(
            (count, section) => count + (section.match(/<tr>/g)?.length ?? 0),
            0,
          ),
        0,
      );
      expect(bodyRows).toBe(30);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
    }
  });
});
