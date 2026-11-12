import { beforeEach, expect, it, vi } from 'vitest';
import { cropCameraPhoto } from './cropCameraPhoto';
const mocks = vi.hoisted(() => ({ crop: vi.fn(), render: vi.fn(), save: vi.fn(), releaseImage: vi.fn(), releaseContext: vi.fn(), remove: vi.fn() }));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ crop: mocks.crop, renderAsync: mocks.render, release: mocks.releaseContext }) },
}));
vi.mock('expo-file-system', () => ({ File: class {
  exists = true;
  constructor(public uri: string) {}
  delete() { mocks.remove(this.uri); }
} }));
const photo = { uri: 'file:///cache/capture.jpg', width: 1200, height: 1600 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.render.mockResolvedValue({ saveAsync: mocks.save, release: mocks.releaseImage });
  mocks.save.mockResolvedValue({ uri: 'file:///cache/cropped.jpg', base64: 'cropped-only' });
});
it('returns only the recropped JPEG and releases its temporary resources', async () => {
  expect(await cropCameraPhoto(photo, { width: 300, height: 300 })).toBe('cropped-only');
  expect(mocks.crop).toHaveBeenCalledWith({ originX: 0, originY: 200, width: 1200, height: 1200 });
  expect(mocks.save).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8, base64: true });
  expect(mocks.remove).toHaveBeenCalledWith('file:///cache/cropped.jpg');
  expect(mocks.releaseImage).toHaveBeenCalledOnce();
  expect(mocks.releaseContext).toHaveBeenCalledOnce();
});
it('does not fall back to the uncropped photo on processing failure', async () => {
  mocks.render.mockRejectedValue(new Error('Crop failed'));
  await expect(cropCameraPhoto(photo, { width: 300, height: 300 })).rejects.toThrow('Crop failed');
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.releaseContext).toHaveBeenCalledOnce();
});
it('rejects an oversized result and still removes it', async () => {
  mocks.save.mockResolvedValue({ uri: 'file:///cache/cropped.jpg', base64: 'x'.repeat(4 * 1024 * 1024) });
  await expect(cropCameraPhoto(photo, { width: 300, height: 600 })).rejects.toThrow('volumineuse');
  expect(mocks.remove).toHaveBeenCalledWith('file:///cache/cropped.jpg');
});
