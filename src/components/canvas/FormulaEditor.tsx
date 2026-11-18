import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { latexToHtml } from "../../lib/formula";
import { ColorRow, SliderRow, ToggleRow } from "../ui/controls";

export interface FormulaDraft {
  latex: string;
  color: string;
  fontSizePt: number;
  fillColor: string;
  fillTransparent: boolean;
  opacity: number;
}

const PALETTES: { name: string; items: { label: string; insert: string }[] }[] = [
  {
    name: "Fractions & roots",
    items: [
      { label: "a/b", insert: "\\frac{a}{b}" },
      { label: "√x", insert: "\\sqrt{x}" },
      { label: "ⁿ√x", insert: "\\sqrt[n]{x}" },
      { label: "xⁿ", insert: "x^{n}" },
      { label: "xₙ", insert: "x_{n}" },
    ],
  },
  {
    name: "Integrals & limits",
    items: [
      { label: "∫", insert: "\\int_{a}^{b} f(x)\\,dx" },
      { label: "Σ", insert: "\\sum_{i=1}^{n}" },
      { label: "∏", insert: "\\prod_{i=1}^{n}" },
      { label: "lim", insert: "\\lim_{x \\to 0}" },
      { label: "d/dx", insert: "\\frac{d}{dx}" },
    ],
  },
  {
    name: "Matrices & brackets",
    items: [
      { label: "(matrix)", insert: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
      { label: "[matrix]", insert: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}" },
      { label: "{cases}", insert: "\\begin{cases} a & x > 0 \\\\ b & x \\le 0 \\end{cases}" },
      { label: "( )", insert: "\\left( x \\right)" },
      { label: "|x|", insert: "\\left| x \\right|" },
    ],
  },
  {
    name: "Greek",
    items: ["\\alpha", "\\beta", "\\gamma", "\\delta", "\\theta", "\\lambda", "\\mu", "\\pi", "\\sigma", "\\phi", "\\omega", "\\Omega"].map(
      (command) => ({ label: command.replace("\\", ""), insert: command }),
    ),
  },
  {
    name: "Relations & arrows",
    items: [
      { label: "=", insert: "=" },
      { label: "≈", insert: "\\approx" },
      { label: "≠", insert: "\\neq" },
      { label: "≤", insert: "\\le" },
      { label: "≥", insert: "\\ge" },
      { label: "→", insert: "\\to" },
      { label: "⇒", insert: "\\Rightarrow" },
      { label: "↔", insert: "\\leftrightarrow" },
    ],
  },
];

/** Panel size, so a caller can centre the editor on a point. */
export const FORMULA_PANEL = { width: 360, height: 520 };

interface Props {
  initial: FormulaDraft;
  anchor: { x: number; y: number };
  onSave: (draft: FormulaDraft) => void;
  onClose: () => void;
}

export function FormulaEditor({ initial, anchor, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<FormulaDraft>(initial);
  const [html, setHtml] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    void latexToHtml(draft.latex).then((markup) => {
      if (alive) setHtml(markup);
    });
    return () => {
      alive = false;
    };
  }, [draft.latex]);

  const position = useMemo(() => {
    const { width, height } = FORMULA_PANEL;
    if (typeof window === "undefined") return { left: anchor.x, top: anchor.y };
    return {
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8)),
    };
  }, [anchor.x, anchor.y]);

  const insert = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setDraft((current) => ({ ...current, latex: current.latex + snippet }));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const latex = draft.latex.slice(0, start) + snippet + draft.latex.slice(end);
    setDraft((current) => ({ ...current, latex }));
    window.setTimeout(() => {
      const caret = start + snippet.length;
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    }, 0);
  };

  return (
    <div
      className="glass-strong anim-in fixed z-[60] flex w-[360px] flex-col gap-2.5 rounded-2xl p-3 shadow-2xl"
      style={position}
      role="dialog"
      aria-label="LaTeX formula editor"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold">Formula studio</div>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-btn h-7 w-7" title="Close (Esc)" aria-label="Close formula editor" onClick={onClose}>
            <X size={13} />
          </button>
          <button
            type="button"
            className="chip h-7 px-2"
            aria-label="Apply formula"
            onClick={() => onSave({ ...draft, latex: draft.latex.trim() ? draft.latex : "\\;" })}
          >
            <Check size={12} /> Apply
          </button>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="scroll-thin min-h-[64px] resize-y rounded-lg border border-[var(--border)] bg-[var(--glass)] p-2 font-mono text-[11.5px]"
        aria-label="LaTeX source"
        spellCheck={false}
        value={draft.latex}
        onChange={(event) => setDraft((current) => ({ ...current, latex: event.target.value }))}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSave(draft);
          }
        }}
      />

      <div
        className="scroll-thin flex min-h-[42px] items-center justify-center overflow-x-auto rounded-lg px-2 py-1.5"
        style={{ background: "var(--paper)", color: draft.color, maxHeight: 84 }}
        aria-label="Formula preview"
      >
        <div style={{ fontSize: 15 }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      <div className="scroll-thin flex max-h-[186px] flex-col gap-1.5 overflow-y-auto pr-0.5">
        {PALETTES.map((group) => (
          <div key={group.name} className="flex flex-col gap-1">
            <span className="text-[9.5px] font-semibold uppercase tracking-[0.07em] text-muted">{group.name}</span>
            <div className="flex flex-wrap gap-1">
              {group.items.map((item) => (
                <button
                  key={item.insert}
                  type="button"
                  className="chip h-6 px-1.5 font-mono text-[10px]"
                  title={item.insert}
                  onClick={() => insert(item.insert)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ColorRow label="Text colour" value={draft.color} onChange={(value) => value && setDraft((c) => ({ ...c, color: value }))} />
      <SliderRow
        label="Font size"
        value={draft.fontSizePt}
        min={6}
        max={96}
        step={0.5}
        unit="pt"
        onChange={(value) => setDraft((c) => ({ ...c, fontSizePt: value }))}
      />
      <ColorRow
        label="Fill"
        value={draft.fillTransparent ? null : draft.fillColor}
        allowNone
        onChange={(value) =>
          setDraft((c) => ({ ...c, fillColor: value ?? c.fillColor, fillTransparent: value === null }))
        }
      />
      <SliderRow
        label="Opacity"
        value={Math.round(draft.opacity * 100)}
        min={5}
        max={100}
        step={1}
        unit="%"
        onChange={(value) => setDraft((c) => ({ ...c, opacity: value / 100 }))}
      />
      <ToggleRow
        label="Transparent fill"
        checked={draft.fillTransparent}
        onChange={(checked) => setDraft((c) => ({ ...c, fillTransparent: checked }))}
      />
    </div>
  );
}
