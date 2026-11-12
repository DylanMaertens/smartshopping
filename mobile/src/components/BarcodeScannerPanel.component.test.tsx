import React from 'react';
import { AppState, Linking, StyleSheet, type AppStateStatus } from 'react-native';
import { act, fireEvent, render as renderNative, within } from '@testing-library/react-native';
import { DEFAULT_THEME_ID, themes } from '@/theme/themes';
import * as themeContext from '@/theme/ThemeProvider';
import { BarcodeScannerPanel } from './BarcodeScannerPanel';
const mockPermission = { granted: true, canAskAgain: true };
const mockRefreshPermission = jest.fn(async () => mockPermission);
const mockRequestPermission = jest.fn();
jest.mock('@/services/cropCameraPhoto', () => ({ cropCameraPhoto: jest.fn(), removeCameraPhoto: jest.fn() }));
const geometry = { bounds: { origin: { x: 80, y: 100 }, size: { width: 100, height: 80 } } };
function render(ui: React.ReactElement) {
  const screen = renderNative(ui);
  const viewport = screen.queryByTestId('camera-viewport');
  if (viewport) fireEvent(viewport, 'layout', { nativeEvent: { layout: { width: 300, height: 300 } } });
  return screen;
}
jest.mock('expo-camera', () => ({
  CameraView: require('react-native').View,
  useCameraPermissions: () => [mockPermission, mockRequestPermission, mockRefreshPermission],
}));
beforeEach(() => { mockPermission.granted = true; mockPermission.canAskAgain = true; jest.clearAllMocks(); });
afterEach(() => jest.restoreAllMocks());
it.each(['product', 'text'] as const)('overlays an accessible icon in the lower-right camera corner in %s mode', (mode) => {
  const props = { mode, onCancel: jest.fn(), onScanned: jest.fn(), onExpandedChange: jest.fn() };
  const screen = render(<BarcodeScannerPanel {...props} />);
  const frame = within(screen.getByTestId('camera-frame'));
  const button = frame.getByRole('button', { name: 'Agrandir le cadre caméra' });
  const style = StyleSheet.flatten(button.props.style);
  expect(style).toMatchObject({ position: 'absolute', right: 8, bottom: 8 });
  expect(style.width).toBeGreaterThanOrEqual(48);
  expect(style.height).toBeGreaterThanOrEqual(48);
  expect(screen.queryByText('Agrandir')).toBeNull();
  fireEvent.press(button);
  expect(props.onExpandedChange).toHaveBeenCalledWith(true);
  screen.rerender(<BarcodeScannerPanel {...props} expanded />);
  frame.getByRole('button', { name: 'Réduire le cadre caméra' });
  expect(screen.queryByText('Réduire')).toBeNull();
});
it('ignores off-frame barcodes and resets their pending confirmation', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    const scan = (bounds = geometry.bounds) => fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { data: '3017620422003', type: 'ean13', bounds });
    scan();
    act(() => jest.advanceTimersByTime(250));
    scan({ origin: { x: 80, y: 0 }, size: { width: 100, height: 40 } });
    scan();
    expect(onScanned).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(250));
    scan();
    expect(onScanned).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});
it('changes frame size without remounting the camera and resets its lamp', () => {
  const props = { onCancel: jest.fn(), onScanned: jest.fn(), onExpandedChange: jest.fn() };
  const screen = render(<BarcodeScannerPanel {...props} />);
  const camera = screen.getByTestId('barcode-camera-view');
  fireEvent(camera, 'cameraReady');
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  fireEvent.press(screen.getByLabelText('Agrandir le cadre caméra'));
  expect(props.onExpandedChange).toHaveBeenCalledWith(true);
  screen.rerender(<BarcodeScannerPanel {...props} expanded />);
  expect(screen.getByTestId('barcode-camera-view')).toBe(camera);
  expect(camera.props.enableTorch).toBe(false);
  fireEvent.press(screen.getByLabelText('Réduire le cadre caméra'));
  expect(props.onExpandedChange).toHaveBeenLastCalledWith(false);
});
it('uses autofocus and a checksum-valid Android raw value even before cameraReady, with slow frames', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    const camera = screen.getByTestId('barcode-camera-view');
    expect(camera.props.autofocus).toBe('off');
    const result = { ...geometry, data: 'null', raw: '3017620422003', type: 'ean13' };
    fireEvent(camera, 'barcodeScanned', result);
    expect(screen.getByTestId('barcode-camera-view').props.autofocus).toBe('on');
    expect(onScanned).not.toHaveBeenCalled();
    screen.getByText('Lecture reçue. Garde le code dans le cadre pour confirmer.');
    act(() => jest.advanceTimersByTime(1800));
    fireEvent(camera, 'barcodeScanned', result);
    expect(onScanned).toHaveBeenCalledWith('3017620422003');
    expect(onScanned).toHaveBeenCalledTimes(1);
    screen.unmount();
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
it('does not listen for barcodes in the photo mode and omits the standalone header when embedded', async () => {
  const onScanned = jest.fn();
  const screen = render(<BarcodeScannerPanel embedded mode="text" onCancel={jest.fn()} onScanned={onScanned} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  expect(screen.getByTestId('barcode-camera-view').props.onBarcodeScanned).toBeUndefined();
  expect(screen.queryByText('Fermer')).toBeNull();
  screen.getByText('Photographier et reconnaître');
  expect(onScanned).not.toHaveBeenCalled();
});
it('pauses reading while the naming prompt is displayed and resumes without closing', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel paused onCancel={jest.fn()} onScanned={onScanned} />);
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    expect(screen.getByTestId('barcode-camera-view').props.onBarcodeScanned).toBeUndefined();
    screen.getByText('En pause');
    screen.rerender(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data: '3017620422003', type: 'ean13' });
    act(() => jest.advanceTimersByTime(250));
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data: '3017620422003', type: 'ean13' });
    expect(onScanned).toHaveBeenCalledWith('3017620422003');
  } finally { jest.useRealTimers(); }
});
it('waits for a stable code, pauses between products and permits deliberate repeats', () => {
  jest.useFakeTimers();
  try {
    const onScanned = jest.fn();
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
    const scan = (data: string) => fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data, type: 'ean13' });
    scan('3017620422003');
    expect(onScanned).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    scan('3017620422003');
    act(() => jest.advanceTimersByTime(250));
    scan('3017620422003');
    expect(onScanned).toHaveBeenCalledTimes(1);
    screen.getByText('Patiente un instant…');
    expect(screen.getByTestId('camera-frame').props.style.borderColor).toBe(themes[DEFAULT_THEME_ID].muted);
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
    // RN Animated detaches props in queueMicrotask. Drain that cleanup only;
    // a leaked scanner timeout/interval must still fail the assertion below.
    act(() => jest.runAllTicks());
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});
it('ignores malformed codes and wrong checksums', () => {
  const onScanned = jest.fn();
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={onScanned} />);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
  for (const data of ['ABC12345', '123', '123456789012345', '3017620422004']) {
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data });
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
  expect(screen.getByTestId('camera-frame').props.style.borderColor).toBe(themes[DEFAULT_THEME_ID].danger);
  expect(screen.queryByTestId('barcode-camera-view')).toBeNull();
  fireEvent.press(screen.getByLabelText('Relancer la caméra'));
  expect(screen.queryByText('Camera unavailable')).toBeNull();
  expect(screen.getByTestId('barcode-camera-view')).toBeTruthy();
});
it.each([false, true])('restarts from the upper-left icon and resets the lamp (expanded=%s)', (expanded) => {
  const screen = render(<BarcodeScannerPanel expanded={expanded} onCancel={jest.fn()} onScanned={jest.fn()} />);
  const camera = screen.getByTestId('barcode-camera-view');
  fireEvent(camera, 'cameraReady');
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  const restart = within(screen.getByTestId('camera-frame')).getByRole('button', { name: 'Relancer la caméra' });
  const style = StyleSheet.flatten(restart.props.style);
  expect(style).toMatchObject({ position: 'absolute', left: 8, top: 8 });
  expect(style.width).toBeGreaterThanOrEqual(48);
  expect(style.height).toBeGreaterThanOrEqual(48);
  expect(screen.queryByText('Relancer la caméra')).toBeNull();
  fireEvent.press(restart);
  expect(screen.getByTestId('barcode-camera-view')).not.toBe(camera);
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  screen.getByText('Démarrage…');
});
it('keeps the restart icon available when the photo camera fails', async () => {
  const screen = render(<BarcodeScannerPanel mode="text" onCancel={jest.fn()} onScanned={jest.fn()} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent(screen.getByTestId('barcode-camera-view'), 'mountError', { message: 'Camera unavailable' });
  const restart = within(screen.getByTestId('camera-frame')).getByRole('button', { name: 'Relancer la caméra' });
  expect(restart).not.toBeDisabled();
  fireEvent.press(restart);
  expect(screen.queryByText('La caméra n’a pas pu démarrer.')).toBeNull();
  screen.getByTestId('barcode-camera-view');
});
it('enables the torch only after the camera is ready', () => {
  const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  screen.getByText('Prêt à scanner');
});
it.each([
  ['product', false], ['product', true], ['text', false], ['text', true],
] as const)('toggles the accessible lamp icon inside the %s frame (expanded=%s)', async (mode, expanded) => {
  const screen = render(<BarcodeScannerPanel mode={mode} expanded={expanded} onCancel={jest.fn()} onScanned={jest.fn()} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  const frame = within(screen.getByTestId('camera-frame'));
  const off = frame.getByRole('button', { name: 'Allumer la lampe' });
  const offStyle = StyleSheet.flatten(off.props.style);
  expect(offStyle).toMatchObject({ position: 'absolute', left: 8, bottom: 8 });
  expect(offStyle.width).toBeGreaterThanOrEqual(48);
  expect(offStyle.height).toBeGreaterThanOrEqual(48);
  expect(off.props.accessibilityState.selected).toBe(false);
  expect(screen.queryByText('Allumer la lampe')).toBeNull();
  fireEvent.press(off);
  const on = frame.getByRole('button', { name: 'Éteindre la lampe' });
  expect(on.props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(on.props.style).backgroundColor).not.toBe(offStyle.backgroundColor);
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  fireEvent.press(on);
  expect(frame.getByRole('button', { name: 'Allumer la lampe' }).props.accessibilityState.selected).toBe(false);
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
});
it.each(['product', 'text'] as const)('reopens %s camera with the torch off after leaving with it on', async (mode) => {
  const props = { mode, onCancel: jest.fn(), onScanned: jest.fn() };
  const first = render(<BarcodeScannerPanel {...props} />);
  await act(async () => fireEvent(first.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(first.getByLabelText('Allumer la lampe'));
  expect(first.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  // Tab changes remove the camera, including the OCR panel's inactive state.
  first.unmount();
  const reopened = render(<BarcodeScannerPanel {...props} />);
  await act(async () => fireEvent(reopened.getByTestId('barcode-camera-view'), 'cameraReady'));
  expect(reopened.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  reopened.getByLabelText('Allumer la lampe');
  reopened.unmount();
});
it.each(['product', 'text'] as const)('forgets the %s torch preference on backgrounding', async (mode) => {
  let change!: (state: AppStateStatus) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, callback) => {
    change = callback;
    return { remove: jest.fn() };
  });
  const screen = render(<BarcodeScannerPanel mode={mode} onCancel={jest.fn()} onScanned={jest.fn()} />);
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  fireEvent.press(screen.getByLabelText('Allumer la lampe'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(true);
  act(() => change('background'));
  expect(screen.queryByTestId('barcode-camera-view')).toBeNull();
  await act(async () => change('active'));
  await act(async () => fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady'));
  expect(screen.getByTestId('barcode-camera-view').props.enableTorch).toBe(false);
  screen.unmount();
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
  fireEvent(camera, 'barcodeScanned', { ...geometry, data: 'https://example.com' });
  screen.getByText('Ce QR code n’est pas une invitation Poduna.');
  expect(onScanned).not.toHaveBeenCalled();
  const scan = camera.props.onBarcodeScanned;
  act(() => {
    scan({ ...geometry, data: 'smartshopping://invite/' + 'A'.repeat(32) });
    scan({ ...geometry, data: 'smartshopping://invite/' + 'A'.repeat(32) });
  });
  expect(onScanned).toHaveBeenCalledTimes(1);
  expect(onScanned).toHaveBeenCalledWith('a'.repeat(32));
});

it.each(Object.values(themes))('reflects camera readiness and cooldown in the $name theme', (theme) => {
  jest.useFakeTimers();
  try {
    jest.spyOn(themeContext, 'useTheme').mockReturnValue({ theme, headingFont: undefined, selectTheme: jest.fn(), reloadTheme: jest.fn(), error: null });
    const screen = render(<BarcodeScannerPanel onCancel={jest.fn()} onScanned={jest.fn()} />);
    const frame = () => screen.getByTestId('camera-frame').props.style;
    expect(frame()).toMatchObject({ borderColor: theme.muted, borderStyle: 'dashed', borderRadius: theme.radius });
    fireEvent(screen.getByTestId('barcode-camera-view'), 'cameraReady');
    expect(frame()).toMatchObject({ borderColor: theme.primary, borderStyle: 'solid' });
    screen.getByLabelText('Relancer la caméra');
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data: '3017620422003' });
    act(() => jest.advanceTimersByTime(250));
    fireEvent(screen.getByTestId('barcode-camera-view'), 'barcodeScanned', { ...geometry, data: '3017620422003' });
    expect(frame()).toMatchObject({ borderColor: theme.muted, borderStyle: 'dashed' });
    act(() => jest.advanceTimersByTime(1499));
    screen.getByText('Patiente un instant…');
    act(() => jest.advanceTimersByTime(1));
    expect(frame()).toMatchObject({ borderColor: theme.primary, borderStyle: 'solid' });
    screen.getByText('Prêt à scanner');
    screen.unmount();
  } finally { jest.useRealTimers(); }
});
