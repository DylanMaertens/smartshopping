import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { photoFrameCrop, type FrameSize } from './cameraFrame';

// Both files are temporary files created by our own capture, never user imports.
export function removeCameraPhoto(uri: string) {
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* Cache cleanup must not discard a successful capture. */ }
}

export async function cropCameraPhoto(photo: FrameSize & { uri: string }, frame: FrameSize): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  let image: ImageRef | undefined;
  let croppedUri: string | undefined;
  try {
    context.crop(photoFrameCrop(photo, frame));
    image = await context.renderAsync();
    const cropped = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    croppedUri = cropped.uri;
    if (!cropped.base64 || cropped.base64.length > 4 * 1024 * 1024 - 128) {
      throw new Error('Photo trop volumineuse ou indisponible. Reprends une partie plus courte de la liste.');
    }
    return cropped.base64;
  } finally {
    image?.release();
    context.release();
    if (croppedUri) removeCameraPhoto(croppedUri);
  }
}
