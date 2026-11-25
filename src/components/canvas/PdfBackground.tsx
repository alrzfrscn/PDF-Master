import { memo, useEffect, useRef } from "react";
import { renderPdfPage } from "../../lib/pdfEngine";
import { PX_PER_MM } from "../../lib/paper";
import type { PdfPageSource } from "../../lib/types";

interface Props {
  page: PdfPageSource;
  widthMm: number;
  heightMm: number;
  zoom: number;
}

/** Rasterises a source PDF page at the current zoom; the vector ink layer stays on top. */
export const PdfBackground = memo(function PdfBackground({ page, widthMm, heightMm, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Quantised so small zoom steps reuse the same raster instead of re-rendering the page.
  const renderQuality = Math.min(4, Math.max(2, Math.ceil(zoom * (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1))));

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !canvasRef.current) return;
      void renderPdfPage(page.url, page.pageNumber, canvasRef.current, widthMm * PX_PER_MM, heightMm * PX_PER_MM, renderQuality);
    }, 70);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // A page scrolled out of view keeps no full-size backing buffer.
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [page.url, page.pageNumber, widthMm, heightMm, renderQuality]);

  // CSS size always follows the .page-paper box; only the raster resolution is quantised.
  return <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-label={`PDF page ${page.pageNumber}`} />;
});
