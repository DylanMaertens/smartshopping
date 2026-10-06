import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ListManager } from './ListManager';
import type { ShoppingList } from '@/types';

const lists: ShoppingList[] = [
  { id: 'home', name: 'Maison', createdAt: 1, updatedAt: 2 },
  { id: 'party', name: 'Anniversaire', createdAt: 2, updatedAt: 3 },
];
const setup = (overrides = {}) => {
  const props = { activeListId: 'home', lists, onArchive: jest.fn(), onCreate: jest.fn(), onRename: jest.fn(), onSelect: jest.fn(), onShare: jest.fn(), ...overrides };
  return { ...render(<ListManager {...props} />), props };
};

it('shows names and creation without the old rename form', () => {
  const screen = setup();
  expect(screen.queryByText('Nom de la liste ouverte')).toBeNull();
  expect(screen.queryByLabelText('Nom de la liste')).toBeNull();
  expect(screen.queryByText('Renommer')).toBeNull();
  fireEvent.press(screen.getByText('Anniversaire'));
  fireEvent.press(screen.getByText('+ Nouvelle'));
  expect(screen.props.onSelect).toHaveBeenCalledWith('party');
  expect(screen.props.onCreate).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Nom de la nouvelle liste'), '  Courses   semaine ');
  fireEvent.press(screen.getByText('Créer la liste'));
  expect(screen.props.onCreate).toHaveBeenCalledWith('Courses semaine');
});

it('renames the chosen list without opening it', () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText('Options de Anniversaire'));
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Renommer'));
  expect(screen.getByLabelText('Nom de la liste').props.value).toBe('Anniversaire');
  fireEvent.changeText(screen.getByLabelText('Nom de la liste'), '  Courses   semaine  ');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(screen.props.onRename).toHaveBeenCalledWith('party', 'Courses semaine');
  expect(screen.queryByLabelText('Nom de la liste')).toBeNull();
});

it('discards a rename draft and refuses an empty name', () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText('Options de Maison'));
  fireEvent.press(screen.getByText('Renommer'));
  fireEvent.changeText(screen.getByLabelText('Nom de la liste'), '   ');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(screen.props.onRename).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Annuler'));
  expect(screen.queryByLabelText('Nom de la liste')).toBeNull();
  expect(screen.props.onRename).not.toHaveBeenCalled();
});

it('keeps a rename draft when saving fails', () => {
  const screen = setup({ onRename: jest.fn(() => { throw new Error('storage'); }) });
  fireEvent.press(screen.getByLabelText('Options de Maison'));
  fireEvent.press(screen.getByText('Renommer'));
  fireEvent.changeText(screen.getByLabelText('Nom de la liste'), 'Week-end');
  fireEvent.press(screen.getByText('Enregistrer'));
  screen.getByText('Le nom n’a pas pu être enregistré. Réessaie.');
  expect(screen.getByLabelText('Nom de la liste').props.value).toBe('Week-end');
});

it('requires confirmation to delete the chosen list without selecting it', () => {
  const alert = jest.spyOn(Alert, 'alert');
  try {
    const screen = setup();
    fireEvent.press(screen.getByLabelText('Options de Anniversaire'));
    fireEvent.press(screen.getByText('Supprimer'));
    expect(alert).toHaveBeenCalledWith('Supprimer « Anniversaire » ?', expect.any(String), expect.any(Array));
    expect(screen.props.onArchive).not.toHaveBeenCalled();
    expect(screen.props.onSelect).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2];
    act(() => buttons?.find((button) => button.text === 'Annuler')?.onPress?.());
    expect(screen.props.onArchive).not.toHaveBeenCalled();
    act(() => buttons?.find((button) => button.text === 'Supprimer')?.onPress?.());
    expect(screen.props.onArchive).toHaveBeenCalledWith('party');
  } finally { alert.mockRestore(); }
});

it('toggles one menu at a time and preserves the last list', () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText('Options de Maison'));
  fireEvent.press(screen.getByLabelText('Options de Anniversaire'));
  expect(screen.getAllByText('Renommer')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('Options de Anniversaire'));
  expect(screen.queryByText('Renommer')).toBeNull();
  screen.rerender(<ListManager {...screen.props} lists={[lists[0]]} />);
  fireEvent.press(screen.getByLabelText('Options de Maison'));
  screen.getByText('Conserve au moins une liste.');
  fireEvent.press(screen.getByText('Supprimer'));
  expect(screen.props.onArchive).not.toHaveBeenCalled();
});


it('does not create a blank list or create anything after cancelling', () => {
  const screen = setup();
  fireEvent.press(screen.getByText('+ Nouvelle'));
  fireEvent.changeText(screen.getByLabelText('Nom de la nouvelle liste'), '   ');
  fireEvent.press(screen.getByText('Créer la liste'));
  expect(screen.props.onCreate).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Nom de la nouvelle liste'), 'Vacances');
  fireEvent.press(screen.getByText('Annuler'));
  expect(screen.props.onCreate).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Nom de la nouvelle liste')).toBeNull();
});

it('keeps the chosen list name when creation fails', () => {
  const screen = setup({ onCreate: jest.fn(() => { throw new Error('storage'); }) });
  fireEvent.press(screen.getByText('+ Nouvelle'));
  fireEvent.changeText(screen.getByLabelText('Nom de la nouvelle liste'), 'Vacances');
  fireEvent.press(screen.getByText('Créer la liste'));
  screen.getByText('La liste n’a pas pu être créée. Réessaie.');
  expect(screen.getByLabelText('Nom de la nouvelle liste').props.value).toBe('Vacances');
});

it('shares the chosen list from its menu without selecting it first', () => {
  const screen = setup();
  fireEvent.press(screen.getByLabelText('Options de Anniversaire'));
  fireEvent.press(screen.getByLabelText('Partager la liste Anniversaire'));
  expect(screen.props.onShare).toHaveBeenCalledWith('party');
  expect(screen.props.onSelect).not.toHaveBeenCalled();
  expect(screen.queryByText('Renommer')).toBeNull();
});

it('keeps a disconnected copy accessible with sharing disabled', () => {
  const screen = setup({ lists: [{ ...lists[0], syncDisabled: true }, lists[1]] });
  screen.getByText('Synchronisation coupée');
  fireEvent.press(screen.getByText('Maison'));
  expect(screen.props.onSelect).toHaveBeenCalledWith('home');
  fireEvent.press(screen.getByLabelText('Options de Maison'));
  fireEvent.press(screen.getByLabelText('Partager la liste Maison'));
  expect(screen.props.onShare).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Renommer'));
  screen.getByLabelText('Nom de la liste');
});
