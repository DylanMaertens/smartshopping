import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { reloadAppAsync } from 'expo';
import { TestServerCard } from './TestServerCard';
import { canConfigureTestServer, verifyAndSaveTestServer } from '@/services/api/testServer';
jest.mock('expo', () => ({ ...jest.requireActual('expo'), reloadAppAsync: jest.fn() }));
jest.mock('@/services/api/testServer', () => ({ canConfigureTestServer: jest.fn(() => true), getTestServerUrl: () => null, verifyAndSaveTestServer: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(canConfigureTestServer).mockReturnValue(true); });
it('saves a validated address once, then reloads the application', async () => {
  jest.mocked(verifyAndSaveTestServer).mockResolvedValue('https://example.org/api/v1');
  const screen = render(<TestServerCard />);
  fireEvent.changeText(screen.getByLabelText('Adresse HTTPS du serveur'), 'https://example.org');
  await act(async () => {
    fireEvent.press(screen.getByText('Connecter et redémarrer'));
    fireEvent.press(screen.getByText('Connecter et redémarrer'));
  });
  expect(verifyAndSaveTestServer).toHaveBeenCalledTimes(1);
  expect(reloadAppAsync).toHaveBeenCalledTimes(1);
});
it('retains the draft and never reloads after a failed connection', async () => {
  jest.mocked(verifyAndSaveTestServer).mockRejectedValue(new Error('Serveur inaccessible.'));
  const screen = render(<TestServerCard />);
  fireEvent.changeText(screen.getByLabelText('Adresse HTTPS du serveur'), 'https://example.org');
  await act(async () => fireEvent.press(screen.getByText('Connecter et redémarrer')));
  screen.getByText('Serveur inaccessible.');
  expect(screen.getByLabelText('Adresse HTTPS du serveur').props.value).toBe('https://example.org');
  expect(reloadAppAsync).not.toHaveBeenCalled();
});
it('is absent from production builds', () => {
  jest.mocked(canConfigureTestServer).mockReturnValue(false);
  expect(render(<TestServerCard />).queryByText('Serveur de test')).toBeNull();
});
