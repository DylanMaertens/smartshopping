import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { CategorySection } from './CategorySection';
import { themes, themeIds, type ThemeId } from '@/theme/themes';
let mockThemeId: ThemeId = 'origine';
jest.mock('@/theme/ThemeProvider', () => ({ useTheme: () => ({
  theme: require('@/theme/themes').themes[mockThemeId], headingFont: undefined, bodyFont: undefined,
}) }));
const items = [
  { id: 'milk', listId: 'home', name: 'Lait', quantity: 2, checked: false, updatedAt: 1 },
  { id: 'rice', listId: 'home', name: 'Riz', quantity: 1, checked: true, updatedAt: 1 },
];
const props = () => ({ section: { categoryName: 'Épicerie', orderIndex: 0, items },
  onToggleItem: jest.fn(), onRemoveItem: jest.fn(), onRenameItem: jest.fn(), onIncreaseQuantity: jest.fn(), onDecreaseQuantity: jest.fn() });

it.each(themeIds)('only strikes checked names without dimming them in either %s presentation', (themeId) => {
  mockThemeId = themeId;
  const callbacks = props();
  const screen = render(<CategorySection {...callbacks} />);
  for (const notebook of [false, true]) {
    screen.rerender(<CategorySection {...callbacks} notebook={notebook} />);
    const checkedStyle = StyleSheet.flatten(screen.getByText('Riz').props.style);
    expect(checkedStyle).toMatchObject({ color: themes[themeId].text, textDecorationLine: 'line-through' });
    const checkedRow = StyleSheet.flatten(screen.getByTestId('shopping-row-rice').props.style);
    screen.rerender(<CategorySection {...callbacks} notebook={notebook}
      section={{ ...callbacks.section, items: items.map(item => ({ ...item, checked: false })) }} />);
    expect(StyleSheet.flatten(screen.getByText('Riz').props.style))
      .toEqual({ ...checkedStyle, textDecorationLine: 'none' });
    expect(StyleSheet.flatten(screen.getByTestId('shopping-row-rice').props.style)).toEqual(checkedRow);
    expect(screen.getByLabelText('Cocher Riz').props.accessibilityState.checked).toBe(false);
  }
});

it.each(themeIds)('keeps %s styling and accessible controls in a ruled notebook without aisle titles', (themeId) => {
  mockThemeId = themeId;
  const callbacks = props();
  const screen = render(<CategorySection {...callbacks} notebook showCategories={false} />);
  expect(screen.queryByRole('header')).toBeNull();
  expect(screen.getAllByRole('checkbox').map(node => node.props.accessibilityLabel)).toEqual(['Cocher Lait', 'Cocher Riz']);
  expect(StyleSheet.flatten(screen.getByTestId('shopping-row-milk').props.style)).toMatchObject({
    backgroundColor: themes[themeId].surface, borderColor: themes[themeId].border,
    borderBottomWidth: themes[themeId].stroke, borderWidth: 0, borderRadius: 0, padding: 0,
  });
  expect(StyleSheet.flatten(screen.getByText('Riz').props.style).textDecorationLine).toBe('line-through');
  const checkbox = screen.getByLabelText('Cocher Riz');
  expect(StyleSheet.flatten(checkbox.props.style).minHeight).toBeGreaterThanOrEqual(48);
  fireEvent.press(checkbox);
  expect(callbacks.onToggleItem).toHaveBeenCalledWith('rice');
  fireEvent.press(screen.getByLabelText('Augmenter la quantité de Lait'));
  fireEvent.press(screen.getByLabelText('Diminuer la quantité de Lait'));
  expect(callbacks.onIncreaseQuantity).toHaveBeenCalledWith('milk');
  expect(callbacks.onDecreaseQuantity).toHaveBeenCalledWith('milk');
  fireEvent.press(screen.getByLabelText('Modifier Lait'));
  fireEvent.changeText(screen.getByLabelText('Nom de l’article'), 'Mon lait');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(callbacks.onRenameItem).toHaveBeenCalledWith('milk', 'Mon lait', 'À classer');
  screen.rerender(<CategorySection {...callbacks} notebook showCategories />);
  screen.getByRole('header');
  expect(StyleSheet.flatten(screen.getByTestId('category-heading').props.style).backgroundColor).toBe('transparent');
  screen.rerender(<CategorySection {...callbacks} showCategories />);
  screen.getByRole('header');
  expect(StyleSheet.flatten(screen.getByTestId('category-heading').props.style).backgroundColor)
    .toBe(themeId === 'pastel' ? '#E2F1E7' : themes[themeId].raised);
  expect(StyleSheet.flatten(screen.getByTestId('shopping-row-milk').props.style).borderRadius).toBe(themes[themeId].radius);
});
