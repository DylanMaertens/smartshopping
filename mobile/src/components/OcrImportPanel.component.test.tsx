import React from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { OcrImportPanel } from './OcrImportPanel';
import { recognizeListPhoto } from '@/services/api/backend';
jest.mock('@/services/api/backend', () => ({ recognizeListPhoto: jest.fn(), BackendApiError: class extends Error {} }));
jest.mock('./BarcodeScannerPanel', () => {
  const React = require('react');
  const { Text, Pressable } = require('react-native');
  return { BarcodeScannerPanel: ({ onPhotographed }: { onPhotographed: (image: string) => void }) =>
    <Pressable onPress={() => onPhotographed('image-data')}><Text>Photo test</Text></Pressable> };
});
beforeEach(() => jest.mocked(recognizeListPhoto).mockReset().mockResolvedValue({ text: 'Pain\n2 x lait' }));
it('discards the photo, corrected draft and correction choices on explicit cancellation', async () => {
  jest.mocked(recognizeListPhoto).mockResolvedValue({ text: 'Litiéne\nwwhisky' });
  const onImport = jest.fn(), onCancel = jest.fn();
  const screen = render(<OcrImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  fireEvent.press(screen.getByLabelText('Conserver le mot Litiéne'));
  fireEvent.press(screen.getByLabelText('Remplacer wwhisky par whisky'));
  fireEvent.press(screen.getByText('Annuler'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  screen.rerender(<OcrImportPanel embedded active={false} onImport={onImport} onCancel={onCancel} />);
  screen.rerender(<OcrImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  screen.getByText('Photo test');
  expect(screen.queryByLabelText('Articles reconnus')).toBeNull();
  expect(screen.queryByLabelText('Photo de la liste à relire')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('Litiéne\nwwhisky');
  screen.getByLabelText('Remplacer Litiéne par Litière');
  expect(screen.queryByText('Annuler la dernière correction')).toBeNull();
  expect(onImport).not.toHaveBeenCalled();
});
it.each(['success', 'failure'] as const)('ignores a cancelled recognition’s late %s while a new photo is being read', async (outcome) => {
  let finishOld!: (result: { text: string }) => void;
  let failOld!: (error: Error) => void;
  let finishNew!: (result: { text: string }) => void;
  jest.mocked(recognizeListPhoto)
    .mockReturnValueOnce(new Promise((resolve, reject) => { finishOld = resolve; failOld = reject; }))
    .mockReturnValueOnce(new Promise((resolve) => { finishNew = resolve; }));
  const onImport = jest.fn();
  const screen = render(<OcrImportPanel embedded onImport={onImport} onCancel={jest.fn()} />);
  fireEvent.press(screen.getByText('Photo test'));
  fireEvent.press(screen.getByText('Annuler'));
  fireEvent.press(screen.getByText('Photo test'));
  await act(async () => {
    if (outcome === 'success') finishOld({ text: 'Ancienne photo' });
    else failOld(new Error('offline'));
  });
  screen.getByLabelText('Reconnaissance en cours');
  expect(screen.queryByLabelText('Articles reconnus')).toBeNull();
  await act(async () => finishNew({ text: 'Nouvelle photo' }));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('Nouvelle photo');
  expect(screen.queryByText(/Reconnaissance impossible/)).toBeNull();
  expect(onImport).not.toHaveBeenCalled();
});
it('stops showing the camera in another mode and preserves the corrected review', async () => {
  const onImport = jest.fn(), onCancel = jest.fn();
  const screen = render(<OcrImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  screen.getByText('Photo test');
  screen.rerender(<OcrImportPanel embedded active={false} onImport={onImport} onCancel={onCancel} />);
  expect(screen.queryByText('Photo test')).toBeNull();
  screen.rerender(<OcrImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  fireEvent.changeText(screen.getByLabelText('Articles reconnus'), '4 x Pain');
  screen.rerender(<OcrImportPanel embedded active={false} onImport={onImport} onCancel={onCancel} />);
  expect(screen.queryByLabelText('Articles reconnus')).toBeNull();
  screen.rerender(<OcrImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('4 x Pain');
  expect(onImport).not.toHaveBeenCalled();
});
it('cleans decoration and applies spelling suggestions only on explicit acceptance', async () => {
  jest.mocked(recognizeListPhoto).mockResolvedValue({ text: '☑ 2 x lalt ★\n→ Tomtaes' });
  const onImport = jest.fn();
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={onImport} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('2 x lalt\nTomtaes');
  screen.getByText('Masquer les suggestions');
  expect(onImport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('2 x lalt\nTomtaes');
  fireEvent.press(screen.getByLabelText('Remplacer lalt par lait'));
  fireEvent.press(screen.getByText(/Ajouter les \d+ lignes/));
  expect(onImport).toHaveBeenCalledWith([{ name: 'Lait', quantity: 2 }, { name: 'Tomtaes', quantity: 1 }]);
});
it('keeps a bounded scrolling editor and hides the photo while the keyboard is open', async () => {
  const callbacks = new Map<string, () => void>();
  const listener = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
    callbacks.set(event, callback as () => void); return { remove: jest.fn() } as unknown as ReturnType<typeof Keyboard.addListener>;
  });
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  act(() => callbacks.get('keyboardDidShow')!());
  expect(screen.queryByLabelText('Photo de la liste à relire')).toBeNull();
  const editor = screen.getByLabelText('Articles reconnus');
  expect(editor.props.scrollEnabled).toBe(true);
  expect(StyleSheet.flatten(editor.props.style).height).toBe(150);
  act(() => callbacks.get('keyboardDidHide')!());
  screen.getByLabelText('Photo de la liste à relire');
  screen.unmount(); listener.mockRestore();
});
it('requires review before adding and imports corrected lines only once', async () => {
  const onImport = jest.fn();
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={onImport} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  expect(onImport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Photo de la liste à relire').props.source.uri).toBe('data:image/jpeg;base64,image-data');
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('Pain\n2 x lait');
  fireEvent.changeText(screen.getByLabelText('Articles reconnus'), 'Pain complet\n3 x lait');
  const button = screen.getByText(/Ajouter les \d+ lignes/);
  act(() => { fireEvent.press(button); fireEvent.press(button); });
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(onImport).toHaveBeenCalledWith([{ name: 'Pain complet', quantity: 1 }, { name: 'Lait', quantity: 3 }]);
});
it('keeps the review editable when importing would exceed an existing quantity', async () => {
  const onImport = jest.fn().mockImplementationOnce(() => { throw new Error('Quantité dépassée'); });
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={onImport} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  fireEvent.press(screen.getByText(/Ajouter les \d+ lignes/));
  screen.getByText('Quantité dépassée');
  fireEvent.changeText(screen.getByLabelText('Articles reconnus'), 'Pain');
  fireEvent.press(screen.getByText(/Ajouter les \d+ lignes/));
  expect(onImport).toHaveBeenCalledTimes(2);
});
it('does not add anything on failed recognition or cancellation', async () => {
  jest.mocked(recognizeListPhoto).mockRejectedValue(new Error('offline'));
  const onImport = jest.fn(), onCancel = jest.fn();
  const screen = render(<OcrImportPanel onCancel={onCancel} onImport={onImport} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  screen.getByText(/Reconnaissance impossible/);
  fireEvent.press(screen.getByText(/Ajouter les \d+ lignes/));
  fireEvent.press(screen.getByText('Annuler'));
  expect(onImport).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
it('ignores recognition completing after the screen closes', async () => {
  let finish!: (result: { text: string }) => void;
  jest.mocked(recognizeListPhoto).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const onImport = jest.fn();
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={onImport} />);
  fireEvent.press(screen.getByText('Photo test'));
  screen.getByLabelText('Reconnaissance en cours');
  screen.unmount();
  await act(async () => finish({ text: 'Pain' }));
  expect(onImport).not.toHaveBeenCalled();
});

it('offers corrections immediately, batches only probable ones and can undo the whole batch', async () => {
  const original = "2 x Litiéne\nwwhisky\nYacan'ts\nResd\nSanex";
  jest.mocked(recognizeListPhoto).mockResolvedValue({ text: original });
  const onImport = jest.fn();
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={onImport} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  screen.getByLabelText('Remplacer Yacan\'ts par Yaourts');
  fireEvent.press(screen.getByText('Appliquer les 2 corrections probables'));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe("2 x Litière\nwhisky\nYacan'ts\nResd\nSanex");
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Annuler la dernière correction'));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe(original);
  fireEvent.press(screen.getByLabelText('Remplacer Resd par Rosé'));
  expect(screen.getByLabelText('Articles reconnus').props.value).toContain('\nRosé\n');
  fireEvent.press(screen.getByText('Annuler la dernière correction'));
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe(original);
});

it('never undoes manual edits and respects names already on the shopping list', async () => {
  jest.mocked(recognizeListPhoto).mockResolvedValue({ text: 'Lumix\nwwhisky' });
  const screen = render(<OcrImportPanel knownNames={['Lumix']} onCancel={jest.fn()} onImport={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  expect(screen.queryByLabelText('Conserver le mot Lumix')).toBeNull();
  fireEvent.press(screen.getByLabelText('Remplacer wwhisky par whisky'));
  fireEvent.changeText(screen.getByLabelText('Articles reconnus'), '3 x whisky');
  expect(screen.queryByText('Annuler la dernière correction')).toBeNull();
  expect(screen.getByLabelText('Articles reconnus').props.value).toBe('3 x whisky');
});

it('can keep an unfamiliar name and resets choices and undo on a new photo', async () => {
  jest.mocked(recognizeListPhoto).mockResolvedValue({ text: 'Litiéne\nwwhisky' });
  const screen = render(<OcrImportPanel onCancel={jest.fn()} onImport={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  fireEvent.press(screen.getByLabelText('Conserver le mot Litiéne'));
  fireEvent.press(screen.getByLabelText('Remplacer wwhisky par whisky'));
  expect(screen.queryByLabelText('Remplacer Litiéne par Litière')).toBeNull();
  fireEvent.press(screen.getByText('Reprendre une photo'));
  await act(async () => fireEvent.press(screen.getByText('Photo test')));
  screen.getByLabelText('Remplacer Litiéne par Litière');
  expect(screen.queryByText('Annuler la dernière correction')).toBeNull();
});
