import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BarcodeScannerPanel } from './BarcodeScannerPanel';
const mockTakePhoto = jest.fn();
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
beforeEach(() => mockTakePhoto.mockReset().mockResolvedValue({ base64: 'photo' }));
it('keeps the lamp on for the exposure, then commits it off before delivering the photo', async () => {
  let finish!: (photo: { base64: string }) => void;
  mockTakePhoto.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn(() => {
    expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  });
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByText('Allumer la lampe'));
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  expect(onPhoto).not.toHaveBeenCalled();
  await act(async () => finish({ base64: 'photo' }));
  expect(onPhoto).toHaveBeenCalledTimes(1);
  screen.getByText('Allumer la lampe');
});
it.each(['failure', 'oversized'] as const)('also turns off the lamp after a %s capture', async (outcome) => {
  if (outcome === 'failure') mockTakePhoto.mockRejectedValue(new Error('Capture impossible'));
  else mockTakePhoto.mockResolvedValue({ base64: 'x'.repeat(4 * 1024 * 1024) });
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByText('Allumer la lampe'));
  await act(async () => fireEvent.press(screen.getByText('Photographier et reconnaître')));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  expect(onPhoto).not.toHaveBeenCalled();
});
it('does not submit a photo that finishes after switching away from the camera', async () => {
  let finish!: (photo: { base64: string }) => void;
  mockTakePhoto.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onPhoto = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="text" embedded onCancel={jest.fn()} onScanned={jest.fn()} onPhotographed={onPhoto} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByText('Photographier et reconnaître'));
  screen.unmount();
  await act(async () => finish({ base64: 'photo' }));
  expect(onPhoto).not.toHaveBeenCalled();
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
  expect(onPhoto).toHaveBeenCalledWith('photo');
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
