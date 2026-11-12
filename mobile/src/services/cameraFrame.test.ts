import { expect, it } from 'vitest';
import { barcodeInsideFrame, cameraPreviewLayout, photoFrameCrop } from './cameraFrame';

it('centres the portrait sensor and crops a compact square', () => {
  expect(cameraPreviewLayout({ width: 300, height: 300 })).toEqual({ width: 300, height: 400, left: 0, top: -50 });
  expect(photoFrameCrop({ width: 1200, height: 1600 }, { width: 300, height: 300 }))
    .toEqual({ originX: 0, originY: 200, width: 1200, height: 1200 });
});
it('crops horizontally in the expanded portrait frame', () => {
  expect(cameraPreviewLayout({ width: 300, height: 600 })).toEqual({ width: 450, height: 600, left: -75, top: 0 });
  expect(photoFrameCrop({ width: 1200, height: 1600 }, { width: 300, height: 600 }))
    .toEqual({ originX: 200, originY: 0, width: 800, height: 1600 });
});
it.each([{ width: 0, height: 300 }, { width: NaN, height: 300 }, { width: 300, height: Infinity }])('rejects invalid frames %s', (frame) => {
  expect(cameraPreviewLayout(frame)).toBeNull();
  expect(barcodeInsideFrame({}, frame)).toBe(false);
  expect(() => photoFrameCrop({ width: 1200, height: 1600 }, frame)).toThrow();
});
it('keeps only codes fully within the clipped preview, with corners or bounds', () => {
  const frame = { width: 300, height: 300 };
  expect(barcodeInsideFrame({ cornerPoints: [{ x: 10, y: 50 }, { x: 290, y: 350 }] }, frame)).toBe(true);
  expect(barcodeInsideFrame({ cornerPoints: [{ x: 10, y: 49 }, { x: 290, y: 350 }] }, frame)).toBe(false);
  expect(barcodeInsideFrame({ bounds: { origin: { x: 10, y: 60 }, size: { width: 100, height: 60 } } }, frame)).toBe(true);
  expect(barcodeInsideFrame({ bounds: { origin: { x: 10, y: 330 }, size: { width: 100, height: 60 } } }, frame)).toBe(false);
  expect(barcodeInsideFrame({}, frame)).toBe(false);
  expect(barcodeInsideFrame({ cornerPoints: [{ x: NaN, y: 80 }, { x: 30, y: 90 }] }, frame)).toBe(false);
});
it('does not accept a code hidden on either side of the expanded frame', () => {
  const frame = { width: 300, height: 600 };
  const code = (x: number) => ({ bounds: { origin: { x, y: 100 }, size: { width: 40, height: 100 } } });
  expect(barcodeInsideFrame(code(10), frame)).toBe(false);
  expect(barcodeInsideFrame(code(200), frame)).toBe(true);
  expect(barcodeInsideFrame(code(340), frame)).toBe(false);
});
it('rounds crop dimensions within the source, without stretching', () => {
  const crop = photoFrameCrop({ width: 1201, height: 1601 }, { width: 317, height: 599 });
  expect(crop.originX + crop.width).toBeLessThanOrEqual(1201);
  expect(crop.originY + crop.height).toBeLessThanOrEqual(1601);
  expect(crop.width / crop.height).toBeCloseTo(317 / 599, 2);
});
