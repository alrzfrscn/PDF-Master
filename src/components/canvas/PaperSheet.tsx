import { useMemo } from "react";
import { PX_PER_MM, pageMm, paperGeometry } from "../../lib/paper";
import type { PaperTemplate } from "../../lib/types";

interface PaperSheetProps {
  template: PaperTemplate;
  landscape?: boolean;
  /** Dashed margin and centre guides for aligning annotations. */
  aux?: boolean;
  /** Off when an unscaled sheet frame already casts the shadow. */
  shadow?: boolean;
  className?: string;
}

/**
 * Parametric paper engine: one SVG per recipe, drawn in millimetres so every
 * line width and margin survives zooming without re-rasterising.
 */
export function PaperSheet({ template, landscape = false, aux = false, shadow = true, className = "" }: PaperSheetProps) {
  const geometry = useMemo(() => paperGeometry(template, landscape), [template, landscape]);
  const page = pageMm(template, landscape);
  const widthPx = page.widthMm * PX_PER_MM;
  const heightPx = page.heightMm * PX_PER_MM;
  const bounds = template.bounds;

  return (
    <div
      className={`overflow-hidden ${shadow ? "paper-shadow" : ""} ${className}`}
      style={{ width: widthPx, height: heightPx }}
      data-template={template.id}
    >
      <svg
        viewBox={`0 0 ${geometry.widthMm} ${geometry.heightMm}`}
        width={widthPx}
        height={heightPx}
        role="img"
        aria-label={`${template.name} paper`}
        style={{ display: "block" }}
      >
        <rect width={geometry.widthMm} height={geometry.heightMm} fill="var(--paper)" />
        {geometry.hasGrid && (
          <g fill="none" stroke={geometry.color}>
            {/* Screen hairlines: non-scaling keeps 0.1 mm rules readable at every zoom. */}
            {geometry.base && (
              <path d={geometry.base} strokeWidth={0.7} vectorEffect="non-scaling-stroke" opacity={0.6} />
            )}
            {geometry.minor && (
              <path d={geometry.minor} strokeWidth={0.9} vectorEffect="non-scaling-stroke" opacity={0.8} />
            )}
            {geometry.major && (
              <path d={geometry.major} strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        )}
        {aux && (
          <g
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          >
            <line x1={geometry.widthMm / 2} y1="0" x2={geometry.widthMm / 2} y2={geometry.heightMm} />
            <line x1="0" y1={geometry.heightMm / 2} x2={geometry.widthMm} y2={geometry.heightMm / 2} />
            {bounds && (
              <rect
                x={bounds.left}
                y={bounds.top}
                width={geometry.widthMm - bounds.left - bounds.right}
                height={geometry.heightMm - bounds.top - bounds.bottom}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
