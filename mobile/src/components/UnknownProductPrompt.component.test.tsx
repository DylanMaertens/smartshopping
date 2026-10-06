import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { UnknownProductPrompt } from './UnknownProductPrompt';
import { reportCommunityProposal } from '@/services/api/backend';

jest.mock('@/services/api/backend', () => ({ reportCommunityProposal: jest.fn() }));

it('requires a valid name and permits postponing without saving', () => {
  const onSave = jest.fn(), onLater = jest.fn();
  const screen = render(<UnknownProductPrompt barcode="3254569920478" onSave={onSave} onLater={onLater} />);
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  screen.getByText('Saisis le nom du produit.');
  fireEvent.changeText(screen.getByLabelText('Nom du produit scanné'), 'é'.repeat(101));
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  screen.getByText('Ce nom est trop long.');
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Plus tard'));
  expect(onLater).toHaveBeenCalledTimes(1);
});
it('normalizes a submitted name and keeps the editor on a storage error', () => {
  const onSave = jest.fn().mockImplementationOnce(() => { throw new Error('disk full'); });
  const screen = render(<UnknownProductPrompt barcode="3254569920478" onSave={onSave} onLater={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Nom du produit scanné'), '  LESSIVE   LIQUIDE ');
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  expect(onSave).toHaveBeenCalledWith('Lessive liquide', 'Entretien maison', { publish: false, proposalIds: [] });
  screen.getByText('Impossible d’enregistrer le nom. Réessaie.');
});

it('offers at most the supplied community choices and keeps participation opt-in', () => {
  const onSave = jest.fn();
  const suggestions = [
    { proposal_id: 'name-1', field: 'name' as const, value: 'Lessive douce', confirmations: 2, agreement_ratio: 1 },
    { proposal_id: 'category-1', field: 'category' as const, value: 'Entretien maison', confirmations: 1, agreement_ratio: 1 },
  ];
  const screen = render(<UnknownProductPrompt barcode="3254569920478" communityAvailable suggestions={suggestions} onSave={onSave} onLater={jest.fn()} />);
  expect(screen.getAllByText('proposition non validée', { exact: false })).toHaveLength(2);
  fireEvent.press(screen.getByLabelText('Proposition de nom : Lessive douce'));
  fireEvent.press(screen.getByLabelText('Proposition de rayon : Entretien maison'));
  fireEvent.press(screen.getByLabelText('Participer au catalogue communautaire'));
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  expect(onSave).toHaveBeenCalledWith('Lessive douce', 'Entretien maison', {
    publish: true, proposalIds: ['name-1', 'category-1'],
  });
});

it('reports without selecting a proposal, publishing or altering the private draft', async () => {
  jest.mocked(reportCommunityProposal).mockResolvedValue(undefined);
  const onSave = jest.fn();
  const suggestions = [{ proposal_id: 'name-1', field: 'name' as const, value: 'Nom public', confirmations: 2, agreement_ratio: 1 }];
  const screen = render(<UnknownProductPrompt barcode="3254569920478" communityAvailable suggestions={suggestions} onSave={onSave} onLater={jest.fn()} />);
  fireEvent.changeText(screen.getByLabelText('Nom du produit scanné'), 'Mon nom privé');
  fireEvent.press(screen.getByLabelText('Signaler la proposition de nom : Nom public'));
  fireEvent.press(screen.getByLabelText('Nom incorrect'));
  fireEvent.press(screen.getByText('Envoyer le signalement'));
  await waitFor(() => screen.getByText('Signalement enregistré pour examen. Aucune suppression ni sanction automatique.'));
  expect(reportCommunityProposal).toHaveBeenCalledWith('name-1', 'wrong_name');
  fireEvent.press(screen.getByText('Terminer'));
  fireEvent.press(screen.getByText('Enregistrer le nom'));
  expect(onSave).toHaveBeenCalledWith('Mon nom privé', 'À classer', { publish: false, proposalIds: [] });
});

it('hides reporting when the server does not allow contributions', () => {
  const suggestions = [{ proposal_id: 'name-1', field: 'name' as const, value: 'Nom public', confirmations: 2, agreement_ratio: 1 }];
  const screen = render(<UnknownProductPrompt barcode="3254569920478" suggestions={suggestions} onSave={jest.fn()} onLater={jest.fn()} />);
  expect(screen.queryByText('Signaler cette proposition')).toBeNull();
});
