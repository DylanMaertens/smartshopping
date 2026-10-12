import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { VoiceImportPanel } from './VoiceImportPanel';
import { localSpeech } from '@/services/localSpeech';

jest.mock('@/services/localSpeech', () => ({
  localSpeech: { isAvailable: jest.fn(), requestPermission: jest.fn(), recognize: jest.fn(), stop: jest.fn(), cancel: jest.fn() },
  speechErrorMessage: (error: { code?: string }) => `Erreur ${error.code ?? 'inconnue'}`,
}));
const speech = jest.mocked(localSpeech);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  speech.isAvailable.mockResolvedValue(true);
  speech.requestPermission.mockResolvedValue(true);
  speech.recognize.mockResolvedValue('deux oranges puis du lait');
  speech.stop.mockResolvedValue(); speech.cancel.mockResolvedValue();
});

async function open() {
  const onImport = jest.fn(), onCancel = jest.fn();
  const screen = render(<VoiceImportPanel onImport={onImport} onCancel={onCancel} />);
  await act(async () => {});
  return { screen, onImport, onCancel };
}

it('never opens the microphone on entry and imports only edited, validated text', async () => {
  const { screen, onImport } = await open();
  expect(speech.requestPermission).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Commencer la dictée')));
  expect(onImport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Articles dictés à vérifier').props.value).toBe('2 x Orange\nLait');
  fireEvent.changeText(screen.getByLabelText('Articles dictés à vérifier'), '3 x Orange\nPain');
  fireEvent.press(screen.getByText('Ajouter les articles à la liste'));
  expect(onImport).toHaveBeenCalledWith([{ name: 'Orange', quantity: 3 }, { name: 'Pain', quantity: 1 }]);
});

it('offers manual entry when unavailable and never requests permission', async () => {
  speech.isAvailable.mockResolvedValue(false);
  const { screen, onCancel } = await open();
  screen.getByText(/La dictée locale n’est pas disponible/);
  expect(screen.queryByText('Commencer la dictée')).toBeNull();
  fireEvent.press(screen.getByText('Retour à l’ajout manuel'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(speech.requestPermission).not.toHaveBeenCalled();
});

it('does not recognize when microphone permission is denied', async () => {
  speech.requestPermission.mockResolvedValue(false);
  const { screen } = await open();
  await act(async () => fireEvent.press(screen.getByText('Commencer la dictée')));
  screen.getByText('Erreur E_PERMISSION');
  expect(speech.recognize).not.toHaveBeenCalled();
});

it('stops listening, then waits for the final text without starting a second session', async () => {
  const request = deferred<string>(); speech.recognize.mockReturnValue(request.promise);
  const { screen, onImport } = await open();
  await act(async () => {
    fireEvent.press(screen.getByText('Commencer la dictée'));
    fireEvent.press(screen.getByText('Commencer la dictée'));
  });
  expect(speech.recognize).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByText('Terminer la dictée')));
  expect(speech.stop).toHaveBeenCalledTimes(1);
  expect(onImport).not.toHaveBeenCalled();
  await act(async () => request.resolve('du lait'));
  expect(screen.getByLabelText('Articles dictés à vérifier').props.value).toBe('Lait');
});

it('does not start listening if closed during the permission prompt', async () => {
  const permission = deferred<boolean>(); speech.requestPermission.mockReturnValue(permission.promise);
  const { screen } = await open();
  fireEvent.press(screen.getByText('Commencer la dictée'));
  screen.unmount();
  await act(async () => permission.resolve(true));
  expect(speech.recognize).not.toHaveBeenCalled();
  expect(speech.cancel).toHaveBeenCalled();
});

it('discards late recognition after backgrounding', async () => {
  let background!: (state: AppStateStatus) => void;
  const listener = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    background = handler; return { remove: jest.fn() };
  });
  try {
    const request = deferred<string>(); speech.recognize.mockReturnValue(request.promise);
    const { screen, onImport } = await open();
    await act(async () => fireEvent.press(screen.getByText('Commencer la dictée')));
    act(() => background('background'));
    await act(async () => request.resolve('du lait'));
    expect(screen.queryByLabelText('Articles dictés à vérifier')).toBeNull();
    expect(onImport).not.toHaveBeenCalled();
    expect(speech.cancel).toHaveBeenCalled();
  } finally { listener.mockRestore(); }
});

it('retains a corrected draft after a failed retry and allows retrying a failed list write', async () => {
  const { screen, onImport } = await open();
  await act(async () => fireEvent.press(screen.getByText('Commencer la dictée')));
  fireEvent.changeText(screen.getByLabelText('Articles dictés à vérifier'), 'Pain');
  speech.recognize.mockRejectedValue({ code: 'E_LANGUAGE' });
  await act(async () => fireEvent.press(screen.getByText('Recommencer la dictée')));
  screen.getByText('Erreur E_LANGUAGE');
  expect(screen.getByLabelText('Articles dictés à vérifier').props.value).toBe('Pain');
  onImport.mockImplementationOnce(() => { throw new Error('Stockage plein'); });
  fireEvent.press(screen.getByText('Ajouter les articles à la liste'));
  screen.getByText('Stockage plein');
  fireEvent.press(screen.getByText('Ajouter les articles à la liste'));
  expect(onImport).toHaveBeenCalledTimes(2);
});

it('keeps a reviewed draft across modes and cancels late speech in embedded mode', async () => {
  const onImport = jest.fn(), onCancel = jest.fn();
  const screen = render(<VoiceImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  await act(async () => {});
  await act(async () => fireEvent.press(screen.getByText('Commencer la dictée')));
  fireEvent.changeText(screen.getByLabelText('Articles dictés à vérifier'), '3 x Pain');
  const request = deferred<string>(); speech.recognize.mockReturnValue(request.promise);
  await act(async () => fireEvent.press(screen.getByText('Recommencer la dictée')));
  screen.rerender(<VoiceImportPanel embedded active={false} onImport={onImport} onCancel={onCancel} />);
  expect(screen.queryByTestId('voice-panel')).toBeNull();
  expect(speech.cancel).toHaveBeenCalled();
  await act(async () => request.resolve('du lait'));
  screen.rerender(<VoiceImportPanel embedded onImport={onImport} onCancel={onCancel} />);
  expect(screen.getByLabelText('Articles dictés à vérifier').props.value).toBe('3 x Pain');
  expect(onImport).not.toHaveBeenCalled();
});
