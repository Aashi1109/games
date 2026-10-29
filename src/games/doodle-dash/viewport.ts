/** Map pointer coordinates into the aspect-preserving drawing surface. */
export function canvasPoint(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'width' | 'height' | 'left' | 'top'>,
  width = 900,
  height = 620,
): [number, number] {
  const scale = Math.min(bounds.width / width, bounds.height / height);
  if (!(scale > 0)) return [0, 0];
  const drawnWidth = width * scale,
    drawnHeight = height * scale;
  const left = bounds.left + (bounds.width - drawnWidth) / 2;
  const top = bounds.top + (bounds.height - drawnHeight) / 2;
  return [
    Math.max(0, Math.min(1, (clientX - left) / drawnWidth)),
    Math.max(0, Math.min(1, (clientY - top) / drawnHeight)),
  ];
}
