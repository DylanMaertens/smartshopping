import React, { useState } from 'react';
import { Switch, View } from 'react-native';
import { Button, PageModal, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { readOcrContributionPreview, saveOcrContributionPreview } from '@/services/storage/ocrContributionSettings';

export function OcrContributionSettings() {
  const { theme } = useTheme();
  const [enabled, setEnabled] = useState(readOcrContributionPreview);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function save(value: boolean) {
    try { saveOcrContributionPreview(value); setEnabled(value); setConfirming(false); setError(null); }
    catch { setError('Impossible d’enregistrer ce choix. Réessaie.'); }
  }
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, fontWeight: '700' }}>Amélioration OCR · aperçu</Text>
      <Switch accessibilityLabel="Aperçus de contribution OCR" value={enabled} trackColor={{ true: theme.primary, false: theme.border }}
        onValueChange={value => { setError(null); if (value) setConfirming(true); else save(false); }} />
    </View>
    <Text style={{ color: theme.muted, fontSize: 14 }}>Désactivé par défaut. Prépare un aperçu volontaire de la photo recadrée et du texte corrigé. Aucune contribution n’est envoyée ni mise en attente.</Text>
    {error && !confirming ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    {confirming ? <PageModal title="Contributions OCR" onClose={() => { setConfirming(false); setError(null); }}>
      <Text>Tu pourras examiner chaque capture et son texte corrigé avant de décider de contribuer. Les photos peuvent contenir des informations privées : utilise des exemples fictifs pour cet aperçu.</Text>
      <Text>Le service de collecte n’est pas connecté. Cette option autorise seulement l’aperçu sur cet appareil, pas un envoi futur. Aucun exemple ni texte corrigé n’est conservé pour une contribution.</Text>
      <Text>La reconnaissance habituelle continue d’envoyer la photo au serveur OCR pour lire la liste, indépendamment de ce réglage. Elle n’est pas une contribution d’entraînement.</Text>
      {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
      <Button label="Activer les aperçus uniquement" onPress={() => save(true)} />
      <Button variant="ghost" label="Pas maintenant" onPress={() => { setConfirming(false); setError(null); }} />
    </PageModal> : null}
  </View>;
}
