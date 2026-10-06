import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import {
  runDeviceStorageDiagnostics,
  type DeviceDiagnosticResult,
} from '@/db/deviceDiagnostics';
import { rotateAnonymousDeviceId } from '@/services/identity/deviceIdentity';

export function DeviceDiagnosticsCard() {
  const { theme } = useTheme();
  const [results, setResults] = useState<DeviceDiagnosticResult[]>([]);

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: theme.radius, gap: 10, padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Diagnostic appareil</Text>
      <Text style={{ color: theme.muted }}>
        Vérifie le module SQLite natif. Pour le parcours offline, active le mode avion, modifie une liste,
        redémarre l’app puis réactive le réseau.
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="run-device-diagnostics"
        onPress={() => setResults(runDeviceStorageDiagnostics())}
        style={{ alignItems: 'center', borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, padding: 10 }}
      >
        <Text style={{ color: theme.text, fontWeight: '700' }}>Tester SQLite sur cet appareil</Text>
      </Pressable>
      {results.map((result) => (
        <Text key={result.name} style={{ color: result.passed ? theme.success : theme.danger }}>
          {result.passed ? '✓' : '✕'} {result.name} — {result.detail}
        </Text>
      ))}
      <Pressable onPress={() => Alert.alert(
        'Réinitialiser l’identité anonyme ?',
        'Les accès aux listes partagées devront être invités à nouveau.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réinitialiser', style: 'destructive', onPress: async () => {
            try {
              await rotateAnonymousDeviceId();
              setResults([{ name: 'Identité anonyme', passed: true, detail: 'Nouvel identifiant sécurisé créé.' }]);
            } catch { setResults([{ name: 'Identité anonyme', passed: false, detail: 'Réinitialisation impossible. Réessaie.' }]); }
          } },
        ],
      )}>
        <Text style={{ color: theme.danger, fontWeight: '700' }}>Réinitialiser mon identité anonyme</Text>
      </Pressable>
    </View>
  );
}
