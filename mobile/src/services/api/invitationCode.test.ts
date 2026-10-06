import { describe, expect, it } from 'vitest';
import { parseInvitationCode } from './invitationCode';
describe('invitation codes', () => {
  it('accepts a copied code or our QR link, trimming and normalizing case', () => {
    expect(parseInvitationCode(' ' + 'A'.repeat(32) + ' ')).toBe('a'.repeat(32));
    expect(parseInvitationCode('smartshopping://invite/' + 'a'.repeat(32))).toBe('a'.repeat(32));
  });
  it('rejects unrelated QR codes and malformed invitations', () => {
    for (const value of ['12345678', 'https://example.com', 'g'.repeat(32), 'a'.repeat(31),
      'https://evil.test/smartshopping://invite/' + 'a'.repeat(32),
      'smartshopping://invite/' + 'a'.repeat(32) + '?next=evil']) {
      expect(parseInvitationCode(value)).toBeNull();
    }
  });
});
