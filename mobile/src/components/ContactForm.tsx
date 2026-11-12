import React, { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Button, PageModal, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { validateContactDraft, type ContactDraft } from '@/services/contactDraft';

/** Deliberately disconnected: no network, mail client, analytics or persistent draft. */
export function ContactForm() {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<ContactDraft>({ email: '', subject: '', message: '' });
  const [preview, setPreview] = useState<ContactDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = (field: keyof ContactDraft, value: string) => { setDraft(current => ({ ...current, [field]: value })); setError(null); };
  return <View style={{ gap: 16 }}>
    <Text style={{ fontWeight: '700' }}>Formulaire non connecté</Text>
    <Text style={{ color: theme.muted }}>Aucun message n’est envoyé pour le moment. Utilise des informations fictives pour tester. Le brouillon reste uniquement en mémoire et disparaît à la fermeture du formulaire.</Text>
    <View style={{ gap: 6 }}><Text>Adresse de réponse</Text>
      <TextInput accessibilityLabel="Adresse de réponse" placeholder="camille@example.invalid" keyboardType="email-address"
        autoCapitalize="none" autoCorrect={false} maxLength={254} value={draft.email} onChangeText={value => update('email', value)} />
    </View>
    <View style={{ gap: 6 }}><Text>Sujet</Text>
      <TextInput accessibilityLabel="Sujet du message" placeholder="Une question, un problème, une idée…" maxLength={120}
        value={draft.subject} onChangeText={value => update('subject', value)} />
    </View>
    <View style={{ gap: 6 }}><Text>Message</Text>
      <TextInput accessibilityLabel="Message de contact" multiline textAlignVertical="top" style={{ minHeight: 160 }} maxLength={3000}
        placeholder="Décris ce que tu voulais faire et ce qui s’est passé…" value={draft.message} onChangeText={value => update('message', value)} />
      <Text style={{ color: theme.muted, fontSize: 13 }}>{draft.message.length} / 3 000 · 20 caractères minimum</Text>
      <Text style={{ color: theme.muted, fontSize: 13 }}>N’indique aucun mot de passe, code d’invitation ou contenu de liste privée.</Text>
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    <Button label="Prévisualiser le message" onPress={() => {
      Keyboard.dismiss();
      try { setPreview(validateContactDraft(draft)); setError(null); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Vérifie les champs.'); }
    }} />
    <Button disabled variant="secondary" label="Envoi bientôt disponible" />
    {preview ? <PageModal title="Relire le message" onClose={() => setPreview(null)}>
      <Text style={{ fontWeight: '700' }}>Aperçu local · message non envoyé</Text>
      <Text>Adresse de réponse : {preview.email}</Text><Text>Sujet : {preview.subject}</Text>
      <Text selectable>{preview.message}</Text>
      <Button label="Revenir au formulaire" onPress={() => setPreview(null)} />
    </PageModal> : null}
  </View>;
}
