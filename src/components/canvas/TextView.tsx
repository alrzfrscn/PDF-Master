import type { TextAnnotation } from "../../lib/annotationTypes";
import { layoutText, measureTextWidthMm, PT_TO_MM, TEXT_PADDING_MM, textFontCss } from "../../lib/textLayout";

/** Vector text box: shared by the canvas and (mirrored in pdf-lib) the export. */
export function TextView({ annotation }: { annotation: TextAnnotation }) {
  const layout = layoutText(annotation);
  const cx = annotation.xMm + annotation.widthMm / 2;
  const cy = annotation.yMm + annotation.heightMm / 2;
  const fontSizeMm = layout.fontSizePt * PT_TO_MM;
  const padding = TEXT_PADDING_MM;
  const frameStroke = annotation.frameType === 0 ? "none" : annotation.frameColor;
  const fill = annotation.boxFillTransparent ? "none" : annotation.boxFillColor;
  const radius = Math.min(3, annotation.widthMm / 4, annotation.heightMm / 4);

  return (
    <g transform={`rotate(${annotation.rotation} ${cx} ${cy})`} opacity={annotation.opacity}>
      {annotation.frameType === 3 && (
        <rect
          x={annotation.xMm + 1.3}
          y={annotation.yMm + 1.3}
          width={annotation.widthMm}
          height={annotation.heightMm}
          rx={0}
          fill="#14161b"
          opacity={0.18}
        />
      )}
      <rect
        x={annotation.xMm}
        y={annotation.yMm}
        width={annotation.widthMm}
        height={annotation.heightMm}
        rx={annotation.frameType === 2 ? radius : 0}
        fill={fill}
        stroke={frameStroke}
        strokeWidth={annotation.frameType === 0 ? 0 : annotation.lineWidthMm}
      />
      {layout.lines.map((line, index) => {
        if (!line.text) return null;
        const widthMm = measureTextWidthMm(line.text, annotation.fontFamily, annotation.bold, layout.fontSizePt);
        let x = annotation.xMm + padding;
        if (annotation.align === "center") x = annotation.xMm + (annotation.widthMm - widthMm) / 2;
        if (annotation.align === "right") x = annotation.xMm + annotation.widthMm - padding - widthMm;
        const scriptShift =
          annotation.script === "sub" ? fontSizeMm * 0.22 : annotation.script === "super" ? -fontSizeMm * 0.3 : 0;
        const baseline = annotation.yMm + padding + line.topMm + fontSizeMm * 0.82 + scriptShift;
        const size = annotation.script === "normal" ? fontSizeMm : fontSizeMm * 0.72;
        return (
          <g key={index}>
            <text
              x={x}
              y={baseline}
              fontSize={size}
              fill={annotation.textColor}
              style={{ fontFamily: textFontCss(annotation.fontFamily, annotation.bold, annotation.italic), whiteSpace: "pre" }}
            >
              {line.text}
            </text>
            {annotation.underline && (
              <line x1={x} y1={baseline + 0.55} x2={x + widthMm} y2={baseline + 0.55} stroke={annotation.textColor} strokeWidth={Math.max(0.25, fontSizeMm * 0.07)} />
            )}
            {annotation.strikeOut && (
              <line
                x1={x}
                y1={baseline - fontSizeMm * 0.28}
                x2={x + widthMm}
                y2={baseline - fontSizeMm * 0.28}
                stroke={annotation.textColor}
                strokeWidth={Math.max(0.22, fontSizeMm * 0.06)}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
