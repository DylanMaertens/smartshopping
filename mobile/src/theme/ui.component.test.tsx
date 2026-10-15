import React from 'react';
import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Button, PageModal, Text } from './ui';

it('uses more compact padding but retains a 48-point touch target and scaling text', () => {
  const screen = render(<Button label="Ajouter" onPress={() => {}} />);
  const style = StyleSheet.flatten(screen.getByRole('button').props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  expect(style.paddingVertical).toBe(9);
  expect(screen.getByText('Ajouter').props.allowFontScaling).not.toBe(false);
});

it.each([true, false])('leaves Android modal resizing to the native window (scrollable=%s)', (scrollable) => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    const screen = render(<PageModal title="Ajouter" onClose={jest.fn()} scrollable={scrollable}><Text>Produit</Text></PageModal>);
    expect(screen.UNSAFE_queryAllByType(KeyboardAvoidingView)).toHaveLength(0);
    screen.rerender(<PageModal title="Ajouter" onClose={jest.fn()} scrollable={scrollable}><Text>Dictée</Text></PageModal>);
    expect(screen.UNSAFE_queryAllByType(KeyboardAvoidingView)).toHaveLength(0);
    screen.getByText('Dictée');
    screen.unmount();
  } finally { os.restore(); }
});

it('preserves keyboard padding on iOS', () => {
  const os = jest.replaceProperty(Platform, 'OS', 'ios');
  try {
    const screen = render(<PageModal title="Ajouter" onClose={jest.fn()}><Text>Produit</Text></PageModal>);
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    screen.unmount();
  } finally { os.restore(); }
});
