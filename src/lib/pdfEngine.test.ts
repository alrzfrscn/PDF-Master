import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import {
  decodeSidecar,
  encodeSidecar,
  exportPdf,
  loadSidecar,
  mergeSidecarPages,
  type PdfExportInput,
} from "./pdfEngine";
import type { FormulaAnnotation, ShapeAnnotation, StampAnnotation, TextAnnotation } from "./annotationTypes";
import type { DocumentPage } from "./types";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const rectangle: ShapeAnnotation = {
  id: "shape-1",
  type: "shape",
  shapeType: "rectangle",
  start: [20, 30],
  end: [80, 60],
  points: [],
  strokeColor: "#0a84ff",
  fillColor: "#ffffff",
  fillTransparent: false,
  lineWidthMm: 0.6,
  lineStyle: "dash",
  opacity: 1,
  arrowHead: 0,
  arrowTail: 0,
  dimensionUnit: "mm",
  dimensionScale: 1,
};

const stamp: StampAnnotation = {
  id: "stamp-1",
  type: "stamp",
  stampId: "test",
  imageUrl: PNG,
  xMm: 100,
  yMm: 120,
  widthMm: 10,
  heightMm: 10,
  rotation: 0,
  flipH: false,
  flipV: false,
  opacity: 1,
};

const text: TextAnnotation = {
  id: "text-1",
  type: "text",
  xMm: 20,
  yMm: 30,
  widthMm: 60,
  heightMm: 16,
  text: "Round trip",
  fontFamily: "Helvetica",
  fontSizePt: 12,
  textColor: "#101114",
  bold: true,
  italic: false,
  underline: true,
  strikeOut: false,
  align: "left",
  script: "normal",
  boxFillColor: "#ffffff",
  boxFillTransparent: true,
  frameType: 1,
  frameColor: "#0a84ff",
  lineWidthMm: 0.4,
  autoFit: false,
  rotation: 0,
  opacity: 1,
};

const formula: FormulaAnnotation = {
  id: "formula-1",
  type: "formula",
  latex: "E = mc^2",
  xMm: 100,
  yMm: 40,
  widthMm: 40,
  heightMm: 20,
  color: "#0a84ff",
  fontSizePt: 14,
  fillColor: "#ffffff",
  fillTransparent: true,
  rotation: 0,
  opacity: 1,
};

function input(mode: "editable" | "flattened"): PdfExportInput {
  return {
    title: "Round trip",
    mode,
    pages: [
      {
        templateId: "paper-000",
        landscape: false,
        rotation: 0,
        widthMm: 210,
        heightMm: 297,
        annotations: [rectangle, stamp],
      },
    ],
  };
}

describe("PDF engine", () => {
  it("encodes and decodes the annotation sidecar", () => {
    const serialized = {
      version: 1 as const,
      title: "Round trip",
      savedAt: new Date().toISOString(),
      pages: [
        {
          templateId: "paper-000",
          landscape: false,
          rotation: 0,
          widthMm: 210,
          heightMm: 297,
          annotations: [rectangle],
        },
      ],
    };
    const decoded = decodeSidecar(encodeSidecar(serialized));
    expect(decoded?.pages[0].annotations[0]).toMatchObject({ id: "shape-1", shapeType: "rectangle" });
  });

  it("exports a vector PDF with an editable sidecar", async () => {
    const bytes = await exportPdf(input("editable"));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo((210 * 72) / 25.4, 1);
    expect(page.getHeight()).toBeCloseTo((297 * 72) / 25.4, 1);

    const sidecar = await loadSidecar(bytes);
    expect(sidecar?.pages[0].annotations).toHaveLength(2);
    expect(sidecar?.pages[0].annotations[0].id).toBe("shape-1");
  });

  it("exports a flattened PDF without a sidecar", async () => {
    const bytes = await exportPdf(input("flattened"));
    expect(await loadSidecar(bytes)).toBeNull();
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it("mirrors flipped stamps in the flattened content", async () => {
    const flipped: StampAnnotation = { ...stamp, flipH: true, flipV: true, rotation: 30 };
    const bytes = await exportPdf({
      ...input("flattened"),
      pages: [{ ...input("flattened").pages[0], annotations: [flipped] }],
    });
    const pdf = await PDFDocument.load(bytes);
    const page = pdf.getPage(0);
    const raw = page.node.Contents() as never;
    const first = (pdf.context.lookup(raw) as unknown as { array?: unknown[] }).array?.[0] ?? raw;
    const contents = pdf.context.lookup(first as never) as unknown as { asUint8Array: () => Uint8Array };
    const decoded = new Blob([contents.asUint8Array() as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("deflate"));
    const operators = await new Response(decoded).text();
    const scales = [...operators.matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) /g)].map((match) => [Number(match[1]), Number(match[2])]);
    expect(scales.some(([width, height]) => width < 0 && height < 0)).toBe(true);
    expect(await loadSidecar(bytes)).toBeNull();
  });

  it("never bakes annotations into an editable export", async () => {
    const imageObjects = (pdf: PDFDocument) => {
      const xobjects = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"));
      return xobjects instanceof PDFDict ? xobjects.keys().length : 0;
    };
    expect(imageObjects(await PDFDocument.load(await exportPdf(input("editable"))))).toBe(0);
    expect(imageObjects(await PDFDocument.load(await exportPdf(input("flattened"))))).toBeGreaterThan(0);
    expect((await loadSidecar(await exportPdf(input("editable"))))?.pages[0].annotations).toHaveLength(2);
  });

  it("refuses to export a page whose source PDF is unavailable", async () => {
    const page = { ...input("flattened").pages[0], pdfPageIndex: 1 };
    await expect(
      exportPdf({ title: "Missing", mode: "flattened", pages: [page] }),
    ).rejects.toThrow("Source PDF bytes are unavailable or unreadable");
    await expect(
      exportPdf({ title: "Broken", mode: "flattened", sourceBytes: new Uint8Array([1, 2, 3]), pages: [page] }),
    ).rejects.toThrow("Source PDF bytes are unavailable or unreadable");
  });

  it("writes a real outline tree for the bookmarks", async () => {
    const bookmarks = [
      { id: "bm-1", title: "Chapter 1", pageIndex: 0, depth: 0 },
      { id: "bm-2", title: "Section", pageIndex: 0, depth: 1 },
    ];
    const pdf = await PDFDocument.load(await exportPdf({ ...input("flattened"), bookmarks }));
    const outlines = pdf.catalog.lookup(PDFName.of("Outlines"));
    expect(outlines).toBeInstanceOf(PDFDict);
    const first = (outlines as PDFDict).lookup(PDFName.of("First"));
    expect(first).toBeInstanceOf(PDFDict);
    expect(((first as PDFDict).lookup(PDFName.of("Title")) as PDFString).decodeText()).toBe("Chapter 1");
    expect((first as PDFDict).lookup(PDFName.of("Dest"))).toBeInstanceOf(PDFArray);
    const child = (first as PDFDict).lookup(PDFName.of("First"));
    expect(((child as PDFDict).lookup(PDFName.of("Title")) as PDFString).decodeText()).toBe("Section");
  });

  it("merges a sidecar so paper pages reopen without a PDF source", () => {
    const source: DocumentPage = {
      id: "p1",
      templateId: "paper-000",
      rotation: 0,
      annotations: [],
      pdf: { url: "blob:x", pageNumber: 1, widthMm: 210, heightMm: 297 },
    };
    const sidecar = {
      version: 1 as const,
      title: "Paper",
      savedAt: new Date().toISOString(),
      pages: [
        {
          templateId: "paper-103",
          landscape: false,
          rotation: 90,
          widthMm: 210,
          heightMm: 297,
          annotations: [rectangle],
        },
      ],
    };
    const [paper] = mergeSidecarPages([source], sidecar);
    expect(paper.pdf).toBeUndefined();
    expect(paper.templateId).toBe("paper-103");
    expect(paper.rotation).toBe(90);
    expect(paper.annotations).toHaveLength(1);

    const [fromPdf] = mergeSidecarPages([source], {
      ...sidecar,
      pages: [{ ...sidecar.pages[0], pdfPageIndex: 1 }],
    });
    expect(fromPdf.pdf).toEqual(source.pdf);
  });

  it("re-exports PDF-backed pages without duplicating them", async () => {
    const base = await exportPdf(input("flattened"));
    const bytes = await exportPdf({
      title: "Second pass",
      mode: "editable",
      sourceBytes: base,
      pages: [
        {
          templateId: "paper-000",
          landscape: false,
          rotation: 0,
          widthMm: 210,
          heightMm: 297,
          pdfPageIndex: 1,
          annotations: [rectangle],
        },
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const sidecar = await loadSidecar(bytes);
    expect(sidecar?.pages[0].pdfPageIndex).toBe(1);
  });

  it("exports text and formula annotations and keeps both in the sidecar", async () => {
    const bytes = await exportPdf({
      title: "Typography",
      mode: "editable",
      pages: [
        {
          templateId: "paper-000",
          landscape: false,
          rotation: 0,
          widthMm: 210,
          heightMm: 297,
          annotations: [text, formula],
        },
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const sidecar = await loadSidecar(bytes);
    expect(sidecar?.pages[0].annotations.map((annotation) => annotation.id)).toEqual(["text-1", "formula-1"]);
    expect(sidecar?.pages[0].annotations[0]).toMatchObject({ type: "text", text: "Round trip" });
    expect(sidecar?.pages[0].annotations[1]).toMatchObject({ type: "formula", latex: "E = mc^2" });
  });

  it("keeps bookmarks in the sidecar across an export round-trip", async () => {
    const bookmarks = [
      { id: "bm-1", title: "Chapter 1", pageIndex: 0, depth: 0 },
      { id: "bm-2", title: "My note", pageIndex: 0, depth: 1, custom: true },
    ];
    const bytes = await exportPdf({ ...input("editable"), bookmarks });
    const sidecar = await loadSidecar(bytes);
    expect(sidecar?.bookmarks).toEqual(bookmarks);
    expect((await loadSidecar(await exportPdf({ ...input("flattened"), bookmarks })))?.bookmarks).toBeUndefined();
  });

  it("rebuilds the page tree in tab order, count and size", async () => {
    const pt = 72 / 25.4;
    const base = await exportPdf({
      title: "Source",
      mode: "flattened",
      pages: [
        { templateId: "paper-000", landscape: true, rotation: 0, widthMm: 297, heightMm: 210, annotations: [] },
        { templateId: "paper-000", landscape: false, rotation: 0, widthMm: 210, heightMm: 297, annotations: [] },
      ],
    });
    const bytes = await exportPdf({
      title: "Rebuilt",
      mode: "editable",
      sourceBytes: base,
      pages: [
        { templateId: "paper-000", landscape: false, rotation: 0, widthMm: 148, heightMm: 210, annotations: [rectangle] },
        { templateId: "paper-000", landscape: false, rotation: 0, widthMm: 210, heightMm: 297, pdfPageIndex: 2, annotations: [] },
        { templateId: "paper-000", landscape: false, rotation: 0, widthMm: 210, heightMm: 297, pdfPageIndex: 2, annotations: [] },
      ],
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(3);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(148 * pt, 1);
    expect(pdf.getPage(1).getWidth()).toBeCloseTo(210 * pt, 1);
    expect(pdf.getPage(2).getWidth()).toBeCloseTo(210 * pt, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(210 * pt, 1);
    const sidecar = await loadSidecar(bytes);
    expect(sidecar?.pages.map((page) => page.pdfPageIndex)).toEqual([undefined, 2, 3]);
    expect(sidecar?.pages[0].annotations[0].id).toBe("shape-1");
  });
});
