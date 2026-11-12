import React from 'react';
import { Switch, View } from 'react-native';
import { Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { usePremium } from '@/premium/PremiumProvider';

export function PremiumPanel() {
  const { theme } = useTheme();
  const { isPremium, canSimulate, setSimulation, error } = usePremium();
  return <View style={{ padding: 16, gap: 12, backgroundColor: theme.surface, borderRadius: theme.radius,
    borderWidth: theme.stroke, borderColor: theme.border }}>
    <Text style={{ fontSize: 20, fontWeight: '700' }}>Premium · aperçu</Text>
    <Text>Thèmes Minimal, Papier, Pastel et Pixel, et création de codes pour partager une liste.</Text>
    <Text style={{ color: theme.muted }}>Origine, Nuit, Contraste, les listes locales et rejoindre une liste restent gratuits. Les partages existants restent accessibles.</Text>
    {canSimulate ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ flex: 1, fontWeight: '700' }}>Mode premium (test)</Text>
      <Switch accessibilityLabel="Mode premium (test)" value={isPremium} onValueChange={setSimulation}
        trackColor={{ true: theme.primary, false: theme.border }} />
    </View> : null}
    <Text style={{ color: theme.muted, fontSize: 14 }}>Aucun achat ni abonnement actif. {canSimulate
      ? 'Ce switch simule les droits uniquement dans les versions de test.'
      : 'Les achats ne sont pas encore disponibles.'}</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
  </View>;
}
