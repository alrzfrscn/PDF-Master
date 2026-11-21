import type { TextAnnotation } from "../../lib/annotationTypes";
import { layoutText, PT_TO_MM, TEXT_PADDING_MM, textFontCss } from "../../lib/textLayout";

/** Matches HTML dir="auto": checks the first strong directional character. */
function isRtlLine(text: string): boolean {
  for (const ch of text) {
    if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/.test(ch)) return true;
    if (/[A-Za-z]/.test(ch)) return false;
  }
  return false;
}

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
  const decoration = `${annotation.underline ? "underline " : ""}${annotation.strikeOut ? "line-through" : ""}`.trim() || undefined;

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
        const rtl = isRtlLine(line.text);
        let x = annotation.xMm + padding;
        let anchor: "start" | "middle" | "end" = rtl ? "end" : "start";
        if (annotation.align === "center") {
          x = annotation.xMm + annotation.widthMm / 2;
          anchor = "middle";
        } else if (annotation.align === "right") {
          x = annotation.xMm + annotation.widthMm - padding;
          anchor = rtl ? "start" : "end";
        }
        const scriptShift =
          annotation.script === "sub" ? fontSizeMm * 0.22 : annotation.script === "super" ? -fontSizeMm * 0.3 : 0;
        const baseline = annotation.yMm + padding + line.topMm + fontSizeMm * 0.82 + scriptShift;
        const size = annotation.script === "normal" ? fontSizeMm : fontSizeMm * 0.72;
        return (
          <text
            key={index}
            x={x}
            y={baseline}
            fontSize={size}
            fontWeight={annotation.bold ? 700 : 400}
            fontStyle={annotation.italic ? "italic" : "normal"}
            textAnchor={anchor}
            direction={rtl ? "rtl" : "ltr"}
            textDecoration={decoration}
            fill={annotation.textColor}
            style={{
              fontFamily: textFontCss(annotation.fontFamily),
              unicodeBidi: "isolate",
              whiteSpace: "pre",
            }}
          >
            {line.text}
          </text>
        );
      })}
    </g>
  );
}