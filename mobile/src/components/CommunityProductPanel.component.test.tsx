import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { CommunityProductPanel } from './CommunityProductPanel';
import { BackendApiError, getValidatedCommunityFields, reportCommunityProposal } from '@/services/api/backend';

jest.mock('@/services/api/backend', () => ({
  getValidatedCommunityFields: jest.fn(), reportCommunityProposal: jest.fn(),
  BackendApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  },
}));
const barcode = '3017620422003', otherBarcode = '3254569920478';
const fields = [
  { proposal_id: 'name-1', field: 'name' as const, value: 'Nom validé' },
  { proposal_id: 'category-1', field: 'category' as const, value: 'Boissons' },
];
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(getValidatedCommunityFields).mockResolvedValue({ barcode, fields, contributions_enabled: true });
  jest.mocked(reportCommunityProposal).mockResolvedValue();
});

it('shows fresh name and category and reports the explicitly chosen field', async () => {
  const screen = render(<CommunityProductPanel barcodes={[barcode]} onClose={jest.fn()} />);
  await waitFor(() => screen.getByText('Nom communautaire : Nom validé'));
  screen.getByText('Rayon communautaire : Boissons');
  fireEvent.press(screen.getByText('Signaler ce rayon'));
  fireEvent.press(screen.getByLabelText('Rayon incorrect'));
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  await waitFor(() => screen.getByText('Terminer'));
  expect(reportCommunityProposal).toHaveBeenCalledWith('category-1', 'wrong_category');
});

it('requires choosing a barcode for grouped products and ignores late responses for the previous one', async () => {
  let resolve!: (value: { barcode: string; fields: typeof fields; contributions_enabled: boolean }) => void;
  jest.mocked(getValidatedCommunityFields).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const screen = render(<CommunityProductPanel barcodes={[barcode, otherBarcode]} onClose={jest.fn()} />);
  expect(getValidatedCommunityFields).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText(barcode));
  fireEvent.press(screen.getByText('Changer de code-barres'));
  fireEvent.press(screen.getByText(otherBarcode));
  await waitFor(() => screen.getByText('Nom communautaire : Nom validé'));
  expect(getValidatedCommunityFields).toHaveBeenLastCalledWith(otherBarcode);
  await act(async () => { resolve({ barcode, fields: [{ ...fields[0], value: 'Ancienne réponse' }], contributions_enabled: true }); });
  expect(screen.queryByText('Nom communautaire : Ancienne réponse')).toBeNull();
});

it('shows an empty result distinctly from unavailable service', async () => {
  jest.mocked(getValidatedCommunityFields).mockResolvedValue({ barcode, fields: [], contributions_enabled: true });
  const screen = render(<CommunityProductPanel barcodes={[barcode]} onClose={jest.fn()} />);
  await waitFor(() => screen.getByText(/Aucune valeur communautaire actuellement validée/));
  expect(screen.queryByText('Signaler ce nom')).toBeNull();
});

it('keeps validated values read-only when mutations are disabled', async () => {
  jest.mocked(getValidatedCommunityFields).mockResolvedValue({ barcode, fields, contributions_enabled: false });
  const screen = render(<CommunityProductPanel barcodes={[barcode]} onClose={jest.fn()} />);
  await waitFor(() => screen.getByText('Nom communautaire : Nom validé'));
  expect(screen.queryByText('Signaler ce nom')).toBeNull();
  expect(screen.queryByText('Signaler ce rayon')).toBeNull();
});

it.each([
  [new Error('offline'), 'Impossible de consulter la fiche communautaire. Vérifie ta connexion puis réessaie.'],
  [new BackendApiError('disabled', 404, 'req'), 'Le catalogue communautaire n’est pas accessible sur ce serveur.'],
])('offers retry after read failure: %s', async (failure, message) => {
  jest.mocked(getValidatedCommunityFields).mockRejectedValueOnce(failure);
  const screen = render(<CommunityProductPanel barcodes={[barcode]} onClose={jest.fn()} />);
  await waitFor(() => screen.getByText(message as string));
  fireEvent.press(screen.getByText('Réessayer'));
  await waitFor(() => screen.getByText('Nom communautaire : Nom validé'));
});

it('ignores a request completing after the panel unmounts', async () => {
  let resolve!: (value: { barcode: string; fields: typeof fields; contributions_enabled: boolean }) => void;
  jest.mocked(getValidatedCommunityFields).mockReturnValue(new Promise((done) => { resolve = done; }));
  const screen = render(<CommunityProductPanel barcodes={[barcode]} onClose={jest.fn()} />);
  screen.unmount();
  await act(async () => { resolve({ barcode, fields, contributions_enabled: true }); });
  expect(getValidatedCommunityFields).toHaveBeenCalledTimes(1);
});
