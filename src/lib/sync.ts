import type { ToolId, ToolProps } from "./types";

/**
 * Separate vs. synchronous tool properties, as shipped by PDF Annotator:
 * Color and LineWidth sync across Pen, Text, Line, Arrow, Rectangle, Ellipse, Polygon,
 * Dimension, Formula; LineStyle across Line and Arrow; FillColor and Opacity across the
 * area shapes. Marker is never synchronised, in either direction.
 */
export const SYNC_TARGETS: Partial<Record<keyof ToolProps, ToolId[]>> = {
  color: ["pen", "text", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension", "formula"],
  thicknessMm: ["pen", "text", "line", "arrow", "rectangle", "ellipse", "polygon", "dimension", "formula"],
  lineStyle: ["line", "arrow"],
  fill: ["rectangle", "ellipse", "polygon"],
  opacity: ["rectangle", "ellipse", "polygon"],
};

export const NEVER_SYNCED: ToolId[] = ["marker"];

export function syncTargets(field: keyof ToolProps, tool: ToolId, sync: boolean): ToolId[] {
  if (!sync || tool === "marker") return [tool];
  const group = SYNC_TARGETS[field];
  if (!group || !group.includes(tool)) return [tool];
  return group.filter((target) => !NEVER_SYNCED.includes(target));
}

/** Applies a property patch and returns a new per-tool property map. */
export function applyToolPatch(
  all: Record<ToolId, ToolProps>,
  tool: ToolId,
  patch: Partial<ToolProps>,
  sync: boolean,
): Record<ToolId, ToolProps> {
  const next = { ...all };
  for (const field of Object.keys(patch) as (keyof ToolProps)[]) {
    const value = patch[field];
    if (value === undefined) continue;
    for (const target of syncTargets(field, tool, sync)) {
      next[target] = { ...next[target], [field]: value } as ToolProps;
    }
  }
  return next;
}
