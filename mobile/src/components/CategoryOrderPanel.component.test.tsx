import React from 'react';
import { Dimensions, PanResponder } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { CategoryOrderPanel } from './CategoryOrderPanel';
import { defaultCategoryOrder } from '@/services/categorization/categoryOrder';

const originalWindow = Dimensions.get('window');
beforeEach(() => Dimensions.set({ window: { width: 390, height: 844, scale: 1, fontScale: 1 } }));
afterEach(() => Dimensions.set({ window: originalWindow }));

// Supply gesture displacement directly; actual Android gesture handling still needs device testing.
beforeEach(() => jest.spyOn(PanResponder, 'create').mockImplementation((config) => ({
  panHandlers: {
    onResponderGrant: config.onPanResponderGrant,
    onResponderMove: config.onPanResponderMove,
    onResponderRelease: config.onPanResponderRelease,
    onResponderTerminate: config.onPanResponderTerminate,
  },
} as ReturnType<typeof PanResponder.create>)));
afterEach(() => jest.restoreAllMocks());

it('drags a row to the first position and saves only on confirmation', () => {
  const onSave = jest.fn();
  const screen = render(<CategoryOrderPanel order={defaultCategoryOrder()} onSave={onSave} onCancel={jest.fn()} />);
  const handle = screen.getByTestId('category-drag-boissons');
  fireEvent(handle, 'responderGrant');
  expect(screen.getByTestId('category-order-scroll').props.scrollEnabled).toBe(false);
  fireEvent(handle, 'responderMove', {}, { dy: -1000 });
  fireEvent(handle, 'responderRelease');
  expect(screen.getByTestId('category-order-row-boissons').props.style.top).toBe(0);
  expect(screen.getByTestId('category-order-scroll').props.scrollEnabled).toBe(true);
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(onSave.mock.calls[0][0][0]).toBe('boissons');
});

it('cancels an interrupted drag and does not save when the editor is cancelled', () => {
  const onSave = jest.fn(), onCancel = jest.fn();
  const screen = render(<CategoryOrderPanel order={defaultCategoryOrder()} onSave={onSave} onCancel={onCancel} />);
  const handle = screen.getByTestId('category-drag-boissons');
  fireEvent(handle, 'responderGrant');
  fireEvent(handle, 'responderMove', {}, { dy: -1000 });
  fireEvent(handle, 'responderTerminate');
  expect(screen.getByTestId('category-order-row-boissons').props.style.top).toBe(7 * 76);
  fireEvent.press(screen.getByText('Annuler'));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onSave).not.toHaveBeenCalled();
});

it('supports accessible movement, default reset and retry after a storage error', () => {
  const onSave = jest.fn().mockImplementationOnce(() => { throw new Error('disk'); });
  const screen = render(<CategoryOrderPanel order={['boissons']} onSave={onSave} onCancel={jest.fn()} />);
  fireEvent(screen.getByLabelText('Déplacer Boissons'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(screen.getByTestId('category-order-row-boissons').props.style.top).toBe(76);
  fireEvent.press(screen.getByText('Ordre par défaut'));
  fireEvent.press(screen.getByText('Enregistrer'));
  screen.getByText('Impossible de sauvegarder cet ordre. Réessaie.');
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(onSave).toHaveBeenLastCalledWith(defaultCategoryOrder());
});

it('keeps drag positions aligned when system text is enlarged', () => {
  Dimensions.set({ window: { width: 320, height: 640, scale: 1, fontScale: 2 } });
  const onSave = jest.fn();
  const screen = render(<CategoryOrderPanel order={['boissons']} onSave={onSave} onCancel={jest.fn()} />);
  const handle = screen.getByTestId('category-drag-boissons');
  fireEvent(handle, 'responderGrant');
  fireEvent(handle, 'responderMove', {}, { dy: 208 });
  fireEvent(handle, 'responderRelease');
  expect(screen.getByTestId('category-order-row-boissons').props.style.top).toBe(208);
  fireEvent.press(screen.getByText('Enregistrer'));
  expect(onSave.mock.calls[0][0][1]).toBe('boissons');
});
