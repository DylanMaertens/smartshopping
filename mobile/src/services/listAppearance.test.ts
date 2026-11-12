import { expect, it } from 'vitest';
import { normalizeListAppearance } from './listAppearance';

it('fails back to cards with titles unless explicit valid booleans are saved', () => {
  for (const value of [null, undefined, 'yes', 1, [], { notebook: 'true', showCategories: 'false' }]) {
    expect(normalizeListAppearance(value)).toEqual({ notebook: false, showCategories: true });
  }
  expect(normalizeListAppearance({ notebook: true, showCategories: false })).toEqual({ notebook: true, showCategories: false });
  expect(normalizeListAppearance({ notebook: true })).toEqual({ notebook: true, showCategories: true });
});
