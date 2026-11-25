import { PX_PER_MM } from "./paper";
import type { BBox, TextAnnotation } from "./annotationTypes";
import { layoutText, TEXT_PADDING_MM } from "./textLayout";
import type { PdfPageSource } from "./types";

export interface RasterImage {
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image could not be decoded"));
    image.src = src;
  });
}

/** Reads any browser-decodable image (including SVG) and normalises it to PNG. */
export async function readImageFile(file: File): Promise<RasterImage> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("image could not be read"));
    reader.readAsDataURL(file);
  });
  const image = await loadImage(source);
  const maxSide = 2400;
  const width = image.naturalWidth || 800;
  const height = image.naturalHeight || 800;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

const PT_TO_MM_RASTER = 25.4 / 72;

function cssFontFamily(name: string): string {
  if (name === "Courier") return "monospace";
  if (name === "TimesRoman") return "serif";
  return "sans-serif";
}

/**
 * Draws a text box with the browser's own font stack. Standard PDF fonts only
 * support WinAnsi, so Persian, CJK, Cyrillic and emoji text is embedded as a
 * transparent PNG instead of aborting the export.
 */
export async function rasterizeTextAnnotation(annotation: TextAnnotation): Promise<RasterImage | null> {
  if (typeof document === "undefined") return null;
  const widthMm = Math.max(1, annotation.widthMm);
  const heightMm = Math.max(1, annotation.heightMm);
  const pxPerMm = Math.max(2, Math.min(8, 2048 / Math.max(widthMm, heightMm)));
  const width = Math.max(1, Math.ceil(widthMm * pxPerMm));
  const height = Math.max(1, Math.ceil(heightMm * pxPerMm));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const layout = layoutText(annotation);
  const fontPx = Math.max(1, layout.fontSizePt * PT_TO_MM_RASTER * pxPerMm);
  const family = cssFontFamily(annotation.fontFamily);
  context.font = `${annotation.italic ? "italic " : ""}${annotation.bold ? "600 " : ""}${fontPx}px ${family}`;
  context.fillStyle = annotation.textColor;
  context.textBaseline = "alphabetic";
  const padding = TEXT_PADDING_MM * pxPerMm;
  for (const line of layout.lines) {
    if (!line.text) continue;
    const lineWidth = context.measureText(line.text).width;
    const x =
      annotation.align === "center"
        ? (width - lineWidth) / 2
        : annotation.align === "right"
          ? width - padding - lineWidth
          : padding;
    const baseline = (TEXT_PADDING_MM + line.topMm + layout.fontSizePt * PT_TO_MM_RASTER * 0.82) * pxPerMm;
    context.fillText(line.text, x, baseline);
  }
  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}

/** Renders an HTML fragment (used for KaTeX) to a PNG via an SVG foreignObject. */
export async function rasterizeHtml(html: string, widthPx: number, heightPx: number, pixelRatio = 2): Promise<RasterImage | null> {
  if (typeof document === "undefined") return null;
  const width = Math.max(1, Math.ceil(widthPx));
  const height = Math.max(1, Math.ceil(heightPx));
  const scale = Math.max(1, Math.min(4, pixelRatio));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<foreignObject width="100%" height="100%">
<div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;color:#101114;background:transparent;">${html}</div>
</foreignObject></svg>`;
  try {
    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

const CSS_VARS = [
  "--paper",
  "--accent",
  "--accent-soft",
  "--fg",
  "--muted",
  "--border",
  "--grid-ink",
  "--glass-strong",
];

function resolvedVars(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const computed = getComputedStyle(document.documentElement);
  const map: Record<string, string> = {};
  for (const name of CSS_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) map[name] = value;
  }
  return map;
}

function inlineVars(markup: string): string {
  const vars = resolvedVars();
  return markup.replace(/var\((--[a-z-]+?)(?:\s*,[^)]*)?\)/gi, (match, name: string) => vars[name] ?? match);
}

async function drawSvgElement(
  context: CanvasRenderingContext2D,
  element: SVGSVGElement,
  region: BBox,
  widthPx: number,
  heightPx: number,
): Promise<void> {
  const clone = element.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `${region.x} ${region.y} ${region.width} ${region.height}`);
  clone.setAttribute("width", String(widthPx));
  clone.setAttribute("height", String(heightPx));
  clone.setAttribute("preserveAspectRatio", "none");
  const markup = inlineVars(new XMLSerializer().serializeToString(clone));
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  context.drawImage(image, 0, 0, widthPx, heightPx);
}

/**
 * Maps a crop region in page millimetres onto a canvas that covers the whole
 * page. The vertical axis uses the page height, not the width.
 */
export function computeCanvasCropRect(
  region: BBox,
  canvasWidth: number,
  canvasHeight: number,
  pageWidthMm: number,
  pageHeightMm: number,
): { sx: number; sy: number; sw: number; sh: number } {
  return {
    sx: (region.x / pageWidthMm) * canvasWidth,
    sy: (region.y / pageHeightMm) * canvasHeight,
    sw: (region.width / pageWidthMm) * canvasWidth,
    sh: (region.height / pageHeightMm) * canvasHeight,
  };
}

export interface CaptureRegionOptions {
  pageWidthMm: number;
  pageHeightMm: number;
  /** The active PDF page, so an empty on-screen canvas can be re-rendered. */
  pdfPage?: PdfPageSource;
  /** Renderer injected by the caller; keeps this module free of a circular import. */
  renderPage?: (
    url: string,
    pageNumber: number,
    canvas: HTMLCanvasElement,
    cssWidthPx: number,
    cssHeightPx: number,
    quality: number,
  ) => Promise<void>;
}

/**
 * Snapshots a page region at a chosen DPI. `pageElement` must be the active
 * `.page-paper`: its PDF canvas is sampled directly, and the outer viewport's
 * blue/cream theme background can never leak into the image.
 * Returns null when there is no live page DOM, as in unit tests.
 */
export async function captureRegion(
  pageElement: HTMLElement | null,
  region: BBox,
  dpi = 150,
  options?: CaptureRegionOptions,
): Promise<RasterImage | null> {
  if (typeof document === "undefined" || !pageElement) return null;
  const pxPerMm = dpi / 25.4;
  const widthPx = Math.max(1, Math.round(region.width * pxPerMm));
  const heightPx = Math.max(1, Math.round(region.height * pxPerMm));
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const pageWidthMm = options?.pageWidthMm ?? (pageElement.clientWidth || 1) / PX_PER_MM;
  const pageHeightMm = options?.pageHeightMm ?? (pageElement.clientHeight || 1) / PX_PER_MM;
  const liveCanvas = pageElement.querySelector<HTMLCanvasElement>('canvas[aria-label^="PDF page"]') ?? pageElement.querySelector("canvas");
  const isPdf = Boolean(options?.pdfPage || liveCanvas);

  // PDF pages always sit on crisp white; only parametric paper uses the theme
  // paper colour. Never the viewport background.
  context.fillStyle = isPdf
    ? "#ffffff"
    : getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#fffdf8";
  context.fillRect(0, 0, widthPx, heightPx);

  // A parametric paper sheet is vector; a PDF page is already painted by its canvas.
  if (!isPdf) {
    const paper = pageElement.querySelector<SVGSVGElement>('svg[role="img"]');
    if (paper) await drawSvgElement(context, paper, region, widthPx, heightPx);
  }

  let pdfCanvas = liveCanvas;
  if (isPdf && (!pdfCanvas || pdfCanvas.width === 0 || pdfCanvas.height === 0) && options?.pdfPage && options.renderPage) {
    // The on-screen canvas has not painted yet: render the page offscreen at the
    // snapshot DPI so a snapshot of any raw PDF page is always crisp content.
    const offscreen = document.createElement("canvas");
    await options.renderPage(
      options.pdfPage.url,
      options.pdfPage.pageNumber,
      offscreen,
      pageWidthMm * PX_PER_MM,
      pageHeightMm * PX_PER_MM,
      Math.max(1, dpi / 96),
    );
    pdfCanvas = offscreen;
  }
  if (pdfCanvas && pdfCanvas.width > 0 && pdfCanvas.height > 0) {
    const { sx, sy, sw, sh } = computeCanvasCropRect(region, pdfCanvas.width, pdfCanvas.height, pageWidthMm, pageHeightMm);
    try {
      context.drawImage(pdfCanvas, sx, sy, sw, sh, 0, 0, widthPx, heightPx);
    } catch {
      // A canvas that cannot be sampled leaves the white page base visible.
    }
  }

  // Only the annotation SVG is composited; selection handles and crop chrome are
  // separate DOM siblings and therefore never enter the snapshot.
  const annotations = pageElement.querySelector<SVGSVGElement>("svg[data-annotation-layer]");
  if (annotations) {
    await drawSvgElement(context, annotations, region, widthPx, heightPx);
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: widthPx, height: heightPx };
}
