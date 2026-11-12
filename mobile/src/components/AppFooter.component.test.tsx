import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { AppFooter } from './AppFooter';

it.each([
  ['CGU', 'Conditions générales d’utilisation'],
  ['CGV', 'Conditions générales de vente'],
])('opens the future %s page honestly and closes it', (label, title) => {
  const screen = render(<AppFooter />);
  fireEvent.press(screen.getByLabelText(`${label} — à venir`));
  screen.getByText('À venir');
  fireEvent.press(screen.getByLabelText(`Fermer ${title}`));
  expect(screen.queryByText('À venir')).toBeNull();
  screen.getByLabelText(`${label} — à venir`);
});
it('opens the contact form without claiming that sending is available', () => {
  const screen = render(<AppFooter />);
  fireEvent.press(screen.getByLabelText('Contact'));
  screen.getByText('Formulaire non connecté');
  expect(screen.getByText('Envoi bientôt disponible')).toBeDisabled();
  fireEvent.press(screen.getByLabelText('Fermer Contact'));
  expect(screen.queryByText('Formulaire non connecté')).toBeNull();
});
