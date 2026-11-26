import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFDict,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  type PDFRef,
} from "pdf-lib";
import type { DocumentPage, PaperTemplate, DocumentTab, PdfBookmark } from "./types";
import type { Annotation, FormulaAnnotation, Pt, TextAnnotation } from "./annotationTypes";
import { annotationBounds, formatDimension } from "./annotationGeometry";
import { inkPath, markerOpacity, markerPath, penStyleOptions, polylinePath } from "./ink";
import { layoutText, measureTextWidthMm, TEXT_PADDING_MM, PT_TO_MM } from "./textLayout";
import { latexToPng } from "./formula";
import { rasterizeTextAnnotation } from "./raster";
import { paperById } from "./data";
import { paperGeometry } from "./paper";
import { pageSizeMm } from "./pageUtils";
import { resolveStamp } from "./customStamps";
import { base64ToBytes, bytesToBase64 } from "./base64";
import type { LineStyleName } from "./types";

export const PT_PER_MM = 72 / 25.4;
export const SIDECAR_KEY = "PDFMasterAnnotations";
const SIDECAR_PREFIX = "pm1:";

export interface PdfOutlineEntry {
  title: string;
  pageIndex: number;
  depth: number;
}

export interface InspectedPdf {
  pages: { widthMm: number; heightMm: number }[];
  bookmarks: PdfOutlineEntry[];
}

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  // pdf.js transfers the buffer to its worker; handing it our stored copy would detach it.
  return bytes.slice();
}

/** Page sizes (in mm) and the outline of an opened PDF. */
export async function inspectPdf(bytes: Uint8Array): Promise<InspectedPdf> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: copyBytes(bytes) }).promise;
  try {
    const pages: InspectedPdf["pages"] = [];
    // Bounded batches keep 500-page documents snappy without flooding the worker.
    const BATCH = 16;
    for (let start = 0; start < doc.numPages; start += BATCH) {
      const end = Math.min(doc.numPages, start + BATCH);
      await Promise.all(
        Array.from({ length: end - start }, async (_, offset) => {
          const index = start + offset;
          const page = await doc.getPage(index + 1);
          const viewport = page.getViewport({ scale: 1 });
          pages[index] = {
            widthMm: (viewport.width * 25.4) / 72,
            heightMm: (viewport.height * 25.4) / 72,
          };
        }),
      );
    }
    const bookmarks: PdfOutlineEntry[] = [];
    const outline = await doc.getOutline();
    const walk = async (items: Awaited<ReturnType<typeof doc.getOutline>>, depth: number) => {
      if (!items) return;
      for (const item of items) {
        let pageIndex: number | null = null;
        try {
          const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
          if (Array.isArray(dest) && dest[0]) pageIndex = await doc.getPageIndex(dest[0] as never);
        } catch {
          pageIndex = null;
        }
        if (pageIndex !== null) {
          bookmarks.push({ title: item.title || "Untitled", pageIndex, depth });
        }
        if (item.items?.length) await walk(item.items, depth + 1);
      }
    };
    await walk(outline, 0);
    return { pages, bookmarks };
  } finally {
    const destroy = (doc as unknown as { destroy?: () => Promise<void> }).destroy;
    if (destroy) await destroy.call(doc);
  }
}

const documentCache = new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>();
const renderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();

export function getPdfDocument(url: string) {
  let cached = documentCache.get(url);
  if (!cached) {
    cached = loadPdfjs().then((pdfjs) => pdfjs.getDocument({ url }).promise);
    documentCache.set(url, cached);
  }
  return cached;
}

/** Drop a cached document (and its worker memory) when its tab closes. */
export function releasePdfDocument(url: string): void {
  for (const key of [...pageTextCache.keys()]) {
    if (key.startsWith(`${url}#`)) pageTextCache.delete(key);
  }
  const cached = documentCache.get(url);
  if (!cached) return;
  documentCache.delete(url);
  void cached
    .then((doc) => (doc as unknown as { destroy?: () => Promise<void> }).destroy?.())
    .catch(() => undefined);
}

export interface PdfPageText {
  items: unknown[];
  viewportHeight: number;
}

/** Extracted text per page, keyed `${url}#${pageNumber}`; released with the document. */
const pageTextCache = new Map<string, Promise<PdfPageText>>();

export function getPdfPageText(url: string, pageNumber: number): Promise<PdfPageText> {
  const key = `${url}#${pageNumber}`;
  let cached = pageTextCache.get(key);
  if (!cached) {
    cached = getPdfDocument(url).then(async (doc) => {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      return { items: content.items as unknown[], viewportHeight: page.getViewport({ scale: 1 }).height };
    });
    // A failed extraction must not poison the cache.
    cached.catch(() => pageTextCache.delete(key));
    pageTextCache.set(key, cached);
  }
  return cached;
}

/** Rasterise one page into a canvas at `quality` device pixels per CSS pixel. */
export async function renderPdfPage(
  url: string,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  cssWidthPx: number,
  cssHeightPx: number,
  quality: number,
): Promise<void> {
  const doc = await getPdfDocument(url);
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const pixelRatio = Math.max(1, Math.min(4, quality));
  const width = Math.max(1, Math.round(cssWidthPx * pixelRatio));
  const height = Math.max(1, Math.round(cssHeightPx * pixelRatio));
  renderTasks.get(canvas)?.cancel();
  // Draw into an offscreen buffer first: resizing the visible canvas clears it,
  // which would flash white until pdf.js finishes the new raster.
  const buffer = document.createElement("canvas");
  buffer.width = width;
  buffer.height = height;
  const viewport = page.getViewport({ scale: width / base.width });
  const context = buffer.getContext("2d");
  if (!context) return;
  const task = page.render({ canvas: buffer, viewport });
  renderTasks.set(canvas, task);
  try {
    await task.promise;
  } catch {
    // A cancelled render is expected while zooming or switching pages.
    return;
  }
  // A newer render owns the canvas now; drop this stale bitmap.
  if (renderTasks.get(canvas) !== task) return;
  // Resize and blit in one synchronous step, so the old bitmap never disappears.
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${cssWidthPx}px`;
  canvas.style.height = `${cssHeightPx}px`;
  canvas.getContext("2d")?.drawImage(buffer, 0, 0);
  buffer.width = 0;
  buffer.height = 0;
}

export type PersistenceMode = "editable" | "flattened";

export interface PdfExportPage {
  templateId: string;
  landscape: boolean;
  rotation: 0 | 90 | 180 | 270;
  widthMm: number;
  heightMm: number;
  /** 1-based page in the source PDF, when this page came from one. */
  pdfPageIndex?: number;
  cropBox?: { xMm: number; yMm: number; widthMm: number; heightMm: number };
  annotations: Annotation[];
}

export interface PdfExportInput {
  title: string;
  pages: PdfExportPage[];
  sourceBytes?: Uint8Array;
  mode: PersistenceMode;
  /** Outline entries kept in the sidecar so a reopened tab has its bookmarks back. */
  bookmarks?: PdfBookmark[];
}

export interface SerializedPage {
  templateId: string;
  landscape: boolean;
  rotation: number;
  widthMm: number;
  heightMm: number;
  pdfPageIndex?: number;
  cropBox?: { xMm: number; yMm: number; widthMm: number; heightMm: number };
  annotations: Annotation[];
}

export interface SerializedDocument {
  version: 1;
  title: string;
  savedAt: string;
  pages: SerializedPage[];
  bookmarks?: PdfBookmark[];
}

export function encodeSidecar(document: SerializedDocument): string {
  return SIDECAR_PREFIX + bytesToBase64(new TextEncoder().encode(JSON.stringify(document)));
}

export function decodeSidecar(value: string): SerializedDocument | null {
  if (!value.startsWith(SIDECAR_PREFIX)) return null;
  try {
    const json = new TextDecoder().decode(base64ToBytes(value.slice(SIDECAR_PREFIX.length)));
    const parsed = JSON.parse(json) as SerializedDocument;
    return parsed.version === 1 && Array.isArray(parsed.pages) ? parsed : null;
  } catch {
    return null;
  }
}

/** Cheap ASCII scan: most PDFs have no sidecar, so avoid parsing those entirely. */
function containsAscii(bytes: Uint8Array, text: string): boolean {
  const needle = new TextEncoder().encode(text);
  const limit = bytes.length - needle.length;
  outer: for (let index = 0; index <= limit; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/** Async sidecar reader used by the import path and tests. */
export async function loadSidecar(bytes: Uint8Array): Promise<SerializedDocument | null> {
  if (!containsAscii(bytes, SIDECAR_KEY)) return null;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const value = doc.catalog.lookup(PDFName.of(SIDECAR_KEY));
  return value instanceof PDFString ? decodeSidecar(value.decodeText()) : null;
}

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0");
  const number = Number.parseInt(value.slice(0, 6), 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

const DASH: Record<LineStyleName, (width: number) => number[]> = {
  solid: () => [],
  dash: (width) => [Math.max(1.2, width * 4), Math.max(0.8, width * 2.4)],
  dot: (width) => [Math.max(0.2, width), Math.max(0.9, width * 2.2)],
  "dash-dot": (width) => [Math.max(1.4, width * 5), Math.max(0.8, width * 2), Math.max(0.2, width), Math.max(0.8, width * 2)],
};

function arrowHeadPath(tip: Pt, from: Pt, kind: number, size: number): { path: string; filled: boolean } | null {
  if (!kind) return null;
  const angle = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const length = size;
  const spread = size * 0.42;
  const wing = (side: 1 | -1): Pt => [
    tip[0] - Math.cos(angle) * length - Math.cos(angle + (Math.PI / 2) * side) * spread,
    tip[1] - Math.sin(angle) * length - Math.sin(angle + (Math.PI / 2) * side) * spread,
  ];
  const left = wing(1);
  const right = wing(-1);
  if (kind === 3) {
    return { path: `M ${left[0]} ${left[1]} L ${tip[0]} ${tip[1]} L ${right[0]} ${right[1]}`, filled: false };
  }
  if (kind === 7) {
    const back: Pt = [tip[0] - Math.cos(angle) * length, tip[1] - Math.sin(angle) * length];
    return {
      path: polylinePath([tip, left, back, right], true),
      filled: true,
    };
  }
  if (kind === 10) {
    const back: Pt = [tip[0] - Math.cos(angle) * length, tip[1] - Math.sin(angle) * length];
    return { path: polylinePath([tip, left, back, right], true), filled: true };
  }
  return { path: polylinePath([tip, left, right], true), filled: true };
}

interface DrawContext {
  pdf: PDFDocument;
  page: PDFPage;
  widthMm: number;
  heightMm: number;
  fonts: Map<StandardFonts, Promise<PDFFont>>;
  images: Map<string, Promise<PDFImage | null>>;
  formulas: Map<string, Promise<PDFImage | null>>;
}

function fontFor(context: DrawContext, name: StandardFonts): Promise<PDFFont> {
  let font = context.fonts.get(name);
  if (!font) {
    font = context.pdf.embedFont(name);
    context.fonts.set(name, font);
  }
  return font;
}

function standardFontFor(annotation: TextAnnotation): StandardFonts {
  if (annotation.fontFamily === "Courier") {
    if (annotation.bold && annotation.italic) return StandardFonts.CourierBoldOblique;
    if (annotation.bold) return StandardFonts.CourierBold;
    if (annotation.italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (annotation.fontFamily === "TimesRoman") {
    if (annotation.bold && annotation.italic) return StandardFonts.TimesRomanBoldItalic;
    if (annotation.bold) return StandardFonts.TimesRomanBold;
    if (annotation.italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (annotation.bold && annotation.italic) return StandardFonts.HelveticaBoldOblique;
  if (annotation.bold) return StandardFonts.HelveticaBold;
  if (annotation.italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/** CSS-style clockwise rotation around a centre, in screen (y-down) millimetres. */
function rotateMm(point: Pt, center: Pt, rotation: number): Pt {
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
}

function toPdfPoint(point: Pt, heightMm: number): { x: number; y: number } {
  return { x: point[0] * PT_PER_MM, y: (heightMm - point[1]) * PT_PER_MM };
}

/** Lower-left corner of a box after rotating it around its own centre. */
function rotatedLowerLeft(
  box: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  rotation: number,
  heightMm: number,
): { x: number; y: number } {
  const center: Pt = [box.xMm + box.widthMm / 2, box.yMm + box.heightMm / 2];
  return toPdfPoint(rotateMm([box.xMm, box.yMm + box.heightMm], center, rotation), heightMm);
}

const STAMP_URL_PREFIXES = ["data:image/", "blob:", "/assets/"];

/** An annotation keeps no copy when its library stamp still resolves. */
function stampImageUrl(annotation: Extract<Annotation, { type: "stamp" }>): string | undefined {
  return annotation.imageUrl || resolveStamp(annotation.stampId)?.imageUrl;
}

async function embedStampImage(pdf: PDFDocument, imageUrl: string): Promise<PDFImage | null> {
  // Only self-produced stamps may be fetched; anything else is ignored.
  if (!STAMP_URL_PREFIXES.some((prefix) => imageUrl.startsWith(prefix))) return null;
  const embed = async (bytes: Uint8Array): Promise<PDFImage | null> => {
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    return isJpeg ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
  };
  try {
    if (imageUrl.startsWith("data:")) {
      const comma = imageUrl.indexOf(",");
      const meta = imageUrl.slice(0, comma);
      const payload = imageUrl.slice(comma + 1);
      if (meta.includes("svg")) return null;
      return await embed(base64ToBytes(payload));
    }
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    return await embed(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

async function drawAnnotation(context: DrawContext, annotation: Annotation): Promise<void> {
  const { page, heightMm } = context;
  if (annotation.hidden) return;
  const svgOptions = { x: 0, y: heightMm * PT_PER_MM, scale: PT_PER_MM };

  switch (annotation.type) {
    case "pen": {
      const style = annotation.penStyle ?? (annotation.sensitivity ? "pro" : "basic");
      const path = inkPath(annotation.points, annotation.thicknessMm, {
        ...penStyleOptions(style, annotation.pressureLevel ?? (annotation.sensitivity ? 55 : 0)),
        simulatePressure: false,
      });
      if (!path) return;
      page.drawSvgPath(path, {
        ...svgOptions,
        color: hexToRgb(annotation.color),
        opacity: annotation.opacity,
      });
      return;
    }
    case "marker": {
      const path = markerPath(annotation.points, annotation.thicknessMm, annotation.tipStyle);
      if (!path) return;
      page.drawSvgPath(path, {
        ...svgOptions,
        color: hexToRgb(annotation.color),
        opacity: markerOpacity(annotation.opacity),
      });
      return;
    }
    case "shape": {
      await drawShape(context, annotation, svgOptions);
      return;
    }
    case "stamp": {
      const url = stampImageUrl(annotation);
      const image = url ? await context.images.get(url) : null;
      if (!image) return;
      const width = annotation.widthMm * PT_PER_MM;
      const height = annotation.heightMm * PT_PER_MM;
      const cx = (annotation.xMm + annotation.widthMm / 2) * PT_PER_MM;
      const cy = (heightMm - annotation.yMm - annotation.heightMm / 2) * PT_PER_MM;
      const radians = (-annotation.rotation * Math.PI) / 180;
      const x = cx - (width / 2) * Math.cos(radians) + (height / 2) * Math.sin(radians);
      const yPos = cy - (width / 2) * Math.sin(radians) - (height / 2) * Math.cos(radians);
      // A negative scale mirrors the image around its lower-left corner, so move that corner first.
      const shiftX = (annotation.flipH ? width * Math.cos(radians) : 0) - (annotation.flipV ? height * Math.sin(radians) : 0);
      const shiftY = (annotation.flipH ? width * Math.sin(radians) : 0) + (annotation.flipV ? height * Math.cos(radians) : 0);
      page.drawImage(image, {
        x: x + shiftX,
        y: yPos + shiftY,
        width: annotation.flipH ? -width : width,
        height: annotation.flipV ? -height : height,
        opacity: annotation.opacity,
        rotate: degrees(-annotation.rotation),
      });
      return;
    }
    case "text": {
      await drawTextBox(context, annotation);
      return;
    }
    case "formula": {
      await drawFormula(context, annotation);
      return;
    }
  }
}

interface BoxFrame {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotation: number;
}

function drawBoxFill(
  context: DrawContext,
  box: BoxFrame,
  options: { fillColor?: string; fillTransparent?: boolean; borderColor: string; borderWidth: number; rounded?: boolean; opacity?: number },
): void {
  const { page, heightMm } = context;
  const opacity = options.opacity ?? 1;
  const corner = rotatedLowerLeft(box, box.rotation, heightMm);
  const color = options.fillTransparent ? undefined : options.fillColor ? hexToRgb(options.fillColor) : undefined;
  if (options.rounded && box.rotation === 0) {
    const radius = Math.min(3, box.widthMm / 4, box.heightMm / 4);
    const x = box.xMm;
    const y = box.yMm;
    const w = box.widthMm;
    const h = box.heightMm;
    const path =
      `M ${x + radius} ${y} H ${x + w - radius} Q ${x + w} ${y} ${x + w} ${y + radius} ` +
      `V ${y + h - radius} Q ${x + w} ${y + h} ${x + w - radius} ${y + h} ` +
      `H ${x + radius} Q ${x} ${y + h} ${x} ${y + h - radius} ` +
      `V ${y + radius} Q ${x} ${y} ${x + radius} ${y} Z`;
    page.drawSvgPath(path, {
      x: 0,
      y: heightMm * PT_PER_MM,
      scale: PT_PER_MM,
      color,
      opacity: color ? opacity : undefined,
      borderColor: options.borderWidth > 0 ? hexToRgb(options.borderColor) : undefined,
      borderWidth: options.borderWidth > 0 ? options.borderWidth : undefined,
      borderOpacity: opacity,
    });
    return;
  }
  page.drawRectangle({
    x: corner.x,
    y: corner.y,
    width: box.widthMm * PT_PER_MM,
    height: box.heightMm * PT_PER_MM,
    rotate: degrees(-box.rotation),
    color,
    opacity: color ? opacity : undefined,
    borderColor: options.borderWidth > 0 ? hexToRgb(options.borderColor) : undefined,
    borderWidth: options.borderWidth > 0 ? options.borderWidth : undefined,
    borderOpacity: opacity,
  });
}

const WINANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** pdf-lib's standard fonts only encode WinAnsi; anything else needs a raster. */
export function isWinAnsiText(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(char)) continue;
    return false;
  }
  return true;
}

async function drawTextBox(context: DrawContext, annotation: TextAnnotation): Promise<void> {
  const { page, heightMm } = context;
  const box: BoxFrame = {
    xMm: annotation.xMm,
    yMm: annotation.yMm,
    widthMm: annotation.widthMm,
    heightMm: annotation.heightMm,
    rotation: annotation.rotation,
  };
  const opacity = annotation.opacity;
  const center: Pt = [annotation.xMm + annotation.widthMm / 2, annotation.yMm + annotation.heightMm / 2];

  if (annotation.frameType === 3) {
    drawBoxFill(
      context,
      { ...box, xMm: box.xMm + 1.3, yMm: box.yMm + 1.3 },
      {
        fillColor: "#14161b",
        fillTransparent: false,
        borderColor: annotation.frameColor,
        borderWidth: 0,
        opacity: annotation.opacity,
      },
    );
  }
  drawBoxFill(context, box, {
    fillColor: annotation.boxFillColor,
    fillTransparent: annotation.boxFillTransparent,
    borderColor: annotation.frameColor,
    borderWidth: annotation.frameType === 0 ? 0 : annotation.lineWidthMm,
    rounded: annotation.frameType === 2,
    opacity: annotation.opacity,
  });

  if (!annotation.text) return;
  const layout = layoutText(annotation);
  if (layout.lines.some((line) => line.text && !isWinAnsiText(line.text))) {
    // Persian, CJK, Cyrillic and emoji cannot be written with a standard font.
    const raster = await rasterizeTextAnnotation(annotation);
    if (!raster) return;
    try {
      const image = await context.pdf.embedPng(raster.dataUrl);
      const corner = rotatedLowerLeft(
        { xMm: annotation.xMm, yMm: annotation.yMm, widthMm: annotation.widthMm, heightMm: annotation.heightMm },
        annotation.rotation,
        heightMm,
      );
      page.drawImage(image, {
        x: corner.x,
        y: corner.y,
        width: annotation.widthMm * PT_PER_MM,
        height: annotation.heightMm * PT_PER_MM,
        opacity,
        rotate: degrees(-annotation.rotation),
      });
    } catch {
      // A page that cannot take the raster still saves the vector frame.
    }
    return;
  }
  const font = await fontFor(context, standardFontFor(annotation));
  const padding = TEXT_PADDING_MM;
  const fontSizeMm = layout.fontSizePt * PT_TO_MM;

  for (const line of layout.lines) {
    if (!line.text) continue;
    const widthMm = measureTextWidthMm(line.text, annotation.fontFamily, annotation.bold, layout.fontSizePt);
    let xMm = annotation.xMm + padding;
    if (annotation.align === "center") xMm = annotation.xMm + (annotation.widthMm - widthMm) / 2;
    if (annotation.align === "right") xMm = annotation.xMm + annotation.widthMm - padding - widthMm;
    const scriptShiftMm =
      annotation.script === "sub" ? fontSizeMm * 0.22 : annotation.script === "super" ? -fontSizeMm * 0.3 : 0;
    const baselineMm =
      annotation.yMm + padding + line.topMm + fontSizeMm * 0.82 + scriptShiftMm;
    const start = toPdfPoint(rotateMm([xMm, baselineMm], center, annotation.rotation), heightMm);
    const size = annotation.script === "normal" ? layout.fontSizePt : layout.fontSizePt * 0.72;
    page.drawText(line.text, {
      x: start.x,
      y: start.y,
      size,
      font,
      color: hexToRgb(annotation.textColor),
      opacity,
      rotate: degrees(-annotation.rotation),
    });
    const under = (offsetMm: number, thickness: number) => {
      const yMm = baselineMm + offsetMm;
      const a = rotateMm([xMm, yMm], center, annotation.rotation);
      const b = rotateMm([xMm + widthMm, yMm], center, annotation.rotation);
      page.drawLine({
        start: toPdfPoint(a, heightMm),
        end: toPdfPoint(b, heightMm),
        thickness,
        color: hexToRgb(annotation.textColor),
        opacity,
      });
    };
    if (annotation.underline) under(0.55, Math.max(0.35, fontSizeMm * 0.07));
    if (annotation.strikeOut) under(-fontSizeMm * 0.28, Math.max(0.3, fontSizeMm * 0.06));
  }
}

async function formulaImage(context: DrawContext, annotation: FormulaAnnotation): Promise<PDFImage | null> {
  const key = `${annotation.latex}::${annotation.fontSizePt}`;
  let pending = context.formulas.get(key);
  if (!pending) {
    const widthPx = Math.max(48, Math.ceil(annotation.widthMm * 8));
    const heightPx = Math.max(24, Math.ceil(annotation.heightMm * 8));
    const fontSizePx = Math.max(8, annotation.fontSizePt * 2);
    pending = latexToPng(annotation.latex, fontSizePx, widthPx, heightPx, annotation.color).then((raster) =>
      raster ? context.pdf.embedPng(raster.dataUrl) : null,
    );
    pending = pending.catch(() => null);
    context.formulas.set(key, pending);
  }
  return pending;
}

async function drawFormula(context: DrawContext, annotation: FormulaAnnotation): Promise<void> {
  const { page, heightMm } = context;
  if (!annotation.fillTransparent) {
    drawBoxFill(
      context,
      {
        xMm: annotation.xMm,
        yMm: annotation.yMm,
        widthMm: annotation.widthMm,
        heightMm: annotation.heightMm,
        rotation: annotation.rotation,
      },
      { fillColor: annotation.fillColor, borderColor: annotation.fillColor, borderWidth: 0, opacity: annotation.opacity },
    );
  }
  const image = await formulaImage(context, annotation);
  const corner = rotatedLowerLeft(
    {
      xMm: annotation.xMm,
      yMm: annotation.yMm,
      widthMm: annotation.widthMm,
      heightMm: annotation.heightMm,
    },
    annotation.rotation,
    heightMm,
  );
  if (image) {
    page.drawImage(image, {
      x: corner.x,
      y: corner.y,
      width: annotation.widthMm * PT_PER_MM,
      height: annotation.heightMm * PT_PER_MM,
      opacity: annotation.opacity,
      rotate: degrees(-annotation.rotation),
    });
    return;
  }
  // A headless run has no canvas for KaTeX: lay the source out as plain text.
  const fallback: TextAnnotation = {
    ...annotation,
    type: "text",
    text: annotation.latex,
    fontFamily: "Helvetica",
    bold: false,
    italic: false,
    textColor: annotation.color,
    underline: false,
    strikeOut: false,
    align: "center",
    script: "normal",
    boxFillColor: annotation.fillColor,
    boxFillTransparent: true,
    frameType: 0,
    frameColor: annotation.fillColor,
    lineWidthMm: 0,
    autoFit: false,
  };
  const layout = layoutText(fallback);
  const font = await fontFor(context, StandardFonts.Helvetica);
  const center: Pt = [annotation.xMm + annotation.widthMm / 2, annotation.yMm + annotation.heightMm / 2];
  for (const line of layout.lines) {
    const widthMm = measureTextWidthMm(line.text, "Helvetica", false, layout.fontSizePt);
    const xMm = annotation.xMm + (annotation.widthMm - widthMm) / 2;
    const baselineMm = annotation.yMm + annotation.heightMm / 2 + line.topMm - (layout.lines.length * layout.lineHeightMm) / 2 + layout.lineHeightMm * 0.75;
    const start = toPdfPoint(rotateMm([xMm, baselineMm], center, annotation.rotation), heightMm);
    page.drawText(line.text, {
      x: start.x,
      y: start.y,
      size: layout.fontSizePt,
      font,
      color: hexToRgb(annotation.color),
      opacity: annotation.opacity,
      rotate: degrees(-annotation.rotation),
    });
  }
}

async function drawShape(
  context: DrawContext,
  annotation: Extract<Annotation, { type: "shape" }>,
  svgOptions: { x: number; y: number; scale: number },
): Promise<void> {
  const { page, heightMm } = context;
  const stroke = hexToRgb(annotation.strokeColor);
  const fill = annotation.fillColor && !annotation.fillTransparent ? hexToRgb(annotation.fillColor) : null;
  const dash = DASH[annotation.lineStyle](annotation.lineWidthMm);
  const options = {
    ...svgOptions,
    borderColor: stroke,
    borderWidth: annotation.lineWidthMm,
    borderOpacity: annotation.opacity,
    borderDashArray: dash.length ? dash : undefined,
    color: fill ?? undefined,
    opacity: fill ? annotation.opacity : undefined,
  };

  if (annotation.shapeType === "rectangle" || annotation.shapeType === "ellipse") {
    const box = annotationBounds(annotation);
    if (annotation.shapeType === "rectangle") {
      page.drawSvgPath(
        `M ${box.x} ${box.y} H ${box.x + box.width} V ${box.y + box.height} H ${box.x} Z`,
        options,
      );
    } else {
      const rx = box.width / 2;
      const ry = box.height / 2;
      const cx = box.x + rx;
      const cy = box.y + ry;
      page.drawSvgPath(
        `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`,
        options,
      );
    }
    return;
  }

  if (annotation.shapeType === "polygon") {
    if (annotation.points.length < 2) return;
    page.drawSvgPath(polylinePath(annotation.points, annotation.points.length > 2), options);
    return;
  }

  if (annotation.shapeType === "dimension") {
    const [start, end] = [annotation.start, annotation.end];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy) || 0.001;
    const nx = -dy / length;
    const ny = dx / length;
    const offset = Math.max(1.5, annotation.lineWidthMm * 5);
    const a: Pt = [start[0] + nx * offset, start[1] + ny * offset];
    const b: Pt = [end[0] + nx * offset, end[1] + ny * offset];
    page.drawSvgPath(`M ${start[0]} ${start[1]} L ${a[0]} ${a[1]}`, { ...options, borderWidth: annotation.lineWidthMm * 0.6 });
    page.drawSvgPath(`M ${end[0]} ${end[1]} L ${b[0]} ${b[1]}`, { ...options, borderWidth: annotation.lineWidthMm * 0.6 });
    page.drawSvgPath(`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`, options);
    const size = Math.max(2, annotation.lineWidthMm * 5);
    for (const [tip, from] of [
      [a, b],
      [b, a],
    ] as [Pt, Pt][]) {
      const head = arrowHeadPath(tip, from, 5, size);
      if (head) page.drawSvgPath(head.path, { ...svgOptions, color: stroke, opacity: annotation.opacity });
    }
    const label = formatDimension(length * annotation.dimensionScale, annotation.dimensionUnit);
    const midpoint: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const textWidth = label.length * 3.4 * 0.55;
    page.drawText(label, {
      x: (midpoint[0] - textWidth / 2) * PT_PER_MM,
      y: (heightMm - midpoint[1] - 1.4) * PT_PER_MM,
      size: 7,
      font: await fontFor(context, StandardFonts.Helvetica),
      color: stroke,
      opacity: annotation.opacity,
    });
    return;
  }

  const [start, end] = [annotation.start, annotation.end];
  page.drawSvgPath(`M ${start[0]} ${start[1]} L ${end[0]} ${end[1]}`, options);
  const size = Math.max(2.2, annotation.lineWidthMm * 5);
  const head = annotation.shapeType === "arrow" ? arrowHeadPath(end, start, annotation.arrowHead || 5, size) : null;
  if (head) {
    page.drawSvgPath(head.path, { ...svgOptions, color: stroke, opacity: annotation.opacity });
  }
  const tail = annotation.shapeType === "arrow" ? arrowHeadPath(start, end, annotation.arrowTail, size) : null;
  if (tail) {
    page.drawSvgPath(tail.path, { ...svgOptions, color: stroke, opacity: annotation.opacity });
  }
}

function drawPaperBackground(page: PDFPage, template: PaperTemplate, landscape: boolean, widthMm: number, heightMm: number) {
  const geometry = paperGeometry(template, landscape);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthMm * PT_PER_MM,
    height: heightMm * PT_PER_MM,
    color: rgb(1, 1, 0.973),
  });
  if (!geometry.hasGrid) return;
  const color = hexToRgb(geometry.color);
  const layers: [string, number, number][] = [
    [geometry.base, 0.35, 0.6],
    [geometry.minor, 0.55, 0.8],
    [geometry.major, 0.75, 1],
  ];
  for (const [path, opacity, weight] of layers) {
    if (!path) continue;
    const matches = path.match(/M([\d.]+) ([\d.]+)[HV]([\d.]+)/g) ?? [];
    for (const match of matches) {
      const parsed = /M([\d.]+) ([\d.]+)([HV])([\d.]+)/.exec(match);
      if (!parsed) continue;
      const x = Number(parsed[1]);
      const yMm = Number(parsed[2]);
      const end = Number(parsed[4]);
      page.drawLine({
        start: { x: x * PT_PER_MM, y: (heightMm - yMm) * PT_PER_MM },
        end:
          parsed[3] === "H"
            ? { x: end * PT_PER_MM, y: (heightMm - yMm) * PT_PER_MM }
            : { x: x * PT_PER_MM, y: (heightMm - end) * PT_PER_MM },
        thickness: Math.max(0.25, geometry.widthStrokeMm * weight * PT_PER_MM),
        color,
        opacity,
      });
    }
  }
}

function serializedFromInput(
  input: PdfExportInput,
  copied: boolean[],
): SerializedDocument {
  return {
    version: 1,
    title: input.title,
    savedAt: new Date().toISOString(),
    ...(input.bookmarks?.length ? { bookmarks: input.bookmarks } : {}),
    pages: input.pages.map((page, index) => ({
      templateId: page.templateId,
      landscape: page.landscape,
      rotation: page.rotation,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
      // In the rebuilt file every page sits at its new 1-based position.
      ...(copied[index] ? { pdfPageIndex: index + 1 } : {}),
      ...(page.cropBox ? { cropBox: page.cropBox } : {}),
      annotations: JSON.parse(JSON.stringify(page.annotations)) as Annotation[],
    })),
  };
}

/** Copies annotations and page settings from a sidecar back onto freshly opened pages. */
export function mergeSidecarPages(pages: DocumentPage[], sidecar: SerializedDocument | null): DocumentPage[] {
  if (!sidecar) return pages;
  return pages.map((page, index) => {
    const saved = sidecar.pages[index];
    if (!saved) return page;
    const merged: DocumentPage = {
      ...page,
      annotations: saved.annotations ?? [],
      rotation: ((((saved.rotation ?? 0) % 360) + 360) % 360) as DocumentPage["rotation"],
      ...(saved.cropBox ? { cropBox: saved.cropBox } : {}),
    };
    // No pdfPageIndex means the page was parametric when saved; show paper, not the copied raster.
    if (!saved.pdfPageIndex) return { ...merged, templateId: saved.templateId || page.templateId, pdf: undefined };
    return merged;
  });
}

/** Writes a real outline tree so viewers list the bookmarks, not only the sidecar. */
function writeOutlines(pdf: PDFDocument, bookmarks: PdfBookmark[] | undefined): void {
  if (!bookmarks?.length) return;
  const entries = bookmarks.filter(
    (bookmark) => bookmark.pageIndex >= 0 && bookmark.pageIndex < pdf.getPageCount(),
  );
  if (!entries.length) return;
  const context = pdf.context;
  const rootRef = context.nextRef();
  const root = context.obj({ Type: "Outlines" });
  context.assign(rootRef, root);
  pdf.catalog.set(PDFName.of("Outlines"), rootRef);
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));

  const parents: PDFRef[] = [rootRef];
  const lastChild = new Map<PDFRef, PDFRef>();
  const descendants = new Map<PDFRef, number>();
  for (const entry of entries) {
    const depth = Math.min(Math.max(0, entry.depth), parents.length - 1);
    parents.length = depth + 1;
    const parentRef = parents[depth];
    const ref = context.nextRef();
    const dict = context.obj({
      Title: PDFString.of(entry.title || "Untitled"),
      Parent: parentRef,
      Dest: context.obj([pdf.getPage(entry.pageIndex).ref, PDFName.of("Fit")]),
    });
    const previous = lastChild.get(parentRef);
    if (previous) {
      dict.set(PDFName.of("Prev"), previous);
      (context.lookup(previous) as PDFDict).set(PDFName.of("Next"), ref);
    }
    context.assign(ref, dict);
    const parent = context.lookup(parentRef) as PDFDict;
    if (!previous) parent.set(PDFName.of("First"), ref);
    parent.set(PDFName.of("Last"), ref);
    lastChild.set(parentRef, ref);
    // Every enclosing node counts this entry, so /Count matches the open subtree.
    for (const ancestor of parents) descendants.set(ancestor, (descendants.get(ancestor) ?? 0) + 1);
    parents.push(ref);
  }
  for (const [ref, count] of descendants) {
    (context.lookup(ref) as PDFDict).set(PDFName.of("Count"), PDFNumber.of(count));
  }
}

/**
 * Rebuilds the page tree from scratch: source pages are copied one by one in
 * tab order, paper pages are drawn fresh, then rotation and crop are applied.
 * Reordering, duplicating or deleting pages therefore survives an export
 * instead of silently keeping the source document's page order. Editable
 * mode writes annotations only to the sidecar, so reopening never double-draws.
 */
export async function exportPdf(input: PdfExportInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.title);
  pdf.setProducer("PDF Master");

  const needsSource = input.pages.some((page) => page.pdfPageIndex !== undefined);
  let source: PDFDocument | null = null;
  if (needsSource) {
    try {
      if (!input.sourceBytes) throw new Error("missing source bytes");
      source = await PDFDocument.load(input.sourceBytes, { updateMetadata: false });
    } catch {
      throw new Error("Source PDF bytes are unavailable or unreadable");
    }
  }

  const flatten = input.mode === "flattened";
  const images = new Map<string, Promise<PDFImage | null>>();
  if (flatten) {
    for (const pageInput of input.pages) {
      for (const annotation of pageInput.annotations) {
        if (annotation.type !== "stamp") continue;
        const url = stampImageUrl(annotation);
        if (url && !images.has(url)) images.set(url, embedStampImage(pdf, url));
      }
    }
  }

  const fonts = new Map<StandardFonts, Promise<PDFFont>>();
  const formulas = new Map<string, Promise<PDFImage | null>>();
  const copied: boolean[] = [];

  for (const pageInput of input.pages) {
    const sourceIndex = pageInput.pdfPageIndex;
    let page: PDFPage;
    let fromPdf = false;
    if (sourceIndex !== undefined) {
      if (!source || sourceIndex < 1 || sourceIndex > source.getPageCount()) {
        throw new Error("Source PDF bytes are unavailable or unreadable");
      }
      const [copy] = await pdf.copyPages(source, [sourceIndex - 1]);
      page = pdf.addPage(copy);
      if (pageInput.rotation) {
        page.setRotation(degrees((page.getRotation().angle + pageInput.rotation) % 360));
      }
      fromPdf = true;
    } else {
      page = pdf.addPage([pageInput.widthMm * PT_PER_MM, pageInput.heightMm * PT_PER_MM]);
      if (pageInput.rotation) page.setRotation(degrees(pageInput.rotation));
      const template = paperById.get(pageInput.templateId);
      if (template) drawPaperBackground(page, template, pageInput.landscape, pageInput.widthMm, pageInput.heightMm);
    }
    copied.push(fromPdf);

    if (pageInput.cropBox) {
      const crop = pageInput.cropBox;
      page.setCropBox(
        crop.xMm * PT_PER_MM,
        (pageInput.heightMm - crop.yMm - crop.heightMm) * PT_PER_MM,
        crop.widthMm * PT_PER_MM,
        crop.heightMm * PT_PER_MM,
      );
    }

    if (!flatten) continue;
    for (const annotation of pageInput.annotations) {
      try {
        await drawAnnotation(
          { pdf, page, widthMm: pageInput.widthMm, heightMm: pageInput.heightMm, fonts, images, formulas },
          annotation,
        );
      } catch {
        // One unencodable annotation must never abort the whole save or print.
      }
    }
  }

  writeOutlines(pdf, input.bookmarks);
  if (input.mode === "editable") {
    pdf.catalog.set(PDFName.of(SIDECAR_KEY), PDFString.of(encodeSidecar(serializedFromInput(input, copied))));
  }

  // Object streams would hide the sidecar key from the cheap byte scan on import.
  return pdf.save({ useObjectStreams: false });
}

/** Merges PDFs page by page into one flat document, in the order given. */
export async function combinePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  if (parts.length < 2) throw new Error("Combining documents needs at least two PDFs");
  const merged = await PDFDocument.create();
  merged.setProducer("PDF Master");
  for (const bytes of parts) {
    const source = await PDFDocument.load(bytes, { updateMetadata: false });
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return merged.save();
}

/** Convenience wrapper used by the Save button and the tests. */
export function exportInputFromTab(tab: DocumentTab, mode: PersistenceMode): PdfExportInput {
  return {
    title: tab.title,
    mode,
    sourceBytes: tab.pdf?.bytes,
    bookmarks: tab.pdf?.bookmarks,
    pages: tab.pages.map((page) => {
      const size = pageSizeMm(tab, page);
      return {
        templateId: page.templateId,
        landscape: tab.landscape,
        rotation: page.rotation,
        widthMm: size.widthMm,
        heightMm: size.heightMm,
        pdfPageIndex: page.pdf?.pageNumber,
        ...(page.cropBox ? { cropBox: page.cropBox } : {}),
        annotations: page.annotations,
      };
    }),
  };
}

export function downloadPdf(bytes: Uint8Array, filename: string, mime = "application/pdf"): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = mime === "application/pdf" && !filename.endsWith(".pdf") ? `${filename}.pdf` : filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
