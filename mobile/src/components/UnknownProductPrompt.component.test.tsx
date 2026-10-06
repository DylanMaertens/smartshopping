import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { UnknownProductPrompt } from './UnknownProductPrompt';

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
