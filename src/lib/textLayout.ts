import type { TextAnnotation, TextLayout, TextLine } from "./annotationTypes";

export const PT_TO_MM = 25.4 / 72;
export const TEXT_PADDING_MM = 1.4;
const MIN_FONT_PT = 4;

const NARROW = new Set("ijl.,:;'`|!()[]{}ftrI ");
const WIDE = new Set("mwMW@%");

/**
 * Approximate glyph width in em units. The screen and the PDF share this
 * model so a wrapped line breaks in the same place in both.
 */
function glyphEm(char: string, family: string, bold: boolean): number {
  if (family === "Courier") return 0.6;
  if (char === " ") return 0.28;
  if (NARROW.has(char)) return 0.3;
  if (WIDE.has(char)) return family === "TimesRoman" ? 0.86 : 0.9;
  if (/[A-Z]/.test(char)) return family === "TimesRoman" ? 0.66 : 0.7;
  if (/[0-9]/.test(char)) return 0.56;
  const base = family === "TimesRoman" ? 0.46 : 0.53;
  return bold ? base * 1.04 : base;
}

export function measureTextWidthMm(text: string, family: string, bold: boolean, fontSizePt: number): number {
  let em = 0;
  for (const char of text) em += glyphEm(char, family, bold);
  return em * fontSizePt * PT_TO_MM;
}

/** Valid CSS font-family stack matching the PDF standard families (with Persian/Unicode fallback). */
export function textFontCss(family: string, _bold = false, _italic = false): string {
  if (family === "Courier") return "'Courier New', Courier, monospace";
  if (family === "TimesRoman") return "'Times New Roman', Times, serif";
  return "Helvetica, Arial, 'Helvetica Neue', 'Segoe UI', Tahoma, sans-serif";
}

function wrapParagraph(text: string, maxWidthMm: number, family: string, bold: boolean, fontSizePt: number): string[] {
  if (!text) return [""];
  const words = text.split(/(\s+)/);
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    const candidate = current + word;
    if (current && measureTextWidthMm(candidate, family, bold, fontSizePt) > maxWidthMm) {
      lines.push(current.trimEnd());
      current = word.trimStart();
      // A single word longer than the box is broken by character.
      while (measureTextWidthMm(current, family, bold, fontSizePt) > maxWidthMm && current.length > 1) {
        let cut = current.length - 1;
        while (cut > 1 && measureTextWidthMm(current.slice(0, cut), family, bold, fontSizePt) > maxWidthMm) cut -= 1;
        lines.push(current.slice(0, cut));
        current = current.slice(cut);
      }
    } else {
      current = candidate;
    }
  };
  for (const word of words) pushWord(word);
  if (current.trim() || lines.length === 0) lines.push(current.trimEnd());
  return lines;
}

export interface TextLayoutInput {
  text: string;
  fontFamily: string;
  bold: boolean;
  fontSizePt: number;
  autoFit: boolean;
  widthMm: number;
  heightMm: number;
}

export function computeTextLayout(input: TextLayoutInput): TextLayout {
  const maxWidth = Math.max(1, input.widthMm - TEXT_PADDING_MM * 2);
  let fontSizePt = input.fontSizePt;
  let rawLines: string[] = [];

  for (;;) {
    rawLines = input.text.split("\n").flatMap((paragraph) =>
      wrapParagraph(paragraph, maxWidth, input.fontFamily, input.bold, fontSizePt),
    );
    const lineHeight = fontSizePt * 1.25 * PT_TO_MM;
    const fits =
      !input.autoFit ||
      rawLines.length * lineHeight <= Math.max(1, input.heightMm - TEXT_PADDING_MM * 2) ||
      fontSizePt <= MIN_FONT_PT;
    if (fits) break;
    fontSizePt = Math.max(MIN_FONT_PT, fontSizePt - 0.5);
  }

  const lineHeightMm = fontSizePt * 1.25 * PT_TO_MM;
  const lines: TextLine[] = rawLines.map((text, index) => ({ text, topMm: index * lineHeightMm }));
  const widthMm = rawLines.reduce(
    (widest, line) => Math.max(widest, measureTextWidthMm(line, input.fontFamily, input.bold, fontSizePt)),
    0,
  );
  return { lines, fontSizePt, lineHeightMm, widthMm };
}

export function layoutText(annotation: TextAnnotation): TextLayout {
  return computeTextLayout(annotation);
}

/** Ctrl+M: shrink the box to the text it actually holds. */
export function fitTextBox(annotation: TextAnnotation): { widthMm: number; heightMm: number } {
  const layout = computeTextLayout(annotation);
  return {
    widthMm: Math.max(6, layout.widthMm + TEXT_PADDING_MM * 2),
    heightMm: Math.max(4, layout.lines.length * layout.lineHeightMm + TEXT_PADDING_MM * 2),
  };
}

/**
 * A screen-space editor height that keeps the whole text visible while typing,
 * even when the stored box would clip it.
 */
export function editorHeightMm(annotation: TextAnnotation): number {
  const layout = computeTextLayout({ ...annotation, autoFit: false });
  return Math.max(annotation.heightMm, layout.lines.length * layout.lineHeightMm + TEXT_PADDING_MM * 2);
}