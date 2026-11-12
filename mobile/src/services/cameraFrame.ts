export type FrameSize = { width: number; height: number };
type Point = { x: number; y: number };
type BarcodeGeometry = { cornerPoints?: Point[]; bounds?: { origin: Point; size: FrameSize } };

const validSize = ({ width, height }: FrameSize) => Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;

// The app is portrait-only. Keep the 4:3 sensor preview at its natural ratio,
// then clip its centre to the measured frame (compact or expanded).
export function cameraPreviewLayout(frame: FrameSize) {
  if (!validSize(frame)) return null;
  const width = Math.max(frame.width, frame.height * 3 / 4);
  const height = width * 4 / 3;
  return { width, height, left: (frame.width - width) / 2, top: (frame.height - height) / 2 };
}

export function barcodeInsideFrame(result: BarcodeGeometry, frame: FrameSize): boolean {
  const preview = cameraPreviewLayout(frame);
  if (!preview) return false;
  const points = result.cornerPoints?.length && result.cornerPoints.length >= 2 ? result.cornerPoints : result.bounds && validSize(result.bounds.size)
    ? [result.bounds.origin, { x: result.bounds.origin.x + result.bounds.size.width, y: result.bounds.origin.y + result.bounds.size.height }]
    : [];
  // Missing geometry must not authorize a code outside the visible area.
  return points.length >= 2 && points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)
    && x + preview.left >= 0 && x + preview.left <= frame.width
    && y + preview.top >= 0 && y + preview.top <= frame.height);
}

export function photoFrameCrop(photo: FrameSize, frame: FrameSize) {
  if (!validSize(photo) || !validSize(frame)) throw new Error('Cadrage indisponible. Attends que la caméra soit prête.');
  const scale = Math.max(frame.width / photo.width, frame.height / photo.height);
  const width = Math.max(1, Math.floor(frame.width / scale));
  const height = Math.max(1, Math.floor(frame.height / scale));
  return { originX: Math.floor((photo.width - width) / 2), originY: Math.floor((photo.height - height) / 2), width, height };
}
