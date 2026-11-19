import { describe, expect, it } from "vitest";
import { normalizeSearchText, searchTextContains } from "./pdfSearch";

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
