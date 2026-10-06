import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider, THEME_STORAGE_KEY } from './ThemeProvider';
import { AppearancePicker } from '@/components/AppearancePicker';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
jest.mock('@/services/storage/localKeyValueStorage', () => ({ LocalKeyValueStorage: { getString: jest.fn(), setString: jest.fn() } }));
beforeEach(() => { jest.mocked(LocalKeyValueStorage.getString).mockReset().mockReturnValue(null); jest.mocked(LocalKeyValueStorage.setString).mockReset(); });
it('persists the selected theme and restores it after remounting', () => {
  const first = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  fireEvent.press(first.getByLabelText('Papier'));
  expect(first.getByLabelText('Papier').props.accessibilityState.checked).toBe(true);
  expect(LocalKeyValueStorage.setString).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'papier');
  first.unmount();
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('papier');
  const next = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(next.getByLabelText('Papier').props.accessibilityState.checked).toBe(true);
});
it('keeps the previous theme and explains a storage failure', () => {
  jest.mocked(LocalKeyValueStorage.setString).mockImplementation(() => { throw new Error('disk'); });
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  fireEvent.press(screen.getByLabelText('Nuit'));
  expect(screen.getByLabelText('Minimal').props.accessibilityState.checked).toBe(true);
  screen.getByRole('alert');
});
it('recovers invalid saved preferences without blocking startup', () => {
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('missing-theme');
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(screen.getByLabelText('Minimal').props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(6);
});
