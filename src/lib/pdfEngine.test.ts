import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { decodeSidecar, encodeSidecar, exportPdf, loadSidecar, type PdfExportInput } from "./pdfEngine";
import type { ShapeAnnotation, StampAnnotation } from "./annotationTypes";

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

  it("mirrors flipped stamps in the exported content", async () => {
    const flipped: StampAnnotation = { ...stamp, flipH: true, flipV: true, rotation: 30 };
    const bytes = await exportPdf({
      ...input("editable"),
      pages: [{ ...input("editable").pages[0], annotations: [flipped] }],
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
    expect((await loadSidecar(bytes))?.pages[0].annotations[0]).toMatchObject({ flipH: true, flipV: true });
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
});
