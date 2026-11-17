import { useEffect, useState } from "react";
import type { FormulaAnnotation } from "../../lib/annotationTypes";
import { latexToHtml } from "../../lib/formula";
import { PT_TO_MM } from "../../lib/textLayout";

/** KaTeX renders inside a foreignObject so the formula scales with the page. */
export function FormulaView({ annotation }: { annotation: FormulaAnnotation }) {
  const [html, setHtml] = useState("");
  useEffect(() => {
    let alive = true;
    void latexToHtml(annotation.latex).then((markup) => {
      if (alive) setHtml(markup);
    });
    return () => {
      alive = false;
    };
  }, [annotation.latex]);

  const cx = annotation.xMm + annotation.widthMm / 2;
  const cy = annotation.yMm + annotation.heightMm / 2;
  const fontSizeMm = annotation.fontSizePt * PT_TO_MM;

  return (
    <g transform={`rotate(${annotation.rotation} ${cx} ${cy})`} opacity={annotation.opacity}>
      {!annotation.fillTransparent && (
        <rect
          x={annotation.xMm}
          y={annotation.yMm}
          width={annotation.widthMm}
          height={annotation.heightMm}
          fill={annotation.fillColor}
        />
      )}
      <foreignObject
        x={annotation.xMm}
        y={annotation.yMm}
        width={annotation.widthMm}
        height={annotation.heightMm}
        style={{ overflow: "visible" }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: `${fontSizeMm}mm`,
            color: annotation.color,
            lineHeight: 1.15,
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </foreignObject>
    </g>
  );
}
