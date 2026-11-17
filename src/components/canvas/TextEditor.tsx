import { useEffect, useRef, useState } from "react";
import type { AnnotationPatch, TextAnnotation } from "../../lib/annotationTypes";
import { PX_PER_MM } from "../../lib/paper";
import { editorHeightMm, PT_TO_MM, TEXT_PADDING_MM, textFontCss } from "../../lib/textLayout";

interface Props {
  draft: TextAnnotation;
  onPatch: (patch: AnnotationPatch) => void;
  onFit: (text: string) => void;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * In-place editor aligned to the text box: same mm position, font and frame,
 * scaled by the page's CSS zoom because it lives inside the page wrapper.
 */
export function TextEditor({ draft, onPatch, onFit, onCommit, onCancel }: Props) {
  const [value, setValue] = useState(draft.text);
  const done = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  const fontSizePx = draft.fontSizePt * PT_TO_MM * PX_PER_MM;
  const radius = Math.min(3, draft.widthMm / 4, draft.heightMm / 4) * PX_PER_MM;
  const width = Math.max(20, draft.widthMm) * PX_PER_MM;
  const height = Math.max(8, editorHeightMm({ ...draft, text: value })) * PX_PER_MM;

  return (
    <div
      className="absolute z-30"
      style={{
        left: draft.xMm * PX_PER_MM,
        top: draft.yMm * PX_PER_MM,
        width,
        height,
        transform: draft.rotation ? `rotate(${draft.rotation}deg)` : undefined,
        transformOrigin: "center",
        opacity: draft.opacity,
      }}
    >
      {draft.frameType === 3 && (
        <div
          className="absolute inset-0"
          style={{ transform: "translate(1.2mm, 1.2mm)", background: "rgba(20,22,27,0.2)", borderRadius: radius }}
        />
      )}
      <textarea
        ref={inputRef}
        value={value}
        aria-label="Edit text box"
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
            return;
          }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            finish(true);
            return;
          }
          if (!(event.ctrlKey || event.metaKey)) return;
          const key = event.key.toLowerCase();
          if (key === "b") {
            event.preventDefault();
            onPatch({ bold: !draft.bold });
          } else if (key === "i") {
            event.preventDefault();
            onPatch({ italic: !draft.italic });
          } else if (key === "u") {
            event.preventDefault();
            onPatch({ underline: !draft.underline });
          } else if (key === "m") {
            event.preventDefault();
            onFit(value);
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          resize: "none",
          overflow: "hidden",
          padding: `${TEXT_PADDING_MM * PX_PER_MM}px`,
          fontFamily: textFontCss(draft.fontFamily, draft.bold, draft.italic),
          fontSize: fontSizePx,
          fontStyle: draft.italic ? "italic" : "normal",
          fontWeight: draft.bold ? 700 : 400,
          textDecoration: `${draft.underline ? "underline " : ""}${draft.strikeOut ? "line-through" : ""}`.trim() || "none",
          lineHeight: 1.25,
          color: draft.textColor,
          textAlign: draft.align,
          background: draft.boxFillTransparent ? "transparent" : draft.boxFillColor,
          border: draft.frameType === 0 ? "1px dashed var(--accent)" : `${Math.max(1, draft.lineWidthMm * PX_PER_MM)}px solid ${draft.frameColor}`,
          borderRadius: draft.frameType === 2 ? radius : 0,
          outline: "none",
          caretColor: draft.textColor,
          boxShadow: draft.frameType === 0 ? "0 0 0 1px var(--accent-soft)" : undefined,
        }}
      />
    </div>
  );
}
