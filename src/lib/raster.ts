import { PX_PER_MM } from "./paper";
import type { BBox } from "./annotationTypes";

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
 * Snapshots a page region (paper or PDF background + annotations) at a chosen
 * DPI. Returns null when there is no live page DOM, as in unit tests.
 */
export async function captureRegion(
  pageElement: HTMLElement | null,
  region: BBox,
  dpi = 150,
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

  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim() || "#fffdf8";
  context.fillRect(0, 0, widthPx, heightPx);

  const paper = pageElement.querySelector<SVGSVGElement>('svg[role="img"]');
  if (paper) await drawSvgElement(context, paper, region, widthPx, heightPx);

  for (const source of pageElement.querySelectorAll("canvas")) {
    const pageWidthMm = (pageElement.clientWidth || 1) / PX_PER_MM;
    const sx = (region.x / pageWidthMm) * source.width;
    const sy = (region.y / pageWidthMm) * source.height;
    const sw = (region.width / pageWidthMm) * source.width;
    const sh = (region.height / pageWidthMm) * source.height;
    try {
      context.drawImage(source, sx, sy, sw, sh, 0, 0, widthPx, heightPx);
    } catch {
      // A PDF canvas that has not painted yet simply stays transparent.
    }
  }

  const annotations = pageElement.querySelector<SVGSVGElement>("svg[data-annotation-layer]");
  if (annotations) {
    await drawSvgElement(context, annotations, region, widthPx, heightPx);
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: widthPx, height: heightPx };
}
