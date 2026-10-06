import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CommunityReportForm } from './CommunityReportForm';
import { BackendApiError, reportCommunityProposal } from '@/services/api/backend';

jest.mock('@/services/api/backend', () => ({
  reportCommunityProposal: jest.fn(),
  BackendApiError: class extends Error {
    status: number;
    requestId: string;
    constructor(message: string, status: number, requestId: string) { super(message); this.status = status; this.requestId = requestId; }
  },
}));
const suggestion = { proposal_id: 'proposal-1', field: 'category' as const, value: 'Boissons', confirmations: 1, agreement_ratio: 1 };
beforeEach(() => { jest.resetAllMocks(); });

it('requires an explicit reason and can cancel without sending', () => {
  const onClose = jest.fn();
  const screen = render(<CommunityReportForm suggestion={suggestion} onClose={onClose} />);
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  expect(reportCommunityProposal).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Annuler'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('blocks repeated submissions while sending and confirms only after acknowledgment', async () => {
  let resolve!: () => void;
  jest.mocked(reportCommunityProposal).mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const screen = render(<CommunityReportForm suggestion={suggestion} onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Rayon incorrect'));
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  fireEvent.press(screen.getByText('Envoi en cours…'));
  expect(reportCommunityProposal).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Terminer')).toBeNull();
  await act(async () => { resolve(); });
  screen.getByText('Signalement enregistré pour examen. Aucune suppression ni sanction automatique.');
  expect(screen.queryByText('Envoyer le signalement')).toBeNull();
});

it.each([
  [new Error('offline'), 'Le signalement n’a pas pu être confirmé. Vérifie ta connexion puis réessaie.'],
  [new BackendApiError('quota', 429, 'req'), 'Trop de demandes. Réessaie plus tard.'],
  [new BackendApiError('missing', 404, 'req'), 'Cette proposition n’est plus disponible pour un signalement.'],
])('keeps the reason after failure and allows retry: %s', async (failure, message) => {
  jest.mocked(reportCommunityProposal).mockRejectedValueOnce(failure).mockResolvedValueOnce(undefined);
  const screen = render(<CommunityReportForm suggestion={suggestion} onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Publicité ou spam'));
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  await waitFor(() => screen.getByText(message as string));
  expect(screen.getByLabelText('Publicité ou spam').props.accessibilityState.checked).toBe(true);
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  await waitFor(() => screen.getByText('Terminer'));
  expect(reportCommunityProposal).toHaveBeenNthCalledWith(2, 'proposal-1', 'spam');
});

it('ignores a late completion after closing the form', async () => {
  let resolve!: () => void;
  jest.mocked(reportCommunityProposal).mockReturnValue(new Promise<void>((done) => { resolve = done; }));
  const screen = render(<CommunityReportForm suggestion={suggestion} onClose={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Mauvais produit'));
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  screen.unmount();
  await act(async () => { resolve(); });
  expect(reportCommunityProposal).toHaveBeenCalledTimes(1);
});
