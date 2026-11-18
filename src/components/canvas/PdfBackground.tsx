import { useEffect, useRef } from "react";
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
export function PdfBackground({ page, widthMm, heightMm, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    // 2× floor keeps pages (and printouts) sharp when zoomed out.
    const quality = Math.min(4, Math.max(2, zoom * (window.devicePixelRatio || 1)));
    const timer = window.setTimeout(() => {
      if (cancelled || !canvasRef.current) return;
      void renderPdfPage(page.url, page.pageNumber, canvasRef.current, widthMm * PX_PER_MM, heightMm * PX_PER_MM, quality);
    }, 70);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [page.url, page.pageNumber, widthMm, heightMm, zoom]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-label={`PDF page ${page.pageNumber}`} />;
}
