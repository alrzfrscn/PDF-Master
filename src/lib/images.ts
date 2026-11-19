import type { Pt, StampAnnotation } from "./annotationTypes";
import { PX_PER_MM } from "./paper";
import { pageSizeMm } from "./pageUtils";
import type { RasterImage } from "./raster";
import { makeId, useDocStore } from "../stores/useDocStore";
import { useAnnotationStore } from "../stores/useAnnotationStore";
import { useToolStore } from "../stores/useToolStore";

/** Places a raster image as a movable, scalable stamp annotation. */
export function addImageStamp(image: RasterImage, atMm?: Pt): string | null {
  const doc = useDocStore.getState();
  const tab = doc.tabs.find((item) => item.id === doc.activeId);
  const page = tab?.pages[doc.page - 1];
  if (!tab || !page) return null;
  const pageSize = pageSizeMm(tab, page);
  const naturalWidthMm = image.width / PX_PER_MM;
  const widthMm = Math.max(8, Math.min(naturalWidthMm, pageSize.widthMm * 0.8));
  const heightMm = Math.max(4, widthMm * (image.height / Math.max(1, image.width)));
  const center = atMm ?? [pageSize.widthMm / 2, pageSize.heightMm / 2];
  const xMm = Math.max(0, Math.min(center[0] - widthMm / 2, pageSize.widthMm - widthMm));
  const yMm = Math.max(0, Math.min(center[1] - heightMm / 2, pageSize.heightMm - heightMm));
  const annotation: StampAnnotation = {
    id: makeId("a"),
    type: "stamp",
    stampId: makeId("image"),
    imageUrl: image.dataUrl,
    xMm,
    yMm,
    widthMm,
    heightMm,
    rotation: 0,
    flipH: false,
    flipV: false,
    opacity: 1,
  };
  useAnnotationStore.getState().add(annotation);
  // The fresh image is ready to move or resize, not another trip to the file picker.
  useAnnotationStore.getState().select([annotation.id]);
  useToolStore.getState().setTool("select");
  return annotation.id;
}
