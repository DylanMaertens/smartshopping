import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { OcrContributionSettings } from './OcrContributionSettings';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { readOcrContributionPreview, OCR_CONTRIBUTION_PREVIEW_KEY } from '@/services/storage/ocrContributionSettings';
const mockDisk = new Map<string, string>();
jest.mock('@/services/storage/localKeyValueStorage', () => ({ LocalKeyValueStorage: {
  getString: jest.fn((key: string) => mockDisk.get(key) ?? null),
  setString: jest.fn((key: string, value: string) => { mockDisk.set(key, value); }),
} }));
beforeEach(() => { mockDisk.clear(); jest.clearAllMocks(); });
it('defaults off, requires an explicit acknowledgement, persists only the preview option and can be disabled', () => {
  let screen = render(<OcrContributionSettings />);
  expect(screen.getByLabelText('Aperçus de contribution OCR').props.value).toBe(false);
  fireEvent(screen.getByLabelText('Aperçus de contribution OCR'), 'valueChange', true);
  expect(readOcrContributionPreview()).toBe(false);
  fireEvent.press(screen.getByText('Pas maintenant'));
  expect(readOcrContributionPreview()).toBe(false);
  fireEvent(screen.getByLabelText('Aperçus de contribution OCR'), 'valueChange', true);
  fireEvent.press(screen.getByText('Activer les aperçus uniquement'));
  expect([...mockDisk.entries()]).toEqual([[OCR_CONTRIBUTION_PREVIEW_KEY, 'true']]);
  screen.unmount(); screen = render(<OcrContributionSettings />);
  expect(screen.getByLabelText('Aperçus de contribution OCR').props.value).toBe(true);
  fireEvent(screen.getByLabelText('Aperçus de contribution OCR'), 'valueChange', false);
  expect(readOcrContributionPreview()).toBe(false);
});
it('fails closed on read errors and does not enable the option when saving fails', () => {
  jest.mocked(LocalKeyValueStorage.getString).mockImplementationOnce(() => { throw new Error('disk'); });
  expect(readOcrContributionPreview()).toBe(false);
  const screen = render(<OcrContributionSettings />);
  fireEvent(screen.getByLabelText('Aperçus de contribution OCR'), 'valueChange', true);
  jest.mocked(LocalKeyValueStorage.setString).mockImplementationOnce(() => { throw new Error('disk'); });
  fireEvent.press(screen.getByText('Activer les aperçus uniquement'));
  screen.getByText('Impossible d’enregistrer ce choix. Réessaie.');
  expect(readOcrContributionPreview()).toBe(false);
});
