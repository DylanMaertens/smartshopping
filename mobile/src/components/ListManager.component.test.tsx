import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ListManager } from './ListManager';
import type { ShoppingList } from '@/types';

const lists: ShoppingList[] = [
  { id: 'home', name: 'Maison', createdAt: 1, updatedAt: 2 },
  { id: 'party', name: 'Anniversaire', createdAt: 2, updatedAt: 3 },
];

describe('ListManager', () => {
  it('sélectionne et crée des listes', () => {
    const onSelect = jest.fn();
    const onCreate = jest.fn();
    const screen = render(
      <ListManager
        activeListId="home"
        lists={lists}
        onArchive={jest.fn()}
        onCreate={onCreate}
        onRename={jest.fn()}
        onSelect={onSelect}
      />,
    );

    fireEvent.press(screen.getByText('Anniversaire'));
    fireEvent.press(screen.getByText('+ Nouvelle'));
    expect(onSelect).toHaveBeenCalledWith('party');
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('renomme et archive la liste active', () => {
    const onRename = jest.fn();
    const onArchive = jest.fn();
    const screen = render(
      <ListManager
        activeListId="home"
        lists={lists}
        onArchive={onArchive}
        onCreate={jest.fn()}
        onRename={onRename}
        onSelect={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByPlaceholderText('Nom de la liste'), 'Courses semaine');
    fireEvent.press(screen.getByText('Renommer'));
    fireEvent.press(screen.getByText('Archiver cette liste'));
    expect(onRename).toHaveBeenCalledWith('Courses semaine');
    expect(onArchive).toHaveBeenCalledTimes(1);
  });
});
