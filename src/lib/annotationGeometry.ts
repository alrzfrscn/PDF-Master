import type { Annotation, BBox, InkPoint, Pt } from "./annotationTypes";

const RAD = Math.PI / 180;

export function normalizeAngle(angle: number): number {
  const wrapped = angle % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function ptDistance(a: Pt, b: Pt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return ptDistance(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  return ptDistance(p, [a[0] + t * dx, a[1] + t * dy]);
}

function pointsBounds(points: Pt[]): BBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function inflate(box: BBox, by: number): BBox {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 };
}

export function unionBounds(boxes: BBox[]): BBox {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.width > maxX) maxX = box.x + box.width;
    if (box.y + box.height > maxY) maxY = box.y + box.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function boundsIntersect(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function boundsContain(outer: BBox, inner: BBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function boxCenter(box: BBox): Pt {
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** Corners of a rotated box, in page-local millimetres. */
export function boxCorners(xMm: number, yMm: number, widthMm: number, heightMm: number, rotation: number): Pt[] {
  const cx = xMm + widthMm / 2;
  const cy = yMm + heightMm / 2;
  const angle = rotation * RAD;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = widthMm / 2;
  const hh = heightMm / 2;
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [cx + x * cos - y * sin, cy + x * sin + y * cos] as Pt);
}

export function isBoxAnnotation(
  annotation: Annotation,
): annotation is Extract<Annotation, { type: "stamp" | "text" | "formula" }> {
  return annotation.type === "stamp" || annotation.type === "text" || annotation.type === "formula";
}

export function annotationBounds(annotation: Annotation): BBox {
  switch (annotation.type) {
    case "pen":
    case "marker":
      return inflate(pointsBounds(annotation.points.map(([x, y]) => [x, y] as Pt)), annotation.thicknessMm / 2);
    case "shape":
      return inflate(
        pointsBounds([annotation.start, annotation.end, ...annotation.points]),
        Math.max(annotation.lineWidthMm, 0) / 2,
      );
    case "stamp":
    case "text":
    case "formula":
      return pointsBounds(
        boxCorners(annotation.xMm, annotation.yMm, annotation.widthMm, annotation.heightMm, annotation.rotation),
      );
  }
}

export function selectionBounds(annotations: Annotation[]): BBox | null {
  if (annotations.length === 0) return null;
  return unionBounds(annotations.map(annotationBounds));
}

function distanceToInk(points: InkPoint[], p: Pt): number {
  let best = Infinity;
  if (points.length === 1) return ptDistance(p, [points[0][0], points[0][1]]);
  for (let index = 1; index < points.length; index += 1) {
    const distance = pointSegmentDistance(p, [points[index - 1][0], points[index - 1][1]], [points[index][0], points[index][1]]);
    if (distance < best) best = distance;
  }
  return best;
}

function distanceToPolygon(points: Pt[], p: Pt, closed: boolean): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) return ptDistance(p, points[0]);
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, pointSegmentDistance(p, points[index - 1], points[index]));
  }
  if (closed) best = Math.min(best, pointSegmentDistance(p, points[points.length - 1], points[0]));
  return best;
}

export function pointInPolygon(point: Pt, polygon: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** True when a pointer at `p` is close enough to grab the annotation. */
export function hitTest(annotation: Annotation, p: Pt, toleranceMm = 1.4): boolean {
  if (annotation.hidden) return false;
  switch (annotation.type) {
    case "pen":
    case "marker":
      return distanceToInk(annotation.points, p) <= annotation.thicknessMm / 2 + toleranceMm;
    case "shape": {
      const reach = annotation.lineWidthMm / 2 + toleranceMm;
      const vertices = [annotation.start, annotation.end, ...annotation.points];
      if (annotation.shapeType === "polygon") {
        return distanceToPolygon(vertices, p, annotation.points.length >= 3) <= reach;
      }
      if (annotation.shapeType === "rectangle" || annotation.shapeType === "ellipse") {
        const box = pointsBounds([annotation.start, annotation.end]);
        const corners: Pt[] = [
          [box.x, box.y],
          [box.x + box.width, box.y],
          [box.x + box.width, box.y + box.height],
          [box.x, box.y + box.height],
        ];
        const filled = Boolean(annotation.fillColor) && !annotation.fillTransparent;
        if (annotation.shapeType === "rectangle") {
          return distanceToPolygon(corners, p, true) <= reach || (filled && pointInBox(p, box));
        }
        const radius = ellipseRadius(box, p);
        if (filled && radius <= 1) return true;
        return Math.abs(radius - 1) * (Math.min(box.width, box.height) / 2) <= reach;
      }
      return pointSegmentDistance(p, annotation.start, annotation.end) <= reach;
    }
    case "stamp": {
      const local = toStampLocal(annotation, p);
      return (
        local[0] >= 0 && local[1] >= 0 && local[0] <= annotation.widthMm && local[1] <= annotation.heightMm
      );
    }
    case "text":
    case "formula": {
      const local = toBoxLocal(annotation, p);
      return (
        local[0] >= -toleranceMm &&
        local[1] >= -toleranceMm &&
        local[0] <= annotation.widthMm + toleranceMm &&
        local[1] <= annotation.heightMm + toleranceMm
      );
    }
  }
}

function pointInBox(p: Pt, box: BBox): boolean {
  return p[0] >= box.x && p[0] <= box.x + box.width && p[1] >= box.y && p[1] <= box.y + box.height;
}

/** Normalised ellipse radius: 1 on the outline, <1 inside. */
function ellipseRadius(box: BBox, p: Pt): number {
  const rx = Math.max(box.width / 2, 0.001);
  const ry = Math.max(box.height / 2, 0.001);
  const nx = (p[0] - (box.x + rx)) / rx;
  const ny = (p[1] - (box.y + ry)) / ry;
  return Math.hypot(nx, ny);
}

function toStampLocal(annotation: Extract<Annotation, { type: "stamp" }>, p: Pt): Pt {
  const local = toBoxLocal(annotation, p);
  return [annotation.flipH ? annotation.widthMm - local[0] : local[0], annotation.flipV ? annotation.heightMm - local[1] : local[1]];
}

function toBoxLocal(
  annotation: Pick<Extract<Annotation, { type: "text" }>, "xMm" | "yMm" | "widthMm" | "heightMm" | "rotation">,
  p: Pt,
): Pt {
  const cx = annotation.xMm + annotation.widthMm / 2;
  const cy = annotation.yMm + annotation.heightMm / 2;
  const angle = -annotation.rotation * RAD;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  return [dx * Math.cos(angle) - dy * Math.sin(angle) + annotation.widthMm / 2, dx * Math.sin(angle) + dy * Math.cos(angle) + annotation.heightMm / 2];
}

function mapPoints<T extends Annotation>(annotation: T, mapper: (p: Pt) => Pt): T {
  if (annotation.type === "pen" || annotation.type === "marker") {
    return {
      ...annotation,
      points: annotation.points.map(([x, y, pressure]) => {
        const [nx, ny] = mapper([x, y]);
        return [nx, ny, pressure] as InkPoint;
      }),
    };
  }
  if (annotation.type === "shape") {
    return {
      ...annotation,
      start: mapper(annotation.start),
      end: mapper(annotation.end),
      points: annotation.points.map(mapper),
    };
  }
  const [x, y] = mapper([annotation.xMm + annotation.widthMm / 2, annotation.yMm + annotation.heightMm / 2]);
  return { ...annotation, xMm: x - annotation.widthMm / 2, yMm: y - annotation.heightMm / 2 };
}

export function translateAnnotation<T extends Annotation>(annotation: T, dx: number, dy: number): T {
  return mapPoints(annotation, ([x, y]) => [x + dx, y + dy]);
}

export function scaleAnnotation(
  annotation: Annotation,
  origin: Pt,
  scaleX: number,
  scaleY: number,
): Annotation {
  const map = ([x, y]: Pt): Pt => [origin[0] + (x - origin[0]) * scaleX, origin[1] + (y - origin[1]) * scaleY];
  const next = mapPoints(annotation, map);
  const factor = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
  if (next.type === "pen" || next.type === "marker") {
    return { ...next, thicknessMm: Math.max(0.1, next.thicknessMm * factor) };
  }
  if (next.type === "shape") {
    return { ...next, lineWidthMm: Math.max(0.05, next.lineWidthMm * factor) };
  }
  const source = annotation as Extract<Annotation, { type: "stamp" | "text" | "formula" }>;
  const target = next as Extract<Annotation, { type: "stamp" | "text" | "formula" }>;
  const scaled = {
    ...target,
    xMm: origin[0] + (source.xMm - origin[0]) * scaleX,
    yMm: origin[1] + (source.yMm - origin[1]) * scaleY,
    widthMm: Math.max(0.5, source.widthMm * Math.abs(scaleX)),
    heightMm: Math.max(0.5, source.heightMm * Math.abs(scaleY)),
  };
  if (scaled.type === "text" || scaled.type === "formula") {
    return { ...scaled, fontSizePt: Math.max(4, scaled.fontSizePt * factor) };
  }
  return scaled;
}

export function rotateAnnotation<T extends Annotation>(annotation: T, center: Pt, degrees: number): T {
  const angle = degrees * RAD;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const map = ([x, y]: Pt): Pt => {
    const dx = x - center[0];
    const dy = y - center[1];
    return [center[0] + dx * cos - dy * sin, center[1] + dx * sin + dy * cos];
  };
  const next = mapPoints(annotation, map);
  if (next.type === "stamp" || next.type === "text" || next.type === "formula") {
    return { ...next, rotation: normalizeAngle(next.rotation + degrees) };
  }
  return next;
}

export function flipAnnotation<T extends Annotation>(annotation: T, axis: "h" | "v", center: Pt): T {
  const map = (p: Pt): Pt => (axis === "h" ? [center[0] * 2 - p[0], p[1]] : [p[0], center[1] * 2 - p[1]]);
  const next = mapPoints(annotation, map);
  if (next.type === "stamp") {
    return axis === "h" ? { ...next, flipH: !next.flipH } : { ...next, flipV: !next.flipV };
  }
  return next;
}

export function formatDimension(valueMm: number, unit: "mm" | "cm" | "m" | "in" | "ft"): string {
  if (unit === "cm") return `${(valueMm / 10).toFixed(2)} cm`;
  if (unit === "m") return `${(valueMm / 1000).toFixed(3)} m`;
  if (unit === "in") return `${(valueMm / 25.4).toFixed(3)} in`;
  if (unit === "ft") return `${(valueMm / 304.8).toFixed(3)} ft`;
  return `${valueMm.toFixed(1)} mm`;
}

export interface ScratchOutOptions {
  minReversals?: number;
  maxSizeMm?: number;
  minTravelMm?: number;
  /** Minimum width/height ratio; a real scribble is wide and flat. */
  minAspect?: number;
}

/** Vertices of a regular N-gon inscribed in the drag box (start/end opposite corners). */
export function regularPolygonPoints(start: Pt, end: Pt, sides: number): Pt[] {
  const count = Math.max(3, Math.round(sides));
  const cx = (start[0] + end[0]) / 2;
  const cy = (start[1] + end[1]) / 2;
  const rx = Math.abs(end[0] - start[0]) / 2;
  const ry = Math.abs(end[1] - start[1]) / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)] as Pt;
  });
}

/**
 * A rapid horizontal scribble: several sharp left/right reversals inside a
 * tight box. Used to turn a scribble into "erase what is underneath".
 */
export function detectScratchOut(points: InkPoint[], options: ScratchOutOptions = {}): boolean {
  const { minReversals = 4, maxSizeMm = 26, minTravelMm = 25, minAspect = 0 } = options;
  if (points.length < 8) return false;
  const xy = points.map(([x, y]) => [x, y] as Pt);
  const box = pointsBounds(xy);
  if (box.width > maxSizeMm || box.height > maxSizeMm) return false;
  if (minAspect > 0 && box.width / Math.max(0.001, box.height) < minAspect) return false;

  let travel = 0;
  for (let index = 1; index < xy.length; index += 1) travel += ptDistance(xy[index - 1], xy[index]);
  if (travel < minTravelMm) return false;

  let direction = 0;
  let reversals = 0;
  let anchorX = xy[0][0];
  for (let index = 1; index < xy.length; index += 1) {
    const dx = xy[index][0] - anchorX;
    if (Math.abs(dx) < 0.6) continue;
    const sign = Math.sign(dx);
    if (direction !== 0 && sign !== direction) reversals += 1;
    direction = sign;
    anchorX = xy[index][0];
  }
  return reversals >= minReversals;
}

/** Where a segment crosses the eraser circle, as parameters along `a`→`b`. */
function circleHits(a: Pt, b: Pt, center: Pt, radiusMm: number): number[] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return [];
  const fx = a[0] - center[0];
  const fy = a[1] - center[1];
  const half = fx * dx + fy * dy;
  const constant = fx * fx + fy * fy - radiusMm * radiusMm;
  const discriminant = half * half - lengthSq * constant;
  if (discriminant <= 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-half - root) / lengthSq, (-half + root) / lengthSq]
    .filter((t) => t >= 0 && t <= 1)
    .sort((left, right) => left - right);
}

/**
 * Splits ink into continuous runs that stay outside the eraser circle. The cut
 * ends land exactly on the circle perimeter and surviving vertices keep their
 * coordinates and pressure, so an untouched part of a stroke never shifts.
 */
export function subtractEraser(points: InkPoint[], center: Pt, radiusMm: number): InkPoint[][] {
  const runs: InkPoint[][] = [];
  if (points.length === 0) return runs;
  const inside = (point: InkPoint) => ptDistance([point[0], point[1]], center) <= radiusMm;
  const onEdge = (a: InkPoint, b: InkPoint, t: number): InkPoint => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  let current: InkPoint[] = [];
  const flush = () => {
    if (current.length > 0) runs.push(current);
    current = [];
  };

  if (!inside(points[0])) current.push(points[0]);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const aIn = inside(a);
    const bIn = inside(b);
    if (!aIn && !bIn) {
      const hits = circleHits([a[0], a[1]], [b[0], b[1]], center, radiusMm);
      if (hits.length >= 2) {
        // The segment dips through the circle: close the run on its entry and
        // resume on its exit, so the hole is exactly the eraser footprint.
        current.push(onEdge(a, b, hits[0]));
        flush();
        current.push(onEdge(a, b, hits[1]));
      }
      current.push(b);
    } else if (!aIn && bIn) {
      const exits = circleHits([a[0], a[1]], [b[0], b[1]], center, radiusMm);
      if (exits.length === 0) flush();
      else {
        current.push(onEdge(a, b, exits[0]));
        flush();
      }
    } else if (aIn && !bIn) {
      const exits = circleHits([a[0], a[1]], [b[0], b[1]], center, radiusMm);
      if (exits.length > 0) current.push(onEdge(a, b, exits[exits.length - 1]));
      current.push(b);
    }
  }
  flush();
  return runs.filter((run) => run.length > 1);
}
