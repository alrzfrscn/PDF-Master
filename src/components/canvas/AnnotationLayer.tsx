import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type {
  Annotation,
  BBox,
  FormulaAnnotation,
  InkPoint,
  MarkerAnnotation,
  MarkerTip,
  PenAnnotation,
  Pt,
  ShapeAnnotation,
  ShapeType,
  StampAnnotation,
  TextAnnotation,
} from "../../lib/annotationTypes";
import type { AnnotationPatch } from "../../lib/annotationTypes";
import {
  annotationBounds,
  detectScratchOut,
  formatDimension,
  hitTest,
  pointInPolygon,
  rotateAnnotation,
  scaleAnnotation,
  selectionBounds,
  translateAnnotation,
} from "../../lib/annotationGeometry";
import { angleAt, PRESET_SCALES, useScaleStore } from "../../lib/measure";
import { inkPath, penStyleOptions, polylinePath, pointerPressure } from "../../lib/ink";
import { PX_PER_MM } from "../../lib/paper";
import { stampById, userStamps } from "../../lib/data";
import { useCustomStampStore } from "../../lib/customStamps";
import { captureRegion, readImageFile, type RasterImage } from "../../lib/raster";
import { addImageStamp } from "../../lib/images";
import { usePrefsStore } from "../../lib/prefs";
import { fitTextBox } from "../../lib/textLayout";
import { makeId, useDocStore } from "../../stores/useDocStore";
import { applySelectionTransform, useAnnotationStore } from "../../stores/useAnnotationStore";
import { useToolStore } from "../../stores/useToolStore";
import { useUIStore } from "../../stores/useUIStore";
import type { DocumentPage, DocumentTab } from "../../lib/types";
import { SelectionOverlay, handlePoints, type HandleId, type SelectionAction } from "./SelectionOverlay";
import { TextView } from "./TextView";
import { FormulaView } from "./FormulaView";
import { TextEditor } from "./TextEditor";
import { FORMULA_PANEL, FormulaEditor, type FormulaDraft } from "./FormulaEditor";
import { MeasureOverlay, measureSummary, type MeasureState } from "./MeasureOverlay";
import { SnapshotBar } from "./SnapshotBar";

interface Props {
  tab: DocumentTab;
  page: DocumentPage;
  widthMm: number;
  heightMm: number;
  zoom: number;
  panMode: boolean;
}

type Draft =
  | { kind: "ink"; points: InkPoint[]; tool: "pen" | "marker" }
  | { kind: "shape"; shape: ShapeAnnotation }
  | { kind: "marquee"; start: Pt; end: Pt }
  | { kind: "lasso"; points: Pt[] }
  | { kind: "stamp"; start: Pt; end: Pt; widthMm: number; heightMm: number }
  | { kind: "polygon"; points: Pt[] }
  | { kind: "text"; start: Pt; end: Pt }
  | { kind: "snapshot"; start: Pt; end: Pt }
  | null;

type Interaction =
  | { kind: "ink"; points: InkPoint[]; tool: "pen" | "marker"; start: Pt; last: Pt; lastTime: number }
  | { kind: "shape"; start: Pt; tool: ShapeType }
  | { kind: "move"; last: Pt; pushed: boolean }
  | { kind: "marquee"; start: Pt; additive: boolean }
  | { kind: "lasso"; points: Pt[] }
  | { kind: "scale"; handle: HandleId; box: BBox; initial: Annotation[]; pushed: boolean }
  | { kind: "rotate"; center: Pt; startAngle: number; initial: Annotation[]; pushed: boolean }
  | { kind: "stamp"; start: Pt }
  | { kind: "erase"; last: Pt; split: boolean; pushed: boolean }
  | { kind: "text"; start: Pt }
  | { kind: "snapshot"; start: Pt }
  | { kind: "measure"; start: Pt }
  | null;

interface TextEditState {
  draft: TextAnnotation;
  isNew: boolean;
}

interface SnapshotState {
  region: BBox;
  image: RasterImage | null;
  status: string | null;
}

const EPSILON = 0.001;

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function snapAngle(start: Pt, end: Pt): Pt {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return end;
  const step = Math.PI / 12;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length];
}

function constrainEnd(start: Pt, end: Pt, shift: boolean, center: boolean, boxy: boolean): Pt {
  let target = end;
  if (shift) {
    if (boxy) {
      const size = Math.max(Math.abs(end[0] - start[0]), Math.abs(end[1] - start[1]));
      target = [start[0] + Math.sign(end[0] - start[0] || 1) * size, start[1] + Math.sign(end[1] - start[1] || 1) * size];
    } else {
      target = snapAngle(start, end);
    }
  }
  if (center) return [start[0] * 2 - target[0], start[1] * 2 - target[1]];
  return target;
}

const DASH: Record<string, number[]> = {
  solid: [],
  dash: [2.4, 1.4],
  dot: [0.35, 1.3],
  "dash-dot": [3.2, 1.2, 0.35, 1.2],
};

function markerUrl(kind: number): string | undefined {
  return kind ? `url(#pm-arrow-${kind})` : undefined;
}

function samplePoints(annotation: Annotation): Pt[] {
  if (annotation.type === "pen" || annotation.type === "marker") {
    const stride = Math.max(1, Math.floor(annotation.points.length / 40));
    return annotation.points.filter((_, index) => index % stride === 0).map(([x, y]) => [x, y] as Pt);
  }
  if (annotation.type === "shape") return [annotation.start, annotation.end, ...annotation.points];
  const box = annotationBounds(annotation);
  return [
    [box.x + box.width / 2, box.y + box.height / 2],
    [box.x, box.y],
    [box.x + box.width, box.y + box.height],
  ];
}

function stampArt(stampId: string) {
  const factory = stampById.get(stampId);
  if (factory) return { imageUrl: factory.imageUrl, width: factory.width, height: factory.height, name: factory.title.en };
  const user = userStamps.find((stamp) => stamp.id === stampId);
  if (user) return { imageUrl: user.imageUrl, width: user.inkWidth, height: user.inkHeight, name: user.name };
  const custom = useCustomStampStore.getState().stamps.find((stamp) => stamp.id === stampId);
  if (custom) return { imageUrl: custom.imageUrl, width: custom.width, height: custom.height, name: custom.name };
  return null;
}

function normalizeFont(name: string | undefined): string {
  const value = (name ?? "").toLowerCase();
  if (value.includes("courier") || value.includes("mono")) return "Courier";
  if (value.includes("times") || value.includes("serif")) return "TimesRoman";
  return "Helvetica";
}

function DimensionView({ shape }: { shape: ShapeAnnotation }) {
  const [start, end] = [shape.start, shape.end];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || EPSILON;
  const nx = -dy / length;
  const ny = dx / length;
  const offset = Math.max(1.6, shape.lineWidthMm * 4.5);
  const a: Pt = [start[0] + nx * offset, start[1] + ny * offset];
  const b: Pt = [end[0] + nx * offset, end[1] + ny * offset];
  const label = formatDimension(length * shape.dimensionScale, shape.dimensionUnit);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const stroke = shape.strokeColor;
  const dash = DASH[shape.lineStyle];
  return (
    <g stroke={stroke} fill="none" strokeWidth={shape.lineWidthMm} opacity={shape.opacity}>
      <path d={`M ${start[0]} ${start[1]} L ${a[0]} ${a[1]}`} strokeWidth={shape.lineWidthMm * 0.6} />
      <path d={`M ${end[0]} ${end[1]} L ${b[0]} ${b[1]}`} strokeWidth={shape.lineWidthMm * 0.6} />
      <path
        d={`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`}
        strokeDasharray={dash.length ? dash.join(" ") : undefined}
        markerStart={markerUrl(5)}
        markerEnd={markerUrl(5)}
      />
      <text
        x={mid[0]}
        y={mid[1] - 0.9}
        textAnchor="middle"
        fontSize={2.7}
        stroke="var(--paper)"
        strokeWidth={0.5}
        paintOrder="stroke"
        fill={stroke}
        style={{ fontFamily: "var(--font-sans, sans-serif)", fontWeight: 600 }}
      >
        {label}
      </text>
    </g>
  );
}

function AnnotationView({ annotation }: { annotation: Annotation }) {
  if (annotation.hidden) return null;
  if (annotation.type === "pen") {
    const style = annotation.penStyle ?? (annotation.sensitivity ? "pro" : "basic");
    const options = penStyleOptions(style, annotation.pressureLevel ?? (annotation.sensitivity ? 55 : 0));
    return (
      <path
        d={inkPath(annotation.points, annotation.thicknessMm, {
          ...options,
          simulatePressure: false,
          smoothing: annotation.smoothed ? 0.85 : options.smoothing,
        })}
        fill={annotation.color}
        opacity={annotation.opacity}
      />
    );
  }
  if (annotation.type === "marker") {
    const stroke = annotation.color;
    const cap = annotation.tipStyle === "squared" ? "square" : annotation.tipStyle === "ball" ? "round" : "butt";
    return (
      <polyline
        points={annotation.points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={annotation.thicknessMm}
        strokeLinecap={cap}
        strokeLinejoin="round"
        opacity={annotation.opacity}
        style={{ mixBlendMode: "multiply" }}
      />
    );
  }
  if (annotation.type === "stamp") return <StampView stamp={annotation} />;
  if (annotation.type === "text") return <TextView annotation={annotation} />;
  if (annotation.type === "formula") return <FormulaView annotation={annotation} />;
  const shape = annotation;
  const fill = shape.fillColor && !shape.fillTransparent ? shape.fillColor : "none";
  const dash = DASH[shape.lineStyle];
  const common = {
    fill,
    stroke: shape.strokeColor,
    strokeWidth: shape.lineWidthMm,
    strokeDasharray: dash.length ? dash.join(" ") : undefined,
    opacity: shape.opacity,
    strokeLinejoin: "round" as const,
  };
  if (shape.shapeType === "dimension") return <DimensionView shape={shape} />;
  if (shape.shapeType === "rectangle" || shape.shapeType === "ellipse") {
    const x = Math.min(shape.start[0], shape.end[0]);
    const y = Math.min(shape.start[1], shape.end[1]);
    const width = Math.abs(shape.end[0] - shape.start[0]);
    const height = Math.abs(shape.end[1] - shape.start[1]);
    if (shape.shapeType === "rectangle") return <rect x={x} y={y} width={width} height={height} {...common} />;
    return <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...common} />;
  }
  if (shape.shapeType === "polygon") {
    if (shape.points.length === 0) return null;
    return <path d={polylinePath(shape.points, shape.points.length >= 3)} {...common} />;
  }
  const arrow = shape.shapeType === "arrow";
  return (
    <path
      d={`M ${shape.start[0]} ${shape.start[1]} L ${shape.end[0]} ${shape.end[1]}`}
      fill="none"
      stroke={shape.strokeColor}
      strokeWidth={shape.lineWidthMm}
      strokeDasharray={dash.length ? dash.join(" ") : undefined}
      opacity={shape.opacity}
      markerEnd={arrow ? markerUrl(shape.arrowHead || 5) : undefined}
      markerStart={arrow ? markerUrl(shape.arrowTail) : undefined}
    />
  );
}

function StampView({ stamp }: { stamp: StampAnnotation }) {
  const cx = stamp.xMm + stamp.widthMm / 2;
  const cy = stamp.yMm + stamp.heightMm / 2;
  return (
    <image
      href={stamp.imageUrl}
      x={stamp.xMm}
      y={stamp.yMm}
      width={stamp.widthMm}
      height={stamp.heightMm}
      opacity={stamp.opacity}
      preserveAspectRatio="none"
      transform={`translate(${cx} ${cy}) rotate(${stamp.rotation}) scale(${stamp.flipH ? -1 : 1} ${stamp.flipV ? -1 : 1}) translate(${-cx} ${-cy})`}
    />
  );
}

export function AnnotationLayer({ tab, page, widthMm, heightMm, zoom, panMode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const interaction = useRef<Interaction>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [measure, setMeasure] = useState<MeasureState>({ points: [], cursor: null, finished: false });
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [formulaEdit, setFormulaEdit] = useState<{ annotation: FormulaAnnotation; anchor: { x: number; y: number } } | null>(null);
  const [snap, setSnap] = useState<SnapshotState | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imagePoint = useRef<Pt | null>(null);
  const pinching = useRef(false);

  const activeTool = useToolStore((state) => state.activeTool);
  const props = useToolStore((state) => state.props);
  const selectedStampId = useToolStore((state) => state.selectedStampId);
  const selection = useAnnotationStore((state) => state.selection);
  const eraserSplit = useUIStore((state) => state.eraserSplit);
  const eraserSizeMm = useUIStore((state) => state.eraserSizeMm);
  const measureMode = useUIStore((state) => state.measureMode);
  const scaleId = useScaleStore((state) => state.activeId);
  const customScales = useScaleStore((state) => state.custom);
  const measureUnit = usePrefsStore((state) => state.measureUnit);
  const snapshotDpi = usePrefsStore((state) => state.snapshotDpi);

  const scale = useMemo(() => {
    const all = [...PRESET_SCALES, ...customScales];
    return all.find((item) => item.id === scaleId) ?? PRESET_SCALES[0];
  }, [customScales, scaleId]);

  const chosen = useMemo(
    () => page.annotations.filter((annotation) => selection.includes(annotation.id)),
    [page.annotations, selection],
  );
  const bounds = useMemo(() => selectionBounds(chosen), [chosen]);
  const locked = chosen.length > 0 && chosen.every((annotation) => annotation.locked);
  const grouped = chosen.some((annotation) => annotation.groupId);

  const toolProps = props[activeTool] ?? props.pen;

  const toMm = (clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [point.x, point.y];
  };

  const shapeProps = (shapeType: ShapeType, start: Pt, end: Pt): ShapeAnnotation => ({
    id: makeId("a"),
    type: "shape",
    shapeType,
    start,
    end,
    points: [],
    strokeColor: toolProps.color,
    fillColor: toolProps.fill,
    fillTransparent: toolProps.fill === null,
    lineWidthMm: toolProps.thicknessMm,
    lineStyle: toolProps.lineStyle,
    opacity: toolProps.opacity,
    arrowHead: toolProps.arrowHead || 5,
    arrowTail: toolProps.arrowTail,
    dimensionUnit: toolProps.dimensionUnit,
    dimensionScale: 1,
  });

  const defaultText = (start: Pt, end: Pt): TextAnnotation => {
    const dragged = Math.abs(end[0] - start[0]) > 4 && Math.abs(end[1] - start[1]) > 3;
    return {
      id: makeId("a"),
      type: "text",
      xMm: dragged ? Math.min(start[0], end[0]) : start[0],
      yMm: dragged ? Math.min(start[1], end[1]) : start[1],
      widthMm: dragged ? Math.abs(end[0] - start[0]) : 64,
      heightMm: dragged ? Math.abs(end[1] - start[1]) : 16,
      text: "",
      fontFamily: normalizeFont(toolProps.fontName),
      fontSizePt: Math.max(6, toolProps.fontSize || 12),
      textColor: toolProps.color,
      bold: toolProps.bold,
      italic: toolProps.italic,
      underline: toolProps.underline,
      strikeOut: toolProps.strikeOut,
      align: toolProps.textAlign,
      script: "normal",
      boxFillColor: toolProps.fill ?? "#ffffff",
      boxFillTransparent: toolProps.fill === null,
      frameType: 0,
      frameColor: toolProps.color,
      lineWidthMm: Math.max(0.2, toolProps.thicknessMm),
      autoFit: false,
      rotation: 0,
      opacity: toolProps.opacity,
    };
  };

  useEffect(() => {
    interaction.current = null;
    setDraft(null);
    setMeasure({ points: [], cursor: null, finished: false });
    setSnap(null);
  }, [activeTool]);

  useEffect(() => {
    setMeasure({ points: [], cursor: null, finished: false });
  }, [measureMode]);

  // The toolbar's Image and Formula buttons act immediately, without a canvas click.
  useEffect(() => {
    const pickImage = () => imageInput.current?.click();
    const cancelDraft = () => {
      interaction.current = null;
      setDraft(null);
    };
    const pinchStart = () => {
      pinching.current = true;
      cancelDraft();
    };
    const pinchEnd = () => {
      pinching.current = false;
    };
    const openFormula = () => {
      const toolPropsNow = useToolStore.getState().props.formula ?? useToolStore.getState().props.pen;
      const annotation: FormulaAnnotation = {
        id: makeId("a"),
        type: "formula",
        latex: "E = mc^2",
        xMm: widthMm / 2 - 30,
        yMm: heightMm / 2 - 12,
        widthMm: 60,
        heightMm: 24,
        color: toolPropsNow.color,
        fontSizePt: Math.max(10, toolPropsNow.fontSize || 14),
        fillColor: toolPropsNow.fill ?? "#ffffff",
        fillTransparent: toolPropsNow.fill === null,
        rotation: 0,
        opacity: toolPropsNow.opacity,
      };
      const rect = svgRef.current?.getBoundingClientRect();
      // Centre the panel on the page, not its top-left corner.
      const center = rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      setFormulaEdit({
        annotation,
        anchor: { x: center.x - FORMULA_PANEL.width / 2, y: center.y - FORMULA_PANEL.height / 2 },
      });
    };
    window.addEventListener("pm:pick-image", pickImage);
    window.addEventListener("pm:cancel-draft", cancelDraft);
    window.addEventListener("pm:pinch-start", pinchStart);
    window.addEventListener("pm:pinch-end", pinchEnd);
    window.addEventListener("pm:open-formula", openFormula);
    return () => {
      window.removeEventListener("pm:pick-image", pickImage);
      window.removeEventListener("pm:cancel-draft", cancelDraft);
      window.removeEventListener("pm:pinch-start", pinchStart);
      window.removeEventListener("pm:pinch-end", pinchEnd);
      window.removeEventListener("pm:open-formula", openFormula);
    };
  }, [widthMm, heightMm]);

  const commitInk = (points: InkPoint[], tool: "pen" | "marker", shift: boolean) => {
    if (points.length < 2) return;
    let final = points;
    if (shift) {
      const first = points[0];
      const last = points[points.length - 1];
      const snapped = snapAngle([first[0], first[1]], [last[0], last[1]]);
      final = [first, [snapped[0], snapped[1], last[2]]];
    }
    if (tool === "pen" && usePrefsStore.getState().scratchOut && detectScratchOut(final)) {
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      useAnnotationStore.getState().scratchOut({
        x: Math.min(...xs) - 1,
        y: Math.min(...ys) - 1,
        width: Math.max(...xs) - Math.min(...xs) + 2,
        height: Math.max(...ys) - Math.min(...ys) + 2,
      });
      return;
    }
    const annotation: PenAnnotation | MarkerAnnotation =
      tool === "pen"
        ? {
            id: makeId("a"),
            type: "pen",
            points: final,
            color: toolProps.color,
            thicknessMm: toolProps.thicknessMm,
            opacity: toolProps.opacity,
            sensitivity: toolProps.pressureSensitive,
            smoothed: toolProps.smoothing,
            penStyle: toolProps.penStyle,
            pressureLevel: toolProps.pressureLevel,
          }
        : {
            id: makeId("a"),
            type: "marker",
            points: final,
            color: toolProps.color,
            thicknessMm: toolProps.thicknessMm,
            opacity: toolProps.opacity === 1 ? 0.45 : toolProps.opacity,
            tipStyle: (toolProps as { tipStyle?: MarkerTip }).tipStyle ?? "vertical",
          };
    useAnnotationStore.getState().add(annotation);
  };

  const commitShape = (shapeType: ShapeType, start: Pt, end: Pt, points: Pt[] = []) => {
    if (shapeType === "polygon" ? points.length < 2 : distance(start, end) < 0.4) return;
    const shape = shapeProps(shapeType, start, shapeType === "polygon" ? points[points.length - 1] : end);
    shape.points = points;
    useAnnotationStore.getState().add(shape);
  };

  const commitStamp = (start: Pt, end: Pt) => {
    const art = selectedStampId ? stampArt(selectedStampId) : null;
    if (!art) return;
    const nativeW = art.width / PX_PER_MM;
    const nativeH = art.height / PX_PER_MM;
    const draggedW = Math.abs(end[0] - start[0]);
    const draggedH = Math.abs(end[1] - start[1]);
    const useDrag = draggedW > 1.5 && draggedH > 1.5;
    const widthMm = useDrag ? draggedW : nativeW;
    const heightMm = useDrag ? draggedH : nativeH;
    const xMm = useDrag ? Math.min(start[0], end[0]) : start[0] - widthMm / 2;
    const yMm = useDrag ? Math.min(start[1], end[1]) : start[1] - heightMm / 2;
    const stamp: StampAnnotation = {
      id: makeId("a"),
      type: "stamp",
      stampId: selectedStampId ?? art.name,
      imageUrl: art.imageUrl ?? "",
      xMm,
      yMm,
      widthMm,
      heightMm,
      rotation: 0,
      flipH: false,
      flipV: false,
      opacity: 1,
    };
    useAnnotationStore.getState().add(stamp);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activeTool === "measure") {
        if (event.key === "Escape") {
          setMeasure({ points: [], cursor: null, finished: false });
          return;
        }
        if (event.key === "Enter" && (measureMode === "perimeter" || measureMode === "area") && measure.points.length >= 2) {
          event.preventDefault();
          setMeasure((current) => ({ ...current, cursor: null, finished: true }));
          return;
        }
      }
      if (activeTool !== "polygon") return;
      if (event.key === "Escape") {
        interaction.current = null;
        setDraft(null);
        return;
      }
      if (event.key === "Enter" && draft?.kind === "polygon" && draft.points.length >= 3) {
        event.preventDefault();
        const points = draft.points;
        commitShape("polygon", points[0], points[points.length - 1], points);
        interaction.current = null;
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool, draft, measure, measureMode]);

  const selectAt = (point: Pt, additive: boolean): Annotation | null => {
    const list = page.annotations;
    let hit: Annotation | null = null;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const annotation = list[index];
      if (annotation.hidden || annotation.locked) continue;
      if (hitTest(annotation, point)) {
        hit = annotation;
        break;
      }
    }
    const store = useAnnotationStore.getState();
    if (!hit) {
      if (!additive) store.clearSelection();
      return null;
    }
    let ids = [hit.id];
    if (hit.groupId) ids = list.filter((annotation) => annotation.groupId === hit.groupId).map((annotation) => annotation.id);
    if (additive) {
      const all = ids.every((id) => store.selection.includes(id));
      store.select(all ? store.selection.filter((id) => !ids.includes(id)) : [...new Set([...store.selection, ...ids])]);
    } else if (!ids.every((id) => store.selection.includes(id))) {
      store.select(ids);
    }
    return hit;
  };

  const selectInBox = (box: BBox, additive: boolean) => {
    const ids = page.annotations
      .filter((annotation) => !annotation.hidden && !annotation.locked)
      .filter((annotation) => {
        const other = annotationBounds(annotation);
        return other.x < box.x + box.width && other.x + other.width > box.x && other.y < box.y + box.height && other.y + other.height > box.y;
      })
      .map((annotation) => annotation.id);
    const store = useAnnotationStore.getState();
    store.select(additive ? [...new Set([...store.selection, ...ids])] : ids);
  };

  const selectInLasso = (polygon: Pt[]) => {
    if (polygon.length < 3) return;
    const ids = page.annotations
      .filter((annotation) => !annotation.hidden && !annotation.locked)
      .filter((annotation) => {
        const center = annotationBounds(annotation);
        const probe: Pt = [center.x + center.width / 2, center.y + center.height / 2];
        return pointInPolygon(probe, polygon) || samplePoints(annotation).some((sample) => pointInPolygon(sample, polygon));
      })
      .map((annotation) => annotation.id);
    useAnnotationStore.getState().select(ids);
  };

  const startSelect = (point: Pt, additive: boolean) => {
    const hit = selectAt(point, additive);
    if (hit) {
      if (useAnnotationStore.getState().selection.includes(hit.id)) {
        interaction.current = { kind: "move", last: point, pushed: false };
      }
      return;
    }
    interaction.current = { kind: "marquee", start: point, additive };
    setDraft({ kind: "marquee", start: point, end: point });
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panMode || pinching.current || event.button !== 0) return;
    // Unpinned tool popovers make way for the stroke they would cover.
    if (activeTool !== "hand" && activeTool !== "select") window.dispatchEvent(new Event("pm:stroke-begin"));
    const point = toMm(event.clientX, event.clientY);
    const target = event.currentTarget;
    const begin = (next: Interaction | null) => {
      if (next) interaction.current = next;
      target.setPointerCapture(event.pointerId);
    };

    switch (activeTool) {
      case "pen":
      case "marker": {
        const ink: InkPoint = [
          point[0],
          point[1],
          toolProps.pressureSensitive ? pointerPressure(event.pointerType, event.pressure, null, point, 0) : 0.5,
        ];
        begin({ kind: "ink", points: [ink], tool: activeTool, start: point, last: point, lastTime: event.timeStamp });
        setDraft({ kind: "ink", points: [ink], tool: activeTool });
        return;
      }
      case "line":
      case "arrow":
      case "rectangle":
      case "ellipse":
      case "dimension": {
        begin({ kind: "shape", start: point, tool: activeTool });
        setDraft({ kind: "shape", shape: shapeProps(activeTool, point, point) });
        return;
      }
      case "polygon": {
        const current = interaction.current;
        if (current?.kind === "shape") {
          const points = [...(draft?.kind === "polygon" ? draft.points : []), point];
          const first = points[0];
          if (points.length >= 3 && distance(point, first) < 2.2) {
            commitShape("polygon", first, point, points.slice(0, -1));
            interaction.current = null;
            setDraft(null);
            return;
          }
          setDraft({ kind: "polygon", points });
          return;
        }
        begin({ kind: "shape", start: point, tool: "polygon" });
        setDraft({ kind: "polygon", points: [point] });
        return;
      }
      case "stamp": {
        begin({ kind: "stamp", start: point });
        const art = selectedStampId ? stampArt(selectedStampId) : null;
        const nativeW = art ? art.width / PX_PER_MM : 10;
        const nativeH = art ? art.height / PX_PER_MM : 10;
        setDraft({ kind: "stamp", start: point, end: point, widthMm: nativeW, heightMm: nativeH });
        return;
      }
      case "eraser": {
        const split = eraserSplit || event.altKey;
        const pushed = useAnnotationStore.getState().eraseAt(point, split, eraserSizeMm);
        begin({ kind: "erase", last: point, split, pushed });
        return;
      }
      case "select": {
        startSelect(point, event.shiftKey);
        begin(interaction.current);
        return;
      }
      case "lasso": {
        begin({ kind: "lasso", points: [point] });
        setDraft({ kind: "lasso", points: [point] });
        return;
      }
      case "text": {
        begin({ kind: "text", start: point });
        setDraft({ kind: "text", start: point, end: point });
        return;
      }
      case "formula": {
        const annotation: FormulaAnnotation = {
          id: makeId("a"),
          type: "formula",
          latex: "E = mc^2",
          xMm: point[0],
          yMm: point[1],
          widthMm: 60,
          heightMm: 24,
          color: toolProps.color,
          fontSizePt: Math.max(10, toolProps.fontSize || 14),
          fillColor: toolProps.fill ?? "#ffffff",
          fillTransparent: toolProps.fill === null,
          rotation: 0,
          opacity: toolProps.opacity,
        };
        setFormulaEdit({ annotation, anchor: { x: event.clientX, y: event.clientY } });
        return;
      }
      case "measure": {
        if (measure.finished) {
          setMeasure({ points: [point], cursor: measureMode === "distance" ? point : null, finished: false });
          if (measureMode === "distance") begin({ kind: "measure", start: point });
          return;
        }
        if (measureMode === "distance") {
          begin({ kind: "measure", start: point });
          setMeasure({ points: [point], cursor: point, finished: false });
          return;
        }
        if (measureMode === "angle") {
          const points = [...measure.points, point].slice(0, 3);
          setMeasure({ points, cursor: null, finished: points.length === 3 });
          return;
        }
        setMeasure({ points: [...measure.points, point], cursor: null, finished: false });
        return;
      }
      case "snapshot": {
        begin({ kind: "snapshot", start: point });
        setSnap(null);
        setDraft({ kind: "snapshot", start: point, end: point });
        return;
      }
      case "image": {
        imagePoint.current = point;
        imageInput.current?.click();
        return;
      }
      default:
        return;
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (pinching.current) return;
    const current = interaction.current;
    if (activeTool === "measure" && !measure.finished) {
      const point = toMm(event.clientX, event.clientY);
      if (current?.kind === "measure" || measure.points.length > 0) {
        setMeasure((state) => (state.finished ? state : { ...state, cursor: point }));
      }
    }
    if (!current) return;
    const point = toMm(event.clientX, event.clientY);

    if (current.kind === "ink") {
      if (distance(point, current.last) < 0.12) return;
      const pressure = toolProps.pressureSensitive
        ? pointerPressure(event.pointerType, event.pressure, current.last, point, event.timeStamp - current.lastTime)
        : 0.5;
      const first = current.points[0];
      let points = [...current.points, [point[0], point[1], pressure] as InkPoint];
      if (event.shiftKey) {
        const snapped = snapAngle([first[0], first[1]], point);
        points = [first, [snapped[0], snapped[1], pressure]];
      }
      current.points = points;
      current.last = point;
      current.lastTime = event.timeStamp;
      setDraft({ kind: "ink", points, tool: current.tool });
      return;
    }
    if (current.kind === "shape") {
      if (current.tool === "polygon") return;
      const boxy = current.tool === "rectangle" || current.tool === "ellipse";
      const end = constrainEnd(current.start, point, event.shiftKey, event.ctrlKey || event.metaKey, boxy);
      const shape = shapeProps(current.tool, current.start, end);
      setDraft({ kind: "shape", shape });
      return;
    }
    if (current.kind === "stamp") {
      setDraft((previous) => (previous?.kind === "stamp" ? { ...previous, end: point } : previous));
      return;
    }
    if (current.kind === "text") {
      setDraft({ kind: "text", start: current.start, end: point });
      return;
    }
    if (current.kind === "snapshot") {
      setDraft({ kind: "snapshot", start: current.start, end: point });
      return;
    }
    if (current.kind === "erase") {
      if (distance(point, current.last) < 0.8) return;
      current.last = point;
      // One history entry per gesture: eraseAt only snapshots once something actually changes.
      const changed = useAnnotationStore.getState().eraseAt(point, current.split, eraserSizeMm, !current.pushed);
      if (changed) current.pushed = true;
      return;
    }
    if (current.kind === "marquee") {
      setDraft((previous) =>
        previous?.kind === "marquee" ? { ...previous, end: point } : { kind: "marquee", start: current.start, end: point },
      );
      return;
    }
    if (current.kind === "lasso") {
      if (distance(point, current.points[current.points.length - 1]) < 0.4) return;
      current.points = [...current.points, point];
      setDraft({ kind: "lasso", points: current.points });
      return;
    }
    if (current.kind === "move") {
      const dx = point[0] - current.last[0];
      const dy = point[1] - current.last[1];
      if (!current.pushed) {
        useDocStore.getState().pushHistory(tab.id);
        current.pushed = true;
      }
      useAnnotationStore.getState().transform((annotation) => translateAnnotation(annotation, dx, dy));
      current.last = point;
      return;
    }
    if (current.kind === "scale") {
      const { box, handle } = current;
      const handles = handlePoints(box, 0);
      const opposite: Record<HandleId, HandleId> = {
        nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e", rotate: "se",
      };
      const anchor = handles[opposite[handle]];
      const grip = handles[handle];
      const horizontal = handle !== "n" && handle !== "s";
      const vertical = handle !== "e" && handle !== "w";
      let sx = horizontal ? (point[0] - anchor[0]) / (grip[0] - anchor[0]) : 1;
      let sy = vertical ? (point[1] - anchor[1]) / (grip[1] - anchor[1]) : 1;
      if (!Number.isFinite(sx) || Math.abs(sx) < 0.02) sx = 0.02;
      if (!Number.isFinite(sy) || Math.abs(sy) < 0.02) sy = 0.02;
      sx = Math.max(0.02, sx);
      sy = Math.max(0.02, sy);
      if ((event.shiftKey || event.ctrlKey) && horizontal && vertical) {
        const factor = Math.max(sx, sy);
        sx = factor;
        sy = factor;
      }
      if (!current.pushed && (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001)) {
        useDocStore.getState().pushHistory(tab.id);
        current.pushed = true;
      }
      const initial = new Map(current.initial.map((annotation) => [annotation.id, annotation]));
      useAnnotationStore.getState().mutate(
        (annotations) =>
          annotations.map((annotation) => {
            const base = initial.get(annotation.id);
            return base ? scaleAnnotation(base, anchor, sx, sy) : annotation;
          }),
        false,
      );
      return;
    }
    if (current.kind === "rotate") {
      const angle = (Math.atan2(point[1] - current.center[1], point[0] - current.center[0]) * 180) / Math.PI;
      let delta = angle - current.startAngle;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      if (!current.pushed && Math.abs(delta) > 0.01) {
        useDocStore.getState().pushHistory(tab.id);
        current.pushed = true;
      }
      const initial = current.initial;
      useAnnotationStore.getState().mutate(
        (annotations) => {
          const map = new Map(initial.map((annotation) => [annotation.id, annotation]));
          return annotations.map((annotation) => {
            const base = map.get(annotation.id);
            return base ? rotateAnnotation(base, current.center, delta) : annotation;
          });
        },
        false,
      );
    }
  };

  const capture = async (region: BBox, status: string | null = null) => {
    const pageElement = svgRef.current?.parentElement ?? null;
    const image = await captureRegion(pageElement, region, snapshotDpi);
    setSnap({ region, image, status });
    return image;
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = interaction.current;
    interaction.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current) {
      setDraft(null);
      return;
    }
    const point = toMm(event.clientX, event.clientY);
    if (current.kind === "ink") commitInk(current.points, current.tool, event.shiftKey);
    if (current.kind === "shape" && current.tool !== "polygon") {
      const boxy = current.tool === "rectangle" || current.tool === "ellipse";
      const end = constrainEnd(current.start, point, event.shiftKey, event.ctrlKey || event.metaKey, boxy);
      commitShape(current.tool, current.start, end);
    }
    if (current.kind === "stamp") commitStamp(current.start, point);
    if (current.kind === "text") {
      setTextEdit({ draft: defaultText(current.start, point), isNew: true });
    }
    if (current.kind === "measure") {
      setMeasure({ points: [current.start, point], cursor: null, finished: true });
    }
    if (current.kind === "snapshot") {
      const region: BBox = {
        x: Math.max(0, Math.min(current.start[0], point[0])),
        y: Math.max(0, Math.min(current.start[1], point[1])),
        width: Math.min(widthMm, Math.abs(point[0] - current.start[0])),
        height: Math.min(heightMm, Math.abs(point[1] - current.start[1])),
      };
      if (region.width > 2 && region.height > 2) void capture(region);
    }
    if (current.kind === "marquee") {
      const box: BBox = {
        x: Math.min(current.start[0], point[0]),
        y: Math.min(current.start[1], point[1]),
        width: Math.abs(point[0] - current.start[0]),
        height: Math.abs(point[1] - current.start[1]),
      };
      if (box.width > 0.6 || box.height > 0.6) selectInBox(box, current.additive);
    }
    if (current.kind === "lasso") selectInLasso(current.points);
    if (current.kind === "shape" && current.tool === "polygon") return;
    setDraft(null);
  };

  const onHandleDown = (handle: HandleId, event: React.PointerEvent) => {
    if (!bounds || chosen.length === 0) return;
    const point = toMm(event.clientX, event.clientY);
    const svg = svgRef.current;
    svg?.setPointerCapture(event.pointerId);
    if (handle === "rotate") {
      const center: Pt = [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
      const angle = (Math.atan2(point[1] - center[1], point[0] - center[0]) * 180) / Math.PI;
      interaction.current = { kind: "rotate", center, startAngle: angle, initial: structuredClone(chosen), pushed: false };
    } else {
      interaction.current = { kind: "scale", handle, box: bounds, initial: structuredClone(chosen), pushed: false };
    }
  };

  const saveStampFrom = async (region: BBox, label: string) => {
    const image = await capture(region);
    if (!image) return false;
    const result = await useCustomStampStore.getState().add({
      name: label,
      imageUrl: image.dataUrl,
      width: image.width,
      height: image.height,
    });
    if (!result.ok) {
      useUIStore.getState().setToast(`Stamp added for this session only: ${result.error ?? "storage failed"}`);
    }
    setSnap({ region, image, status: result.ok ? "Saved to stamps" : "Saved for this session" });
    return true;
  };

  const onAction = (action: SelectionAction) => {
    const store = useAnnotationStore.getState();
    const center: Pt = bounds ? [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2] : [0, 0];
    if (action === "duplicate") store.duplicateSelection();
    if (action === "delete") store.deleteSelection();
    if (action === "group") store.groupSelection();
    if (action === "ungroup") store.ungroupSelection();
    if (action === "lock") store.setLocked(!locked);
    if (action === "front") store.bringToFront();
    if (action === "back") store.sendToBack();
    if (action === "rotate") {
      useDocStore.getState().pushHistory(tab.id);
      applySelectionTransform("rotate", { origin: center, degrees: 90 });
    }
    if (action === "flip-h" || action === "flip-v") {
      useDocStore.getState().pushHistory(tab.id);
      applySelectionTransform("flip", { origin: center, axis: action === "flip-h" ? "h" : "v" });
    }
    if (action === "save-stamp" && bounds) {
      void saveStampFrom(bounds, `Selection ${new Date().toLocaleTimeString()}`).then((saved) => {
        if (!saved) return;
        useToolStore.getState().setTool("stamp");
        useUIStore.getState().setToast("Selection saved to the custom stamp gallery");
      });
    }
  };

  const commitMeasure = () => {
    const points = measure.points;
    const store = useAnnotationStore.getState();
    if (measureMode === "distance" && points.length >= 2) {
      const shape = shapeProps("dimension", points[0], points[1]);
      shape.strokeColor = "#0a84ff";
      shape.fillColor = null;
      shape.fillTransparent = true;
      shape.lineWidthMm = 0.35;
      shape.dimensionUnit = measureUnit;
      shape.dimensionScale = scale.denominator;
      store.add(shape);
    } else if ((measureMode === "area" || measureMode === "perimeter") && points.length >= 3) {
      const shape = shapeProps("polygon", points[0], points[points.length - 1]);
      shape.points = points;
      shape.strokeColor = "#0a84ff";
      shape.lineWidthMm = 0.35;
      shape.fillColor = measureMode === "area" ? "#9fd0ff" : null;
      shape.fillTransparent = measureMode !== "area";
      shape.opacity = measureMode === "area" ? 0.75 : 1;
      store.add(shape);
    } else if (measureMode === "angle" && points.length >= 3) {
      const degrees = angleAt(points[1], points[0], points[2]);
      const text: TextAnnotation = {
        id: makeId("a"),
        type: "text",
        xMm: points[0][0] + 3,
        yMm: points[0][1] + 3,
        widthMm: 20,
        heightMm: 7,
        text: `${degrees.toFixed(1)}°`,
        fontFamily: "Helvetica",
        fontSizePt: 9,
        textColor: "#0a84ff",
        bold: true,
        italic: false,
        underline: false,
        strikeOut: false,
        align: "left",
        script: "normal",
        boxFillColor: "#ffffff",
        boxFillTransparent: true,
        frameType: 0,
        frameColor: "#0a84ff",
        lineWidthMm: 0.3,
        autoFit: false,
        rotation: 0,
        opacity: 1,
      };
      store.add(text);
    }
    setMeasure({ points: [], cursor: null, finished: false });
  };

  const commitText = (text: string) => {
    const edit = textEdit;
    if (!edit) return;
    setTextEdit(null);
    const draftValue = { ...edit.draft, text };
    if (!text.trim()) {
      if (!edit.isNew) useAnnotationStore.getState().update([draftValue.id], { text: "" });
      return;
    }
    if (edit.isNew) {
      useAnnotationStore.getState().add(draftValue);
      return;
    }
    useAnnotationStore.getState().update([draftValue.id], {
      text,
      widthMm: draftValue.widthMm,
      heightMm: draftValue.heightMm,
      fontFamily: draftValue.fontFamily,
      fontSizePt: draftValue.fontSizePt,
      textColor: draftValue.textColor,
      bold: draftValue.bold,
      italic: draftValue.italic,
      underline: draftValue.underline,
      strikeOut: draftValue.strikeOut,
      align: draftValue.align,
      script: draftValue.script,
      boxFillColor: draftValue.boxFillColor,
      boxFillTransparent: draftValue.boxFillTransparent,
      frameType: draftValue.frameType,
      frameColor: draftValue.frameColor,
      lineWidthMm: draftValue.lineWidthMm,
      autoFit: draftValue.autoFit,
      rotation: draftValue.rotation,
      opacity: draftValue.opacity,
    });
  };

  const saveFormula = (draftValue: FormulaDraft) => {
    const current = formulaEdit;
    if (!current) return;
    setFormulaEdit(null);
    const base: FormulaAnnotation = {
      ...current.annotation,
      latex: draftValue.latex,
      color: draftValue.color,
      fontSizePt: draftValue.fontSizePt,
      fillColor: draftValue.fillColor,
      fillTransparent: draftValue.fillTransparent,
      opacity: draftValue.opacity,
    };
    const exists = page.annotations.some((annotation) => annotation.id === base.id);
    const store = useAnnotationStore.getState();
    if (exists) {
      store.update([base.id], {
        latex: base.latex,
        color: base.color,
        fontSizePt: base.fontSizePt,
        fillColor: base.fillColor,
        fillTransparent: base.fillTransparent,
        opacity: base.opacity,
      });
    } else {
      store.add(base);
    }
  };

  const cursor = panMode
    ? "grab"
    : activeTool === "select"
      ? "default"
      : activeTool === "eraser"
        ? "cell"
        : [
            "pen",
            "marker",
            "line",
            "arrow",
            "rectangle",
            "ellipse",
            "polygon",
            "dimension",
            "stamp",
            "lasso",
            "text",
            "formula",
            "measure",
            "snapshot",
            "image",
            "crop",
          ].includes(activeTool)
          ? "crosshair"
          : "default";

  const measureText = activeTool === "measure" ? measureSummary(measureMode, measure, scale.denominator, measureUnit) : null;
  const canCommitMeasure =
    (measureMode === "distance" && measure.points.length >= 2) ||
    ((measureMode === "area" || measureMode === "perimeter") && measure.points.length >= 3) ||
    (measureMode === "angle" && measure.points.length >= 3);
  const editingId = textEdit && !textEdit.isNew ? textEdit.draft.id : null;

  return (
    <div className="absolute inset-0" style={{ cursor }}>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        aria-label="Insert image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void readImageFile(file)
            .then((image) => addImageStamp(image, imagePoint.current ?? undefined))
            .catch(() => undefined);
        }}
      />
      <svg
        ref={svgRef}
        data-annotation-layer
        viewBox={`0 0 ${widthMm} ${heightMm}`}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: panMode ? "auto" : "none", display: "block", overflow: "visible" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          interaction.current = null;
          setDraft(null);
        }}
        onDoubleClick={(event) => {
          if (activeTool === "polygon" && draft?.kind === "polygon" && draft.points.length >= 3) {
            event.stopPropagation();
            const points = draft.points;
            commitShape("polygon", points[0], points[points.length - 1], points);
            interaction.current = null;
            setDraft(null);
            return;
          }
          const point = toMm(event.clientX, event.clientY);
          const hit = [...page.annotations]
            .reverse()
            .find((annotation) => !annotation.hidden && (annotation.type === "text" || annotation.type === "formula") && hitTest(annotation, point));
          if (!hit) return;
          if (hit.type === "text") setTextEdit({ draft: hit, isNew: false });
          else if (hit.type === "formula") setFormulaEdit({ annotation: hit, anchor: { x: event.clientX, y: event.clientY } });
        }}
      >
        <defs>
          <marker id="pm-arrow-3" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L6 3 L0 6" fill="none" stroke="context-stroke" strokeWidth="1.1" />
          </marker>
          <marker id="pm-arrow-5" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0 0 L6 3 L0 6 Z" fill="context-stroke" />
          </marker>
          <marker id="pm-arrow-7" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0 3.5 L3.5 0 L7 3.5 L3.5 7 Z" fill="context-stroke" />
          </marker>
          <marker id="pm-arrow-10" markerWidth="7" markerHeight="7" refX="6.4" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <circle cx="3.5" cy="3.5" r="2.7" fill="context-stroke" />
          </marker>
        </defs>

        {page.annotations
          .filter((annotation) => annotation.id !== editingId)
          .map((annotation) => (
            <AnnotationView key={annotation.id} annotation={annotation} />
          ))}

        {draft?.kind === "ink" &&
          (draft.tool === "pen" ? (
            <path
              d={inkPath(draft.points, toolProps.thicknessMm, {
                ...penStyleOptions(toolProps.penStyle, toolProps.pressureLevel),
                simulatePressure: false,
              })}
              fill={toolProps.color}
              opacity={toolProps.opacity}
            />
          ) : (
            <polyline
              points={draft.points.map(([x, y]) => `${x},${y}`).join(" ")}
              fill="none"
              stroke={toolProps.color}
              strokeWidth={toolProps.thicknessMm}
              strokeLinecap="butt"
              opacity={toolProps.opacity}
              style={{ mixBlendMode: "multiply" }}
            />
          ))}
        {draft?.kind === "shape" && <AnnotationView annotation={draft.shape} />}
        {draft?.kind === "polygon" && (
          <g fill="none" stroke="var(--accent)" strokeWidth={0.4} strokeDasharray="1 0.8">
            <path d={polylinePath(draft.points, draft.points.length >= 3)} />
            {draft.points.map(([x, y], index) => (
              <circle key={index} cx={x} cy={y} r={index === 0 ? 1.1 : 0.75} fill="var(--paper)" />
            ))}
          </g>
        )}
        {draft?.kind === "marquee" && (
          <rect
            x={Math.min(draft.start[0], draft.end[0])}
            y={Math.min(draft.start[1], draft.end[1])}
            width={Math.abs(draft.end[0] - draft.start[0])}
            height={Math.abs(draft.end[1] - draft.start[1])}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={0.3}
            strokeDasharray="1.6 1"
          />
        )}
        {draft?.kind === "lasso" && (
          <path
            d={polylinePath(draft.points, true)}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={0.3}
            strokeDasharray="1.6 1"
          />
        )}
        {draft?.kind === "text" && (
          <rect
            x={Math.min(draft.start[0], draft.end[0])}
            y={Math.min(draft.start[1], draft.end[1])}
            width={Math.max(2, Math.abs(draft.end[0] - draft.start[0]))}
            height={Math.max(2, Math.abs(draft.end[1] - draft.start[1]))}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={0.3}
            strokeDasharray="1.6 1"
          />
        )}
        {draft?.kind === "snapshot" && (
          <rect
            x={Math.min(draft.start[0], draft.end[0])}
            y={Math.min(draft.start[1], draft.end[1])}
            width={Math.abs(draft.end[0] - draft.start[0])}
            height={Math.abs(draft.end[1] - draft.start[1])}
            fill="var(--accent-soft)"
            stroke="var(--accent)"
            strokeWidth={0.3}
            strokeDasharray="1.6 1"
          />
        )}
        {draft?.kind === "stamp" &&
          (() => {
            const art = selectedStampId ? stampArt(selectedStampId) : null;
            const draggedW = Math.abs(draft.end[0] - draft.start[0]);
            const draggedH = Math.abs(draft.end[1] - draft.start[1]);
            const useDrag = draggedW > 1.5 && draggedH > 1.5;
            const width = useDrag ? draggedW : draft.widthMm;
            const height = useDrag ? draggedH : draft.heightMm;
            const x = useDrag ? Math.min(draft.start[0], draft.end[0]) : draft.start[0] - width / 2;
            const y = useDrag ? Math.min(draft.start[1], draft.end[1]) : draft.start[1] - height / 2;
            return (
              <g opacity={0.65}>
                {art?.imageUrl && (
                  <image href={art.imageUrl} x={x} y={y} width={width} height={height} preserveAspectRatio="none" />
                )}
                <rect x={x} y={y} width={width} height={height} fill="none" stroke="var(--accent)" strokeWidth={0.3} />
              </g>
            );
          })()}
        {activeTool === "measure" && <MeasureOverlay mode={measureMode} state={measure} />}
      </svg>

      {activeTool === "measure" && measureText && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 z-20"
          style={{ transform: `translateX(-50%) scale(${1 / zoom})`, transformOrigin: "bottom center" }}
        >
          <div className="glass-strong pointer-events-auto flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] shadow-lg" onPointerDown={(event) => event.stopPropagation()}>
            <span className="whitespace-nowrap font-medium tabular-nums">{measureText}</span>
            <button type="button" className="chip h-6 px-2" disabled={!canCommitMeasure} onClick={commitMeasure}>
              Commit
            </button>
            <button
              type="button"
              className="chip h-6 px-2"
              onClick={() => setMeasure({ points: [], cursor: null, finished: false })}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {snap && (
        <SnapshotBar
          region={snap.region}
          imageUrl={snap.image?.dataUrl ?? null}
          zoom={zoom}
          status={snap.status}
          onCopy={() => {
            if (!snap.image) return;
            void (async () => {
              try {
                const blob = await (await fetch(snap.image!.dataUrl)).blob();
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
                setSnap((state) => (state ? { ...state, status: "Copied" } : state));
              } catch {
                setSnap((state) => (state ? { ...state, status: "Copy blocked" } : state));
              }
            })();
          }}
          onDownload={() => {
            if (!snap.image) return;
            const anchor = document.createElement("a");
            anchor.href = snap.image.dataUrl;
            anchor.download = `snapshot-${Date.now()}.png`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setSnap((state) => (state ? { ...state, status: "Downloaded" } : state));
          }}
          onSaveStamp={() => void saveStampFrom(snap.region, `Snapshot ${new Date().toLocaleTimeString()}`)}
          onClose={() => setSnap(null)}
        />
      )}

      {textEdit && (
        <TextEditor
          draft={textEdit.draft}
          onPatch={(patch: AnnotationPatch) =>
            setTextEdit((state) => (state ? { ...state, draft: { ...state.draft, ...patch } } : state))
          }
          onFit={(text) =>
            setTextEdit((state) =>
              state ? { ...state, draft: { ...state.draft, ...fitTextBox({ ...state.draft, text }) } } : state,
            )
          }
          onCommit={commitText}
          onCancel={() => setTextEdit(null)}
        />
      )}

      {formulaEdit &&
        typeof document !== "undefined" &&
        createPortal(
          <FormulaEditor
            initial={{
              latex: formulaEdit.annotation.latex,
              color: formulaEdit.annotation.color,
              fontSizePt: formulaEdit.annotation.fontSizePt,
              fillColor: formulaEdit.annotation.fillColor,
              fillTransparent: formulaEdit.annotation.fillTransparent,
              opacity: formulaEdit.annotation.opacity,
            }}
            anchor={formulaEdit.anchor}
            onSave={saveFormula}
            onClose={() => setFormulaEdit(null)}
          />,
          document.body,
        )}

      <SelectionOverlay
        bounds={bounds}
        count={chosen.length}
        zoom={zoom}
        locked={locked}
        grouped={grouped}
        onHandleDown={onHandleDown}
        onAction={onAction}
      />
    </div>
  );
}
