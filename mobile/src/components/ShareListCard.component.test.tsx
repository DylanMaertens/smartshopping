import React from 'react';
import { AppState, Share } from 'react-native';
import { InvitationSession } from '@/services/api/invitationSession';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ShareListCard } from './ShareListCard';
import { createListInvitation, getListMembers, joinListInvitation, revokeListInvitation, removeListMember } from '@/services/api/backend';
import { getMemberAliases, saveMemberAlias } from '@/services/storage/memberAliases';
const mockAliases = new Map<string, Record<string, string>>();
jest.mock('@/services/storage/memberAliases', () => ({
  getMemberAliases: jest.fn((list: string) => ({ ...mockAliases.get(list) })),
  saveMemberAlias: jest.fn((list: string, id: string, name: string) => {
    const result = { ...mockAliases.get(list) };
    if (name.trim()) result[id] = name.trim(); else delete result[id];
    mockAliases.set(list, result); return result;
  }),
}));
jest.mock('react-native-qrcode-svg', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/identity/deviceIdentity', () => ({ getAnonymousDeviceId: async () => 'owner' }));
jest.mock('@/services/api/backend', () => ({
  BackendApiError: class extends Error {}, createListInvitation: jest.fn(), getListMembers: jest.fn(), removeListMember: jest.fn(), joinListInvitation: jest.fn(), revokeListInvitation: jest.fn(),
}));
const invitation = 'a'.repeat(32);
it('moves generic instructions out of the card while keeping status, errors and invitation details', async () => {
  const screen = render(<ShareListCard showInstructions={false} listId="a" onBeforeInvite={async () => true} />);
  await act(async () => {});
  expect(screen.queryByText('Le partage reste facultatif et anonyme.')).toBeNull();
  expect(screen.queryByText(/Révoquer un code bloque/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  screen.getByText(invitation);
  screen.getByText(/Valable jusqu’au/);
  screen.getByText('Transmets ce code uniquement à une personne de confiance.');
  jest.mocked(revokeListInvitation).mockRejectedValueOnce(new Error('offline'));
  await act(async () => fireEvent.press(screen.getByText('Révoquer ce code')));
  screen.getByText('Partage indisponible.');
  screen.getByText(invitation);
});
it('notifies the parent only after the server has created a usable invitation', async () => {
  const created = jest.fn();
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} onInvitationCreated={created} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(created).toHaveBeenCalledTimes(1);
});
it('does not reactivate sharing when invitation creation fails', async () => {
  jest.mocked(createListInvitation).mockRejectedValueOnce(new Error('network'));
  const created = jest.fn();
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} onInvitationCreated={created} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(created).not.toHaveBeenCalled();
});
it('shares the Poduna name with the backwards-compatible invitation scheme', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(screen.getByText('Partager avec une application')));
  expect(share).toHaveBeenCalledWith({
    message: `Rejoins ma liste Poduna : smartshopping://invite/${invitation}\nCode : ${invitation}`,
    url: `smartshopping://invite/${invitation}`,
  });
  share.mockRestore();
});
beforeEach(() => {
  mockAliases.clear();
  jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  jest.mocked(revokeListInvitation).mockResolvedValue({ revoked: true });
  jest.mocked(joinListInvitation).mockResolvedValue({ list_id: 'shared' });
  jest.mocked(createListInvitation).mockResolvedValue({ code: invitation, list_id: 'a', expires_at: Date.now() + 86_400_000 });
  jest.mocked(getListMembers).mockResolvedValue([{ device_id: 'member-a', role: 'editor', joined_at: 1 }]);
});

it('renames a member privately and keeps the server identity for removal', async () => {
  let screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} />);
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  fireEvent.press(screen.getByLabelText('Renommer Membre 1'));
  fireEvent.changeText(screen.getByLabelText('Nom du membre'), 'Camille');
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  screen.getByText('Camille');
  expect(saveMemberAlias).toHaveBeenCalledWith('a', 'member-a', 'Camille');
  screen.unmount();
  screen = render(<ShareListCard listId="a" canCreateInvitation={false} onBeforeInvite={async () => true} />);
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  screen.getByText('Camille');
  await act(async () => fireEvent.press(screen.getByText('Retirer')));
  expect(removeListMember).toHaveBeenCalledWith('owner', 'a', 'member-a');
});

it('keeps the rename editor on storage failure and cancellation does not write', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} />);
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  fireEvent.press(screen.getByLabelText('Renommer Membre 1'));
  fireEvent.changeText(screen.getByLabelText('Nom du membre'), 'Camille');
  jest.mocked(saveMemberAlias).mockImplementationOnce(() => { throw new Error('disk'); });
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  screen.getByText('Impossible d’enregistrer ce nom. Réessaie.');
  expect(screen.getByLabelText('Nom du membre').props.value).toBe('Camille');
  fireEvent.press(screen.getByText('Annuler'));
  expect(saveMemberAlias).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Camille')).toBeNull();
});

it('blocks new invitation creation in free mode without blocking member management', async () => {
  const before = jest.fn(async () => true);
  const screen = render(<ShareListCard canCreateInvitation={false} listId="a" onBeforeInvite={before} />);
  await act(async () => {});
  expect(screen.getByText('Créer un code · Premium')).toBeDisabled();
  fireEvent.press(screen.getByText('Créer un code · Premium'));
  expect(before).not.toHaveBeenCalled();
  expect(createListInvitation).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  screen.getByText('Retirer');
});

it('rechecks premium after an asynchronous preparation, before creating the invitation', async () => {
  let finish!: (value: boolean) => void;
  const before = jest.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const screen = render(<ShareListCard listId="a" onBeforeInvite={before} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  screen.rerender(<ShareListCard listId="a" onBeforeInvite={before} canCreateInvitation={false} />);
  await act(async () => finish(true));
  expect(createListInvitation).not.toHaveBeenCalled();
  screen.getByText('Création annulée : le mode premium n’est plus actif.');
});

it('keeps an existing invitation usable after returning to free mode', async () => {
  const before = jest.fn(async () => true);
  const screen = render(<ShareListCard listId="a" onBeforeInvite={before} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  screen.rerender(<ShareListCard listId="a" onBeforeInvite={before} canCreateInvitation={false} />);
  screen.getByText(invitation);
  screen.getByText('Partager avec une application');
  await act(async () => fireEvent.press(screen.getByText('Révoquer ce code')));
  expect(screen.getByText('Créer un code · Premium')).toBeDisabled();
});
it('clears invitation and members when selecting another list', async () => {
  const callbacks = { onBeforeInvite: jest.fn(async () => true) };
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
  const callbacks = { onBeforeInvite: jest.fn(async () => true) };
  const screen = render(<ShareListCard listId="a" {...callbacks} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  screen.rerender(<ShareListCard listId="b" {...callbacks} />);
  await act(async () => resolve({ code: invitation, list_id: 'a', expires_at: Date.now() + 86_400_000 }));
  expect(screen.queryByText(invitation)).toBeNull();
});
it('starts only one invitation for two presses in the same render', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} />);
  await act(async () => {
    fireEvent.press(screen.getByText('Créer un code d’invitation'));
    fireEvent.press(screen.getByText('Créer un code d’invitation'));
  });
  expect(createListInvitation).toHaveBeenCalledTimes(1);
});
it('waits for successful synchronization before creating an invitation', async () => {
  let finish!: (value: boolean) => void;
  const before = jest.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
  const screen = render(<ShareListCard listId="a" onBeforeInvite={before} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(createListInvitation).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(createListInvitation).toHaveBeenCalledWith('owner', 'a');
});
it('does not create an invitation when synchronization fails', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => false} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(createListInvitation).not.toHaveBeenCalled();
  screen.getByText('Connexion nécessaire pour préparer le partage. Tes articles restent enregistrés.');
});





it('never exposes list deletion in sharing, after invitation creation or member management', async () => {
  const screen = render(<ShareListCard listId="a" onBeforeInvite={async () => true} />);
  expect(screen.queryByText('Supprimer définitivement')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  expect(screen.queryByText('Supprimer définitivement')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  expect(screen.queryByText('Supprimer définitivement')).toBeNull();
  screen.getByText('Retirer');
});



const callbacks = { onBeforeInvite: async () => true };

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
  const changed = jest.fn();
  const screen = render(<ShareListCard listId="a" {...callbacks} onSharingChanged={changed} />);
  await act(async () => fireEvent.press(screen.getByText('Créer un code d’invitation')));
  await act(async () => fireEvent.press(screen.getByText('Gérer les membres')));
  await act(async () => fireEvent.press(screen.getByText('Retirer')));
  expect(removeListMember).toHaveBeenCalledWith('owner', 'a', 'member-a');
  expect(screen.queryByText('member-a')).toBeNull();
  expect(screen.queryByText(invitation)).toBeNull();
  screen.getByText('Créer un code d’invitation');
  expect(changed).toHaveBeenCalledTimes(1);
  screen.getByText('Synchronisation coupée pour ce membre. Sa copie locale reste sur son appareil.');
});
