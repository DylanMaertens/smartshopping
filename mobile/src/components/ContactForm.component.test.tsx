import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ContactForm } from './ContactForm';

it('validates locally, previews without sending and preserves edits on return', () => {
  const network = jest.spyOn(globalThis, 'fetch');
  const screen = render(<ContactForm />);
  fireEvent.press(screen.getByText('Prévisualiser le message'));
  screen.getByText('Indique une adresse e-mail valide.');
  fireEvent.changeText(screen.getByLabelText('Adresse de réponse'), 'camille@example.invalid');
  fireEvent.changeText(screen.getByLabelText('Sujet du message'), 'Suggestion');
  fireEvent.changeText(screen.getByLabelText('Message de contact'), 'Voici une suggestion pour les prochaines courses.');
  fireEvent.press(screen.getByText('Prévisualiser le message'));
  screen.getByText('Aperçu local · message non envoyé');
  fireEvent.press(screen.getByText('Revenir au formulaire'));
  expect(screen.getByLabelText('Sujet du message').props.value).toBe('Suggestion');
  expect(screen.getByText('Envoi bientôt disponible')).toBeDisabled();
  expect(network).not.toHaveBeenCalled();
  screen.unmount();
  const reopened = render(<ContactForm />);
  expect(reopened.getByLabelText('Message de contact').props.value).toBe('');
  network.mockRestore();
});
