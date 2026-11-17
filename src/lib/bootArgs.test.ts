import { describe, expect, it } from "vitest";
import { paperTemplates } from "./data";
import { parseBootArgs, resolvePaperTarget } from "./bootArgs";

describe("boot arguments", () => {
  it("reads the PDFAnnotator-style command line", () => {
    expect(parseBootArgs('--new "A4 Landscape" --fullscreen --print')).toEqual({
      newDoc: "A4 Landscape",
      fullscreen: true,
      print: true,
    });
  });

  it("reads the slash and colon spelling used by the original launcher", () => {
    expect(parseBootArgs('/new:"A4 Landscape" /fullscreen /print')).toEqual({
      newDoc: "A4 Landscape",
      fullscreen: true,
      print: true,
    });
  });

  it("reads the same contract from a URL query", () => {
    expect(parseBootArgs("?new=Letter+Landscape&fullscreen=1&print=1")).toEqual({
      newDoc: "Letter Landscape",
      fullscreen: true,
      print: true,
    });
    expect(parseBootArgs("?new=A4%20Landscape")).toEqual({
      newDoc: "A4 Landscape",
      fullscreen: false,
      print: false,
    });
  });

  it("keeps explicit off values off and empty input inert", () => {
    expect(parseBootArgs("--print=0 --fullscreen=no")).toEqual({ newDoc: null, fullscreen: false, print: false });
    expect(parseBootArgs("")).toEqual({ newDoc: null, fullscreen: false, print: false });
    expect(parseBootArgs("--new")).toEqual({ newDoc: null, fullscreen: false, print: false });
  });
});

describe("paper target", () => {
  it("maps a size and orientation to a shipped recipe", () => {
    const portrait = resolvePaperTarget("A4", paperTemplates);
    expect(portrait).toEqual({ templateId: "paper-000", landscape: false });

    const landscape = resolvePaperTarget("A4 Landscape", paperTemplates);
    expect(landscape).toEqual({ templateId: "paper-000", landscape: true });

    const letter = resolvePaperTarget("Letter Landscape", paperTemplates);
    expect(letter?.landscape).toBe(true);
    expect(paperTemplates.find((template) => template.id === letter?.templateId)?.page.size).toBe("Letter");
  });

  it("prefers an exact recipe name and rejects unknown paper", () => {
    expect(resolvePaperTarget("A4 Squared 5 mm", paperTemplates)?.templateId).toBe("paper-001");
    expect(resolvePaperTarget("B5", paperTemplates)).toBeNull();
    expect(resolvePaperTarget("  ", paperTemplates)).toBeNull();
  });
});
