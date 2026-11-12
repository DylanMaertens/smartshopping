import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { PremiumProvider, PREMIUM_SIMULATION_KEY } from './PremiumProvider';
import { ThemeProvider, THEME_STORAGE_KEY } from '@/theme/ThemeProvider';
import { PremiumPanel } from '@/components/PremiumPanel';
import { AppearancePicker } from '@/components/AppearancePicker';
import { LocalKeyValueStorage } from '@/services/storage/localKeyValueStorage';

let mockChannel = 'preview';
const mockDisk = new Map<string, string>();
jest.mock('expo-constants', () => ({ __esModule: true, default: { get expoConfig() { return { extra: { distributionChannel: mockChannel } }; } } }));
jest.mock('@/services/storage/localKeyValueStorage', () => ({ LocalKeyValueStorage: {
  getString: (key: string) => mockDisk.get(key) ?? null,
  setString: jest.fn((key: string, value: string) => { mockDisk.set(key, value); }),
} }));
jest.mock('@/services/storage/personalSettings', () => ({ THEME_STORAGE_KEY: 'appearance.theme.v1', PersonalSettings: {
  getString: (key: string) => mockDisk.get(key) ?? null,
  setString: (key: string, value: string) => { mockDisk.set(key, value); },
} }));
const app = () => <PremiumProvider><ThemeProvider><PremiumPanel /><AppearancePicker /></ThemeProvider></PremiumProvider>;
beforeEach(() => { mockDisk.clear(); mockChannel = 'preview'; });

it('starts free, gates themes, persists simulation and preserves the paid theme on downgrade', () => {
  let screen = render(app());
  fireEvent.press(screen.getByLabelText('Papier'));
  screen.getByText(/Ce thème fait partie du premium/);
  expect(mockDisk.has(THEME_STORAGE_KEY)).toBe(false);
  fireEvent(screen.getByLabelText('Mode premium (test)'), 'valueChange', true);
  fireEvent.press(screen.getByLabelText('Papier'));
  expect(screen.getByLabelText('Papier').props.accessibilityState.checked).toBe(true);
  fireEvent(screen.getByLabelText('Mode premium (test)'), 'valueChange', false);
  expect(screen.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  expect(mockDisk.get(THEME_STORAGE_KEY)).toBe('papier');
  fireEvent(screen.getByLabelText('Mode premium (test)'), 'valueChange', true);
  expect(screen.getByLabelText('Papier').props.accessibilityState.checked).toBe(true);
  screen.unmount(); screen = render(app());
  expect(screen.getByLabelText('Mode premium (test)').props.value).toBe(true);
  expect(screen.getByLabelText('Papier').props.accessibilityState.checked).toBe(true);
});

it.each(['direct', 'store'])('ignores stored simulated rights in %s distributions', channel => {
  mockChannel = channel;
  mockDisk.set(PREMIUM_SIMULATION_KEY, 'true'); mockDisk.set(THEME_STORAGE_KEY, 'pixel');
  const screen = render(app());
  expect(screen.queryByLabelText('Mode premium (test)')).toBeNull();
  expect(screen.getByLabelText('Origine').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByLabelText('Pixel'));
  screen.getByText('Ce thème fait partie du premium. Les achats ne sont pas encore disponibles.');
});

it('does not grant simulated rights when persistence fails', () => {
  const screen = render(app());
  jest.mocked(LocalKeyValueStorage.setString).mockImplementationOnce(() => { throw new Error('disk'); });
  fireEvent(screen.getByLabelText('Mode premium (test)'), 'valueChange', true);
  screen.getByText('Impossible d’enregistrer le mode de test. Réessaie.');
  expect(screen.getByLabelText('Mode premium (test)').props.value).toBe(false);
});
