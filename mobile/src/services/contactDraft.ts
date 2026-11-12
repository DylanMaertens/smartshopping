export type ContactDraft = { email: string; subject: string; message: string };
export function validateContactDraft(draft: ContactDraft): ContactDraft {
  const value = { email: draft.email.trim(), subject: draft.subject.trim(), message: draft.message.trim() };
  if (value.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    throw new Error('Indique une adresse e-mail valide.');
  }
  if (value.subject.length < 3 || value.subject.length > 120) throw new Error('Le sujet doit contenir entre 3 et 120 caractères.');
  if (value.message.length < 20 || value.message.length > 3000) throw new Error('Le message doit contenir entre 20 et 3 000 caractères.');
  return value;
}
