import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { JoinListCard } from './JoinListCard';
import { createListInvitation, getListMembers, joinListInvitation } from '@/services/api/backend';
jest.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'owner' }));
jest.mock('@/services/api/backend', () => ({
  BackendApiError: class extends Error {}, createListInvitation: jest.fn(), getListMembers: jest.fn(), joinListInvitation: jest.fn(),
}));
jest.mock('@/components/BarcodeScannerPanel', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return { BarcodeScannerPanel: ({ mode, onScanned }: { mode: string; onScanned: (value: string) => void }) => (
    <Pressable testID="simulate-invitation" onPress={() => onScanned('smartshopping://invite/' + 'a'.repeat(32))}>
      <Text>{mode}</Text>
    </Pressable>
  ) };
});
const invitation = 'a'.repeat(32);
beforeEach(() => { jest.mocked(joinListInvitation).mockResolvedValue({ list_id: 'shared' }); });
it('opens the QR scanner and joins the scanned list once', async () => {
  const onJoined = jest.fn();
  const screen = render(<JoinListCard onJoined={onJoined} />);
  fireEvent.press(screen.getByText('Scanner une invitation'));
  screen.getByText('invitation');
  const scanner = screen.getByTestId('simulate-invitation');
  await act(async () => { fireEvent.press(scanner); fireEvent.press(scanner); });
  expect(joinListInvitation).toHaveBeenCalledTimes(1);
  expect(joinListInvitation).toHaveBeenCalledWith('owner', invitation);
  expect(onJoined).toHaveBeenCalledWith('shared');
  expect(screen.queryByTestId('invitation-scanner-modal')).toBeNull();
});
it('keeps the scanned code for a manual retry after a failed join', async () => {
  jest.mocked(joinListInvitation).mockRejectedValueOnce(new Error('offline'));
  const onJoined = jest.fn();
  const screen = render(<JoinListCard onJoined={onJoined} />);
  fireEvent.press(screen.getByText('Scanner une invitation'));
  await act(async () => fireEvent.press(screen.getByTestId('simulate-invitation')));
  screen.getByText('Impossible de rejoindre la liste. Réessaie.');
  expect(screen.getByTestId('invitation-code-input').props.value).toBe(invitation);
  expect(onJoined).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Rejoindre')));
  expect(onJoined).toHaveBeenCalledWith('shared');
});
it('closes the invitation scanner with Android back without joining', () => {
  const screen = render(<JoinListCard onJoined={jest.fn()} />);
  fireEvent.press(screen.getByText('Scanner une invitation'));
  fireEvent(screen.getByTestId('invitation-scanner-modal'), 'requestClose');
  expect(screen.queryByTestId('simulate-invitation')).toBeNull();
  expect(joinListInvitation).not.toHaveBeenCalled();
});
it('prefills a link passed by the main navigation without automatically joining', () => {
  const screen = render(<JoinListCard initialCode={invitation} onJoined={jest.fn()} />);
  expect(screen.getByTestId('invitation-code-input').props.value).toBe(invitation);
  expect(joinListInvitation).not.toHaveBeenCalled();
});
it('joins with a pasted invitation without any sharing or member controls', async () => {
  const onJoined = jest.fn();
  const screen = render(<JoinListCard onJoined={onJoined} />);
  expect(screen.queryByText('Créer un code d’invitation')).toBeNull();
  expect(screen.queryByText('Gérer les membres')).toBeNull();
  expect(screen.queryByText('Supprimer définitivement')).toBeNull();
  fireEvent.changeText(screen.getByTestId('invitation-code-input'), 'smartshopping://invite/' + invitation);
  await act(async () => fireEvent.press(screen.getByText('Rejoindre')));
  expect(onJoined).toHaveBeenCalledWith('shared');
  expect(createListInvitation).not.toHaveBeenCalled();
  expect(getListMembers).not.toHaveBeenCalled();
});

it('rejects invalid codes and ignores an in-flight result after closing', async () => {
  let finish!: (value: { list_id: string }) => void;
  jest.mocked(joinListInvitation).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const onJoined = jest.fn();
  const screen = render(<JoinListCard onJoined={onJoined} />);
  fireEvent.changeText(screen.getByTestId('invitation-code-input'), 'invalid');
  await act(async () => fireEvent.press(screen.getByText('Rejoindre')));
  screen.getByText('Code d’invitation invalide.');
  expect(joinListInvitation).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId('invitation-code-input'), invitation);
  await act(async () => fireEvent.press(screen.getByText('Rejoindre')));
  screen.unmount();
  await act(async () => finish({ list_id: 'shared' }));
  expect(onJoined).not.toHaveBeenCalled();
});
