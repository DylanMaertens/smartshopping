import React from 'react';
import { AppState } from 'react-native';
import { InvitationSession } from '@/services/api/invitationSession';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ShareListCard } from './ShareListCard';
import { createListInvitation, getListMembers, joinListInvitation, revokeListInvitation, removeListMember } from '@/services/api/backend';
jest.mock('react-native-qrcode-svg', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'owner' }));
jest.mock('@/services/api/backend', () => ({
  BackendApiError: class extends Error {}, createListInvitation: jest.fn(), getListMembers: jest.fn(), removeListMember: jest.fn(), joinListInvitation: jest.fn(), revokeListInvitation: jest.fn(),
}));
const invitation = 'a'.repeat(32);
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.mocked(revokeListInvitation).mockResolvedValue({ revoked: true });
  jest.mocked(joinListInvitation).mockResolvedValue({ list_id: 'shared' });
  jest.mocked(createListInvitation).mockResolvedValue({ code: invitation, list_id: 'a', expires_at: Date.now() + 86_400_000 });
  jest.mocked(getListMembers).mockResolvedValue([{ device_id: 'member-a', role: 'editor', joined_at: 1 }]);
});
it('clears invitation and members when selecting another list', async () => {
  const callbacks = { onBeforeInvite: jest.fn(async () => true), onDeleted: jest.fn() };
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  screen.getByText(invitation); screen.getByText('member-a');
  screen.rerender(<ShareListCard listId="b" {...callbacks} />);
  expect(screen.queryByText(invitation)).toBeNull();
  expect(screen.queryByText('member-a')).toBeNull();
});
it('does not display a late invitation on another list', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof createListInvitation>>) => void;
  jest.mocked(createListInvitation).mockReturnValue(new Promise((yes) => { resolve = yes; }));
  const callbacks = { onBeforeInvite: jest.fn(async () => true), onDeleted: jest.fn() };
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  screen.rerender(<ShareListCard listId="b" {...callbacks} />);
  await act(async () => resolve({ code: invitation, list_id: 'a', expires_at: Date.now() + 86_400_000 }));
  expect(screen.queryByText(invitation)).toBeNull();
});
it('starts only one invitation for two presses in the same render', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} onDeleted={jest.fn()} />);
  await act(async () => {
    fireEvent.press(screen.getByText('Créer un code d’invitation'));
    fireEvent.press(screen.getByText('Créer un code d’invitation'));
  });
  expect(createListInvitation).toHaveBeenCalledTimes(1);
});
it('waits for successful synchronization before creating an invitation', async () => {
  let finish!: (value: boolean) => void;
  const before = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const screen = render(<ShareListCard listId="a" onBeforeInvite={before} onDeleted={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(createListInvitation).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(createListInvitation).toHaveBeenCalledWith('owner', 'a');
});
it('does not create an invitation when synchronization fails', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => false} onDeleted={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(createListInvitation).not.toHaveBeenCalled();
  screen.getByText('Connexion nécessaire pour préparer le partage. Tes articles restent enregistrés.');
});





it('only exposes server deletion after owner access has been verified', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} onDeleted={jest.fn()} />);
  expect(screen.queryByText('Supprimer définitivement')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  screen.getByText('Supprimer définitivement');
});



const callbacks = { onBeforeInvite: async () => true, onDeleted: jest.fn() };

it('keeps the same QR after closing and reopening without creating another invitation', async () => {
  const session = new InvitationSession();
  const first = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(first.getByText('Créer un code d’invitation')));
  first.unmount();
  const reopened = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => {});
  reopened.getByText(invitation);
  reopened.getByText(/Valable jusqu’au/);
  expect(reopened.queryByText('Créer un code d’invitation')).toBeNull();
  expect(createListInvitation).toHaveBeenCalledTimes(1);
});

it('preserves an in-flight creation across closing and reopening the panel', async () => {
  let finish!: (value: Awaited<ReturnType<typeof createListInvitation>>) => void;
  jest.mocked(createListInvitation).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const session = new InvitationSession();
  const first = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(first.getByText('Créer un code d’invitation')));
  first.unmount();
  const reopened = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => {});
  fireEvent.press(reopened.getByText('Préparation du code…'));
  expect(createListInvitation).toHaveBeenCalledTimes(1);
  await act(async () => finish({ code: invitation, list_id: 'a', expires_at: Date.now() + 60_000 }));
  reopened.getByText(invitation);
});

it('hides an expired QR and permits a new invitation while the panel remains open', async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(createListInvitation).mockResolvedValueOnce({ code: invitation, list_id: 'a', expires_at: Date.now() + 1_000 });
    const screen = render(<ShareListCard listId="a" {...callbacks} />);
    await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
    screen.getByText(invitation);
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.queryByText(invitation)).toBeNull();
    screen.getByText('Ce code a expiré. Crée une nouvelle invitation.');
    await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
    expect(createListInvitation).toHaveBeenCalledTimes(2);
    screen.getByText(invitation);
    screen.unmount();
  } finally { jest.useRealTimers(); }
});

it('checks expiry after returning from the background even if the timer did not run', async () => {
  jest.useFakeTimers();
  const listener = jest.spyOn(AppState, 'addEventListener');
  try {
    jest.mocked(createListInvitation).mockResolvedValueOnce({ code: invitation, list_id: 'a', expires_at: Date.now() + 1_000 });
    const screen = render(<ShareListCard listId="a" {...callbacks} />);
    await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
    jest.setSystemTime(Date.now() + 2_000);
    const receive = listener.mock.calls[listener.mock.calls.length - 1][1];
    act(() => receive('active'));
    expect(screen.queryByText(invitation)).toBeNull();
    screen.getByText('Créer un code d’invitation');
    screen.unmount();
  } finally { listener.mockRestore(); jest.useRealTimers(); }
});

it('keeps a code after a failed revocation and removes it only after successful retry', async () => {
  const session = new InvitationSession();
  jest.mocked(revokeListInvitation).mockRejectedValueOnce(new Error('offline'));
  const screen = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(screen.getByText('Révoquer ce code')));
  screen.getByText(invitation);
  screen.getByText('Partage indisponible.');
  await act(async () => fireEvent.press(screen.getByText('Révoquer ce code')));
  expect(screen.queryByText(invitation)).toBeNull();
  expect(revokeListInvitation).toHaveBeenLastCalledWith('owner', invitation);
  screen.unmount();
  const reopened = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => {});
  expect(reopened.queryByText(invitation)).toBeNull();
  reopened.getByText('Créer un code d’invitation');
});


it('finishes revocation in the shared session even if the panel was closed', async () => {
  let finish!: (value: { revoked: boolean }) => void;
  jest.mocked(revokeListInvitation).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const session = new InvitationSession();
  const first = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(first.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(first.getByText('Révoquer ce code')));
  first.unmount();
  const reopened = render(<ShareListCard session={session} listId="a" {...callbacks} />);
  await act(async () => {});
  fireEvent.press(reopened.getByText('Révoquer ce code'));
  expect(revokeListInvitation).toHaveBeenCalledTimes(1);
  await act(async () => finish({ revoked: true }));
  expect(reopened.queryByText(invitation)).toBeNull();
  reopened.getByText('Créer un code d’invitation');
});

it('shows only sharing controls, without joining or scanning an invitation', async () => {
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => {});
  screen.getByText('Créer un code d’invitation');
  expect(screen.queryByTestId('invitation-code-input')).toBeNull();
  expect(screen.queryByText('Rejoindre')).toBeNull();
  expect(screen.queryByText('Scanner une invitation')).toBeNull();
});

it('explains that revoking a code keeps existing members synchronized', async () => {
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(screen.getByText('Révoquer ce code')));
  screen.getByText('Invitation révoquée. Les membres déjà présents restent synchronisés.');
  expect(removeListMember).not.toHaveBeenCalled();
});

it('describes member removal as disconnecting the retained local copy', async () => {
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  await act(async () => fireEvent.press(screen.getByText('Retirer')));
  expect(removeListMember).toHaveBeenCalledWith('owner', 'a', 'member-a');
  expect(screen.queryByText('member-a')).toBeNull();
  screen.getByText('Synchronisation coupée pour ce membre. Sa copie locale reste sur son appareil.');
});
