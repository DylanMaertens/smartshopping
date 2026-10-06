import React from 'react';
import { AppState, Linking, type AppStateStatus } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { themes } from '@/theme/themes';
import * as themeContext from '@/theme/ThemeProvider';
import { BarcodeScannerPanel } from './BarcodeScannerPanel';
const mockPermission = { granted: true, canAskAgain: true };
const mockRefreshPermission = jest.fn(async () => mockPermission);
const mockRequestPermission = jest.fn();
jest.mock('expo-camera', () => ({
  CameraView: require('react-native').View,
  useCameraPermissions: () => [mockPermission, mockRequestPermission, mockRefreshPermission],
}));
beforeEach(() => { mockPermission.granted = true; mockPermission.canAskAgain = true; jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());
it('pauses reading while the naming prompt is displayed and resumes without closing', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel paused onCancel={jest.fn()} onScanned={onScanned} />);
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    expect(screen.getByTestId('barcode-camera-view').props.onBarcodeScanned).toBeUndefined();
    screen.getByText('En pause');
    screen.rerender(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data: '3017620422003', type: 'ean13' });
    act(() => jest.advanceTimersByTime(250));
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data: '3017620422003', type: 'ean13' });
    expect(onScanned).toHaveBeenCalledWith('3017620422003');
  } finally { jest.useRealTimers(); }
});
it('waits for a stable code, pauses between products and permits deliberate repeats', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    const scan = (data: string) => fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data, type: 'ean13' });
    scan('3017620422003');
    expect(onScanned).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    scan('3017620422003');
    act(() => jest.advanceTimersByTime(250));
    scan('3017620422003');
    expect(onScanned).toHaveBeenCalledTimes(1);
    screen.getByText('Patiente un instant…');
    expect(screen.getByTestId('camera-frame').props.style.borderColor).toBe(themes.minimal.muted);
    scan('3274080005003');
    act(() => jest.advanceTimersByTime(250));
    scan('3274080005003');
    fireEvent.press(screen.getByText('Ajouter encore ce produit'));
    expect(onScanned).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(1500));
    scan('3274080005003');
    act(() => jest.advanceTimersByTime(250));
    scan('3274080005003');
    expect(onScanned).toHaveBeenCalledTimes(2);
    act(() => jest.advanceTimersByTime(1500));
    fireEvent.press(screen.getByText('Ajouter encore ce produit'));
    expect(onScanned).toHaveBeenCalledTimes(3);
    screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
it('ignores malformed codes and wrong checksums', () => {
  const onScanned = jest.fn();
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
  for (const data of ['ABC12345', '123', '123456789012345', '3017620422004']) {
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data });
  }
  expect(onScanned).not.toHaveBeenCalled();
});
it('offers permission and cancellation when camera access is denied', () => {
  mockPermission.granted = false;
  const cancel = jest.fn();
  const screen = render(<BarcodeScannerPanel onCancel={cancel} onScanned={jest.fn()} />);
  expect(screen.queryByTestId('barcode-camera-view')).toBeNull();
  fireEvent.press(screen.getByTestId('request-camera-permission'));
  fireEvent.press(screen.getByText('Fermer'));
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(1);
});

it('offers Android settings when the permission cannot be requested again', async () => {
  mockPermission.granted = false;
  mockPermission.canAskAgain = false;
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Ouvrir les paramètres')));
  expect(settings).toHaveBeenCalledTimes(1);
  expect(mockRequestPermission).not.toHaveBeenCalled();
});
it('refreshes permissions after returning from settings and releases the background camera', async () => {
  let onChange!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    onChange = callback;
    return { remove };
  });
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
  expect(screen.getByTestId('barcode-camera-view')).toBeTruthy();
  act(() => onChange('background'));
  expect(screen.queryByTestId('barcode-camera-view')).toBeNull();
  await act(async () => onChange('active'));
  expect(mockRefreshPermission).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('barcode-camera-view')).toBeTruthy();
  screen.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
it('shows camera failures and remounts the camera on retry', () => {
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'mountError', { message: 'Camera unavailable' });
  screen.getByText('La caméra n’a pas pu démarrer.');
  expect(screen.queryByText('Camera unavailable')).toBeNull();
  expect(screen.getByTestId('camera-frame').props.style.borderColor).toBe(themes.minimal.danger);
  expect(screen.queryByTestId('barcode-camera-view')).toBeNull();
  fireEvent.press(screen.getByText('Relancer la caméra'));
  expect(screen.queryByText('Camera unavailable')).toBeNull();
  expect(screen.getByTestId('barcode-camera-view')).toBeTruthy();
});
it('enables the torch only after the camera is ready', () => {
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
  fireEvent.press(screen.getByText('Allumer la lampe'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
  fireEvent.press(screen.getByText('Allumer la lampe'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  screen.getByText('Prêt à scanner');
});
it('keeps a close button while permissions are denied', () => {
  mockPermission.granted = false;
  const close = jest.fn();
  const screen = render(<BarcodeScannerPanel onCancel={close} onScanned={jest.fn()} />);
  fireEvent.press(screen.getByText('Fermer'));
  expect(close).toHaveBeenCalledTimes(1);
});

it('scans invitation QR codes and rejects other links without locking the camera', () => {
  const onScanned = jest.fn();
  const screen = render(<BarcodeScannerPanel mode="invitation" onCancel={jest.fn()} onScanned={onScanned} />);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
  const camera = screen.getByTestId('barcode-camera-view');
  expect(camera.props.barcodeScannerSettings.barcodeTypes).toEqual(['qr']);
  fireEvent(camera, 'barcodeScanned', { data: 'https://example.com' });
  screen.getByText('Ce QR code n’est pas une invitation SmartShopping.');
  expect(onScanned).not.toHaveBeenCalled();
  const scan = camera.props.onBarcodeScanned;
  act(() => {
    scan({ data: 'smartshopping://invite/' + 'A'.repeat(32) });
    scan({ data: 'smartshopping://invite/' + 'A'.repeat(32) });
  });
  expect(onScanned).toHaveBeenCalledTimes(1);
  expect(onScanned).toHaveBeenCalledWith('a'.repeat(32));
});

it.each(Object.values(themes))('reflects camera readiness and cooldown in the $name theme', (theme) => {
  jest.useFakeTimers();
  try {
    jest.spyOn(themeContext, 'useTheme').mockReturnValue({ theme, headingFont: undefined, selectTheme: jest.fn(), error: null });
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
    const frame = () => screen.getByTestId('camera-frame').props.style;
    expect(frame()).toMatchObject({ borderColor: theme.muted, borderStyle: 'dashed', borderRadius: theme.radius });
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    expect(frame()).toMatchObject({ borderColor: theme.primary, borderStyle: 'solid' });
    expect(screen.queryByText('Relancer la caméra')).toBeNull();
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data: '3017620422003' });
    act(() => jest.advanceTimersByTime(250));
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data: '3017620422003' });
    expect(frame()).toMatchObject({ borderColor: theme.muted, borderStyle: 'dashed' });
    act(() => jest.advanceTimersByTime(1499));
    screen.getByText('Patiente un instant…');
    act(() => jest.advanceTimersByTime(1));
    expect(frame()).toMatchObject({ borderColor: theme.primary, borderStyle: 'solid' });
    screen.getByText('Prêt à scanner');
    screen.unmount();
  } finally { jest.useRealTimers(); }
});
