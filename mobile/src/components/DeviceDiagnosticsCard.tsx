import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MotionView, useMotionStatus } from '@/theme/motion';
import {
  runDeviceStorageDiagnostics,
  type DeviceDiagnosticResult,
} from '@/db/deviceDiagnostics';
import { rotateAnonymousDeviceId } from '@/services/identity/deviceIdentity';

export function DeviceDiagnosticsCard() {
  const { theme } = useTheme();
  const [results, setResults] = useState<DeviceDiagnosticResult[]>([]);
  const motion = useMotionStatus();
  const [motionTrial, setMotionTrial] = useState(0);

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: theme.radius, gap: 10, padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Diagnostic appareil</Text>
      <MotionView replayKey={motionTrial}><Text>{motion === 'enabled' ? 'Animations : actives'
        : motion === 'reduced' ? 'Animations : réduites par Android'
        : motion === 'checking' ? 'Animations : vérification du réglage système…'
        : 'Animations : réglage système inaccessible, désactivées par précaution'}</Text></MotionView>
      <Pressable onPress={() => setMotionTrial((value) => value + 1)}><Text>Tester le fondu</Text></Pressable>
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
