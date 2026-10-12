import React from 'react';
import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Button } from './ui';

it('uses more compact padding but retains a 48-point touch target and scaling text', () => {
  const screen = render(<Button label="Ajouter" onPress={() => {}} />);
  const style = StyleSheet.flatten(screen.getByRole('button').props.style);
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.minWidth).toBeGreaterThanOrEqual(48);
  expect(style.paddingVertical).toBe(9);
  expect(screen.getByText('Ajouter').props.allowFontScaling).not.toBe(false);
});
