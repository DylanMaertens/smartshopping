import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render as renderNative } from '@testing-library/react-native';
import { BarcodeScannerPanel } from './BarcodeScannerPanel';
import { cropCameraPhoto, removeCameraPhoto } from '@/services/cropCameraPhoto';
const mockTakePhoto = jest.fn();
jest.mock('@/services/cropCameraPhoto', () => ({ cropCameraPhoto: jest.fn(), removeCameraPhoto: jest.fn() }));
const captured = { uri: 'file:///cache/capture.jpg', width: 1200, height: 1600 };
function render(ui: React.ReactElement) {
  const screen = renderNative(ui);
  fireEvent(screen.getByTestId('camera-viewport'), 'layout', { nativeEvent: { layout: { width: 300, height: 300 } } });
  return screen;
}
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CameraView: React.forwardRef((props: object, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        getAvailablePictureSizesAsync: async () => ['4000x3000', '1600x1200', '640x480'],
        takePictureAsync: mockTakePhoto,
      }));
      return <View {...props} />;
    }),
    useCameraPermissions: () => [{ granted: true }, jest.fn(), jest.fn()],
  };
});
beforeEach(() => {
  mockTakePhoto.mockReset().mockResolvedValue(captured);
  jest.mocked(cropCameraPhoto).mockReset().mockResolvedValue('cropped-photo');
});
afterEach(() => jest.restoreAllMocks());
it('keeps camera status and controls without inline instructions and pauses the lamp for help', async () => {
  const props = { mode: 'text' as const, embedded: true, showInstructions: false, onCancel: jest.fn(), onScanned: jest.fn(), onPhotographed: jest.fn() };
  const screen = render(<BarcodeScannerPanel {...props} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  expect(screen.queryByText(/Cadre la liste, un article par ligne/)).toBeNull();
  screen.getByText('Prêt à photographier');
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  screen.rerender(<BarcodeScannerPanel {...props} paused />);
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  expect(screen.getByTestId('camera-torch-toggle')).toBeDisabled();
  screen.rerender(<BarcodeScannerPanel {...props} />);
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  screen.getByText('Photographier et reconnaître');
});
it('keeps the lamp on for the exposure, then commits it off before delivering the photo', async () => {
  let finish!: (photo: typeof captured) => void;
  mockTakePhoto.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn(() => {
    expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  });
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  expect(screen.getByTestId('camera-torch-toggle')).toBeDisabled();
  expect(onPhoto).not.toHaveBeenCalled();
  await act(async () => finish(captured));
  expect(onPhoto).toHaveBeenCalledTimes(1);
  expect(onPhoto).toHaveBeenCalledWith('cropped-photo');
  expect(cropCameraPhoto).toHaveBeenCalledWith(captured, { width: 300, height: 300 });
  expect(removeCameraPhoto).toHaveBeenCalledWith(captured.uri);
  screen.getByLabelText('Allumer la lampe');
});
it.each(['failure', 'oversized'] as const)('also turns off the lamp after a %s capture', async (outcome) => {
  if (outcome === 'failure') mockTakePhoto.mockRejectedValue(new Error('Capture impossible'));
  else jest.mocked(cropCameraPhoto).mockRejectedValue(new Error('Photo trop volumineuse'));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  expect(onPhoto).not.toHaveBeenCalled();
});
it('does not submit a photo that finishes after switching away from the camera', async () => {
  let finish!: (photo: typeof captured) => void;
  mockTakePhoto.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" embedded onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  screen.unmount();
  await act(async () => finish(captured));
  expect(onPhoto).not.toHaveBeenCalled();
  expect(cropCameraPhoto).not.toHaveBeenCalled();
  expect(removeCameraPhoto).toHaveBeenCalledWith(captured.uri);
});
it('captures a bounded photo only when ready and ignores duplicate taps', async () => {
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  expect(mockTakePhoto).not.toHaveBeenCalled();
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  expect(screen.getByTestId('barcode-camera-view').props.pictureSize).toBe('1600x1200');
  expect(screen.getByTestId('barcode-camera-view').props.onBarcodeScanned).toBeUndefined();
  const button = screen.getByText('Photographier et reconnaître');
  await act(async () => { fireEvent.press(button); fireEvent.press(button); });
  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  expect(onPhoto).toHaveBeenCalledWith('cropped-photo');
});
it('allows another capture after camera failure without submitting an image', async () => {
  mockTakePhoto.mockRejectedValueOnce(new Error('Capture impossible'));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  screen.getByText('Capture impossible');
  expect(onPhoto).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  expect(onPhoto).toHaveBeenCalledTimes(1);
});
it('crops against the measured expanded frame', async () => {
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel expanded mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  fireEvent(screen.getByTestId('camera-viewport'), 'layout', { nativeEvent: { layout: { width: 300, height: 600 } } });
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  expect(cropCameraPhoto).toHaveBeenCalledWith(captured, { width: 300, height: 600 });
  expect(onPhoto).toHaveBeenCalledWith('cropped-photo');
});
it('discards processing that completes after the app leaves the foreground', async () => {
  let finish!: (value: string) => void;
  let background!: () => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    background = () => listener('background'); return { remove: jest.fn() };
  });
  jest.mocked(cropCameraPhoto).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  act(background);
  await act(async () => finish('late-cropped-photo'));
  expect(onPhoto).not.toHaveBeenCalled();
  expect(removeCameraPhoto).toHaveBeenCalledWith(captured.uri);
});
it('rejects a capture if its frame changes while the shutter is pending', async () => {
  let finish!: (photo: typeof captured) => void;
  mockTakePhoto.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  fireEvent(screen.getByTestId('camera-viewport'), 'layout', { nativeEvent: { layout: { width: 300, height: 600 } } });
  await act(async () => finish(captured));
  expect(onPhoto).not.toHaveBeenCalled();
  expect(cropCameraPhoto).not.toHaveBeenCalled();
});
