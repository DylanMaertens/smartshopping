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
