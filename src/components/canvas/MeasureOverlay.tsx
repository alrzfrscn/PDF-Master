import type { Pt } from "../../lib/annotationTypes";
import { angleAt, distanceStats, formatArea, formatLength, polygonArea, polylineLength } from "../../lib/measure";
import type { MeasureMode, MeasureUnit } from "../../lib/measure";

export interface MeasureState {
  points: Pt[];
  cursor: Pt | null;
  finished: boolean;
}

/** Live numbers for the pill above the page. */export function measureSummary(mode: MeasureMode, state: MeasureState, scale: number, unit: MeasureUnit): string | null {
  const points = state.cursor ? [...state.points, state.cursor] : state.points;
  if (mode === "distance") {
    const [a, b] = points;
    if (!a || !b) return null;
    const stats = distanceStats(a, b);
    return `${formatLength(stats.distance, scale, unit)} · ΔX ${formatLength(Math.abs(stats.dx), scale, unit)} · ΔY ${formatLength(
      Math.abs(stats.dy),
      scale,
      unit,
    )} · ${stats.angle.toFixed(1)}°`;
  }
  if (mode === "perimeter") {
    if (points.length < 2) return null;
    return `${points.length} points · ${formatLength(polylineLength(points), scale, unit)}`;
  }
  if (mode === "area") {
    const closed = points.length >= 3 ? points : state.points;
    if (closed.length < 3) return null;
    return `${formatArea(polygonArea(closed), scale, unit)} · perimeter ${formatLength(
      polylineLength([...closed, closed[0]]),
      scale,
      unit,
    )}`;
  }
  const [vertex, first, second] = points;
  if (!vertex || !first || !second) return null;
  return `${angleAt(first, vertex, second).toFixed(1)}°`;
}

/** Transient measurement preview; nothing here is persisted until Commit. */
export function MeasureOverlay({ mode, state }: { mode: MeasureMode; state: MeasureState }) {
  const points = state.cursor ? [...state.points, state.cursor] : state.points;
  const solid = state.finished;
  const stroke = "var(--accent)";

  if (mode === "distance") {
    const [a, b] = points;
    return (
      <g fill="none" stroke={stroke} strokeWidth={0.45}>
        {a && b && <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeDasharray={solid ? undefined : "1.6 1"} />}
        {points.map((point, index) => (
          <circle key={index} cx={point[0]} cy={point[1]} r={0.9} fill="var(--paper)" />
        ))}
      </g>
    );
  }

  if (mode === "perimeter") {
    return (
      <g fill="none" stroke={stroke} strokeWidth={0.45}>
        <polyline points={points.map((point) => point.join(",")).join(" ")} strokeDasharray={solid ? undefined : "1.6 1"} />
        {points.map((point, index) => (
          <circle key={index} cx={point[0]} cy={point[1]} r={index === 0 ? 1 : 0.8} fill="var(--paper)" />
        ))}
      </g>
    );
  }

  if (mode === "area") {
    const closed = points.length >= 3 ? points : state.points;
    return (
      <g fill="none" stroke={stroke} strokeWidth={0.45}>
        {closed.length >= 2 && (
          <polygon
            points={closed.map((point) => point.join(",")).join(" ")}
            fill="var(--accent-soft)"
            strokeDasharray={solid ? undefined : "1.6 1"}
          />
        )}
        {state.points.map((point, index) => (
          <circle key={index} cx={point[0]} cy={point[1]} r={index === 0 ? 1 : 0.8} fill="var(--paper)" />
        ))}
      </g>
    );
  }

  const vertex = state.points[0];
  const first = state.points[1];
  const second = state.points[2] ?? state.cursor;
  const radius = 10;
  let arc = "";
  if (vertex && first && second) {
    const a1 = Math.atan2(first[1] - vertex[1], first[0] - vertex[0]);
    const a2 = Math.atan2(second[1] - vertex[1], second[0] - vertex[0]);
    const p1: Pt = [vertex[0] + Math.cos(a1) * radius, vertex[1] + Math.sin(a1) * radius];
    const p2: Pt = [vertex[0] + Math.cos(a2) * radius, vertex[1] + Math.sin(a2) * radius];
    const sweep = ((a2 - a1 + Math.PI * 2) % (Math.PI * 2)) > Math.PI ? 0 : 1;
    arc = `M ${p1[0]} ${p1[1]} A ${radius} ${radius} 0 0 ${sweep} ${p2[0]} ${p2[1]}`;
  }
  return (
    <g fill="none" stroke={stroke} strokeWidth={0.45}>
      {vertex && first && <line x1={vertex[0]} y1={vertex[1]} x2={first[0]} y2={first[1]} />}
      {vertex && second && (
        <line x1={vertex[0]} y1={vertex[1]} x2={second[0]} y2={second[1]} strokeDasharray={solid ? undefined : "1.6 1"} />
      )}
      {arc && <path d={arc} strokeWidth={0.35} />}
      {state.points.map((point, index) => (
        <circle key={index} cx={point[0]} cy={point[1]} r={index === 0 ? 1.1 : 0.8} fill="var(--paper)" />
      ))}
    </g>
  );
}
