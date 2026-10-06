/** Accept our invitation links or a bare code; never navigate arbitrary QR URLs. */
export function parseInvitationCode(value: string): string | null {
  const match = value.trim().match(/^(?:smartshopping:\/\/invite\/)?([0-9a-f]{32})$/i);
  return match?.[1].toLowerCase() ?? null;
}
