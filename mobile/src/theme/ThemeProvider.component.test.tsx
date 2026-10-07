import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider, THEME_STORAGE_KEY } from './ThemeProvider';
import { AppearancePicker } from '@/components/AppearancePicker';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';
import { themeIds, themes } from './themes';
jest.mock('@/services/storage/localKeyValueStorage', () => ({ LocalKeyValueStorage: { getString: jest.fn(), setString: jest.fn() } }));
beforeEach(() => { jest.mocked(LocalKeyValueStorage.getString).mockReset().mockReturnValue(null); jest.mocked(LocalKeyValueStorage.setString).mockReset(); });
it('defaults to Origine without writing over storage', () => {
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(screen.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(7);
  expect(LocalKeyValueStorage.setString).not.toHaveBeenCalled();
});
it.each(themeIds)('preserves the saved theme %s', (id) => {
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue(id);
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(screen.getByLabelText(themes[id].name).props.accessibilityState.checked).toBe(true);
  expect(LocalKeyValueStorage.setString).not.toHaveBeenCalled();
});
it('allows an existing user to select Origine and restores it on restart', () => {
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('minimal');
  const first = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  fireEvent.press(first.getByLabelText('Origine'));
  expect(first.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  expect(LocalKeyValueStorage.setString).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'origine');
  first.unmount();
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('origine');
  const next = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(next.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
});
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
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('minimal');
  jest.mocked(LocalKeyValueStorage.setString).mockImplementation(() => { throw new Error('disk'); });
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  fireEvent.press(screen.getByLabelText('Nuit'));
  expect(screen.getByLabelText('Minimal').props.accessibilityState.checked).toBe(true);
  screen.getByRole('alert');
});
it('recovers invalid saved preferences without blocking startup', () => {
  jest.mocked(LocalKeyValueStorage.getString).mockReturnValue('missing-theme');
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(screen.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByRole('radio')).toHaveLength(7);
  expect(LocalKeyValueStorage.setString).not.toHaveBeenCalled();
});
it('remains usable with Origine when reading storage fails', () => {
  jest.mocked(LocalKeyValueStorage.getString).mockImplementation(() => { throw new Error('disk'); });
  const screen = render(<ThemeProvider><AppearancePicker /></ThemeProvider>);
  expect(screen.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('Nuit'));
  expect(screen.getByLabelText('Nuit').props.accessibilityState.checked).toBe(true);
});
