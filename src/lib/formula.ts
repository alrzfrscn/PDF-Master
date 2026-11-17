import "katex/dist/katex.min.css";
import type { RasterImage } from "./raster";
import { rasterizeHtml } from "./raster";

/** KaTeX is loaded on demand so the editor bundle only pays for it once used. */
export async function latexToHtml(latex: string, displayMode = true): Promise<string> {
  const module = await import("katex");
  return module.default.renderToString(latex.trim() || "\\;", {
    displayMode,
    throwOnError: false,
    strict: false,
    output: "html",
  });
}

export async function latexToPng(
  latex: string,
  fontSizePx: number,
  widthPx: number,
  heightPx: number,
  color = "#101114",
): Promise<RasterImage | null> {
  if (typeof document === "undefined") return null;
  // Native MathML needs no KaTeX stylesheet inside the raster's isolated SVG document.
  const module = await import("katex");
  const html = module.default.renderToString(latex.trim() || "\\;", {
    displayMode: true,
    throwOnError: false,
    strict: false,
    output: "mathml",
  });
  const wrapper = `<div style="font-size:${fontSizePx}px;line-height:1.15;text-align:center;color:${color};">${html}</div>`;
  return rasterizeHtml(wrapper, widthPx, heightPx, 2);
}
