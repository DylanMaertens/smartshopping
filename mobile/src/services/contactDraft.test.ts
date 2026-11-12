import { expect, it } from 'vitest';
import { validateContactDraft } from './contactDraft';
const valid = { email: 'camille@example.invalid', subject: 'Suggestion', message: 'Voici une suggestion pour les courses.' };
it('prepares trimmed local text without altering its contents', () => {
  expect(validateContactDraft({ ...valid, email: ` ${valid.email} ` })).toEqual(valid);
});
it.each([
  { email: '' }, { email: 'a@' }, { email: 'a b@example.invalid' }, { email: 'a'.repeat(255) + '@test.fr' },
  { subject: 'ab' }, { subject: 'a'.repeat(121) }, { message: '   ' }, { message: 'a'.repeat(3001) },
])('rejects an invalid draft %j', invalid => expect(() => validateContactDraft({ ...valid, ...invalid })).toThrow());
