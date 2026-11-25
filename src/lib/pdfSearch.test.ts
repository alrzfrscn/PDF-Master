import { describe, expect, it } from "vitest";
import { findTextMatches, normalizeSearchText, pdfTextRect, searchTab, searchTextContains } from "./pdfSearch";
import type { TextAnnotation } from "./annotationTypes";
import type { DocumentTab } from "./types";

const PT_TO_MM = 25.4 / 72;

function textAnnotation(text: string, id = "text-1"): TextAnnotation {
  return {
    id,
    type: "text",
    xMm: 20,
    yMm: 30,
    widthMm: 60,
    heightMm: 16,
    text,
    fontFamily: "Helvetica",
    fontSizePt: 12,
    textColor: "#101114",
    bold: false,
    italic: false,
    underline: false,
    strikeOut: false,
    align: "left",
    script: "normal",
    boxFillColor: "#ffffff",
    boxFillTransparent: true,
    frameType: 0,
    frameColor: "#000000",
    lineWidthMm: 0.4,
    autoFit: false,
    rotation: 0,
    opacity: 1,
  };
}

// "باکتری‌شناسی" with a ZWNJ between the two words.
const ZWNJ_WORD = "\u0628\u0627\u06A9\u062A\u0631\u06CC\u200C\u0634\u0646\u0627\u0633\u06CC";
const SPACED_WORD = "\u0628\u0627\u06A9\u062A\u0631\u06CC \u0634\u0646\u0627\u0633\u06CC";

describe("Persian and multilingual search normalisation", () => {
  it("folds Arabic presentation forms through NFKC", () => {
    expect(normalizeSearchText("\uFEFB")).toBe("\u0644\u0627");
    expect(normalizeSearchText("\uFE91\uFE8E\uFB90\uFE98\uFEAD\uFBFC")).toBe(
      normalizeSearchText("\u0628\u0627\u06A9\u062A\u0631\u06CC"),
    );
  });

  it("unifies Arabic yeh/kaf with Persian yeh/kaf", () => {
    expect(normalizeSearchText("\u0639\u0644\u064A")).toBe(normalizeSearchText("\u0639\u0644\u06CC"));
    expect(normalizeSearchText("\u0643\u062A\u0627\u0628")).toBe(normalizeSearchText("\u06A9\u062A\u0627\u0628"));
  });

  it("drops harakat, tatweel and ZWNJ", () => {
    expect(normalizeSearchText("\u0628\u064E\u0627\u0643\u062A\u0631\u064A")).toBe(
      normalizeSearchText("\u0628\u0627\u06A9\u062A\u0631\u06CC"),
    );
    expect(normalizeSearchText(ZWNJ_WORD)).toBe(normalizeSearchText(SPACED_WORD));
  });

  it("matches a spaced query against a ZWNJ word and vice versa", () => {
    const needle = normalizeSearchText(SPACED_WORD);
    expect(searchTextContains(ZWNJ_WORD, needle)).toBe(true);
    expect(searchTextContains(SPACED_WORD, normalizeSearchText(ZWNJ_WORD))).toBe(true);
    expect(searchTextContains("\u0645\u062A\u0646 \u062F\u06CC\u06AF\u0631", needle)).toBe(false);
  });

  it("finds a legacy visual order run", () => {
    // "یسانش" is the reversed run of "شناسی".
    expect(searchTextContains("\u06CC\u0633\u0627\u0646\u0634", normalizeSearchText("\u0634\u0646\u0627\u0633\u06CC"))).toBe(true);
  });
});

describe("word-level search", () => {
  it("returns original indices for a latin word", () => {
    expect(findTextMatches("Hello world", "world")).toEqual([{ start: 6, end: 11 }]);
    expect(findTextMatches("Hello world", "hello")).toEqual([{ start: 0, end: 5 }]);
  });

  it("rejects a partial word when wholeWord is on", () => {
    expect(findTextMatches("water damage", "water", true)).toEqual([{ start: 0, end: 5 }]);
    expect(findTextMatches("waterfall", "water", true)).toEqual([]);
    expect(findTextMatches("آب", "آب", true)).toHaveLength(1);
    expect(findTextMatches("آبدهی", "آب", true)).toEqual([]);
  });

  it("boxes a latin slice inside the text item", () => {
    const item = { str: "Hello world", transform: [1, 0, 0, 1, 100, 700], width: 110, height: 12 };
    const rect = pdfTextRect(item, 6, 11, 792);
    expect(rect.xMm).toBeCloseTo(100 * PT_TO_MM + (6 / 11) * 110 * PT_TO_MM);
    expect(rect.widthMm).toBeCloseTo((5 / 11) * 110 * PT_TO_MM);
    expect(rect.yMm).toBeCloseTo((792 - 700 - 12) * PT_TO_MM);
  });

  it("boxes a Persian slice from the right edge of the run", () => {
    const item = { str: "آبدهی", transform: [1, 0, 0, 1, 200, 500], width: 50, height: 14 };
    const right = pdfTextRect(item, 0, 2, 792);
    // "آب" starts the logical string, so it sits at the visual right edge.
    expect(right.xMm).toBeCloseTo(200 * PT_TO_MM + 0.6 * 50 * PT_TO_MM);
    expect(right.widthMm).toBeCloseTo((2 / 5) * 50 * PT_TO_MM);
    expect(right.xMm).toBeGreaterThan(200 * PT_TO_MM + 25 * PT_TO_MM);

    const left = pdfTextRect(item, 2, 5, 792);
    expect(left.xMm).toBeCloseTo(200 * PT_TO_MM);
    expect(left.widthMm).toBeCloseTo((3 / 5) * 50 * PT_TO_MM);
  });
});

describe("document-wide search", () => {
  it("searches every page and stops on abort", async () => {
    const pageCount = 520;
    const tab: DocumentTab = {
      id: "doc-many",
      title: "Many",
      templateId: "paper-000",
      landscape: false,
      pageCount,
      pages: Array.from({ length: pageCount }, (_, index) => ({
        id: `page-${index}`,
        templateId: "paper-000",
        rotation: 0 as const,
        annotations: [textAnnotation("needle", `text-${index}`)],
      })),
    };

    const matches = await searchTab(tab, "needle");
    expect(matches).toHaveLength(pageCount);

    const controller = new AbortController();
    controller.abort();
    expect(await searchTab(tab, "needle", { signal: controller.signal })).toHaveLength(0);
  });
});
