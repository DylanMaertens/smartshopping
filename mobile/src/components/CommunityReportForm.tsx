import React, { useEffect, useRef, useState } from 'react';
import { Button, PageModal, Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { BackendApiError, reportCommunityProposal } from '@/services/api/backend';
import type { CommunityReportReason, CommunityField } from '@/services/api/backend';

const REASONS: { value: CommunityReportReason; label: string }[] = [
  { value: 'wrong_product', label: 'Mauvais produit' },
  { value: 'wrong_name', label: 'Nom incorrect' },
  { value: 'wrong_category', label: 'Rayon incorrect' },
  { value: 'abuse', label: 'Contenu insultant ou abusif' },
  { value: 'spam', label: 'Publicité ou spam' },
];

export function CommunityReportForm({ suggestion, onClose }: { suggestion: CommunityField; onClose: () => void }) {
  const { theme } = useTheme();
  const [reason, setReason] = useState<CommunityReportReason | null>(null);
  const [sending, setSending] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function send() {
    if (!reason || inFlight.current || recorded) return;
    inFlight.current = true;
    setSending(true); setError(null);
    try {
      await reportCommunityProposal(suggestion.proposal_id, reason);
      if (active.current) setRecorded(true);
    } catch (failure) {
      if (active.current) setError(failure instanceof BackendApiError && failure.status === 429
        ? 'Trop de demandes. Réessaie plus tard.'
        : failure instanceof BackendApiError && failure.status === 404
          ? 'Cette proposition n’est plus disponible pour un signalement.'
          : 'Le signalement n’a pas pu être confirmé. Vérifie ta connexion puis réessaie.');
    } finally {
      inFlight.current = false;
      if (active.current) setSending(false);
    }
  }

  return <PageModal title="Signaler une proposition" onClose={onClose}>
    <Text>{suggestion.field === 'name' ? 'Nom' : 'Rayon'} : {suggestion.value}</Text>
    {recorded ? <>
      <Text accessibilityRole="alert">Signalement enregistré pour examen. Aucune suppression ni sanction automatique.</Text>
      <Button label="Terminer" onPress={onClose} />
    </> : <>
      <Text>Choisis un motif. Seuls la proposition concernée et ce motif seront envoyés, avec l’identifiant anonyme de cette installation. Tes choix privés restent inchangés.</Text>
      {REASONS.map((entry) => <Pressable key={entry.value} accessibilityRole="radio"
        accessibilityLabel={entry.label} accessibilityState={{ checked: reason === entry.value, disabled: sending }}
        disabled={sending} onPress={() => { setReason(entry.value); setError(null); }}
        style={{ padding: 12, borderRadius: theme.radius, backgroundColor: reason === entry.value ? theme.raised : theme.surface }}>
        <Text>{reason === entry.value ? '✓ ' : ''}{entry.label}</Text>
      </Pressable>)}
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Button label={sending ? 'Envoi en cours…' : 'Envoyer le signalement'} disabled={!reason || sending} onPress={send} />
      <Button label={sending ? 'Fermer' : 'Annuler'} variant="secondary" onPress={onClose} />
      {sending ? <Text>Fermer cet écran n’annule pas l’envoi en cours.</Text> : null}
    </>}
  </PageModal>;
}
