import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ShoppingItem } from './ShoppingItem';
const item = { id: 'milk', listId: 'home', name: 'Lait', quantity: 1, checked: false, updatedAt: 1 };
const callbacks = () => ({ onRename: jest.fn(), onToggle: jest.fn(), onRemove: jest.fn(), onIncreaseQuantity: jest.fn(), onDecreaseQuantity: jest.fn() });
it('presents all manual aisle choices in French alphabetical order', () => {
  const screen = render(<ShoppingItem item={item} {...callbacks()} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.press(screen.getByLabelText('Choisir le rayon'));
  const names = screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel);
  expect(names).toHaveLength(29);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })));
});
it('edits a trimmed name and closes the editor', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={item} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.changeText(screen.getByLabelText('Nom de l’article'), '  PAIN   DE\t MIE  ');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(props.onRename).toHaveBeenCalledWith('milk', 'Pain de mie', 'À classer');
  expect(screen.queryByLabelText('Nom de l’article')).toBeNull();
});
it('rejects empty or oversized names without closing the editor', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={item} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  for (const name of ['   ', 'é'.repeat(101)]) {
    fireEvent.changeText(screen.getByLabelText('Nom de l’article'), name);
    fireEvent.press(screen.getByText('Enregistrer'));
    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  }
});
it('cancels editing without modifying the item', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={item} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.changeText(screen.getByLabelText('Nom de l’article'), 'Pain');
  fireEvent.press(screen.getByText('Annuler'));
  expect(props.onRename).not.toHaveBeenCalled();
  screen.getByText('Lait');
});

it('displays legacy names in sentence case without modifying storage on render', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={{ ...item, name: 'lAIT DEMI-ÉCRÉMÉ' }} {...props} />);
  screen.getByText('Lait demi-écrémé');
  expect(props.onRename).not.toHaveBeenCalled();
});


it('moves an unclassified item only after saving the selected category', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={{ ...item, name: 'Quinoa', category: 'À classer' }} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Quinoa'));
  fireEvent.press(screen.getByLabelText('Choisir le rayon'));
  fireEvent.press(screen.getByRole('radio', { name: 'Épicerie salée' }));
  screen.getByText('Rayon : Épicerie salée');
  expect(props.onRename).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(props.onRename).toHaveBeenCalledWith('milk', 'Quinoa', 'Épicerie salée');
});

it('discards a category draft when cancelling item editing', () => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={item} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.press(screen.getByLabelText('Choisir le rayon'));
  fireEvent.press(screen.getByRole('radio', { name: 'Boissons' }));
  fireEvent.press(screen.getByText('Annuler'));
  expect(props.onRename).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  screen.getByText('Rayon : À classer');
});

it('keeps the chosen category when saving fails', () => {
  const props = { ...callbacks(), onRename: jest.fn(() => { throw new Error('storage'); }) };
  const screen = render(<ShoppingItem item={item} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.press(screen.getByLabelText('Choisir le rayon'));
  fireEvent.press(screen.getByRole('radio', { name: 'Boissons' }));
  fireEvent.press(screen.getByText('Enregistrer'));
  screen.getByText('La modification n’a pas pu être enregistrée. Réessaie.');
  screen.getByText('Rayon : Boissons');
});

it.each(['Papeterie & fournitures de bureau', 'Bricolage & quincaillerie', 'Jardin & extérieur', 'Auto & moto'])('allows manually selecting %s', (category) => {
  const props = callbacks();
  const screen = render(<ShoppingItem item={{ ...item, name: 'Objet' }} {...props} />);
  fireEvent.press(screen.getByLabelText('Modifier Objet'));
  fireEvent.press(screen.getByLabelText('Choisir le rayon'));
  fireEvent.press(screen.getByRole('radio', { name: category }));
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(props.onRename).toHaveBeenCalledWith('milk', 'Objet', category);
});
