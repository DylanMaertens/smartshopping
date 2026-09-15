import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  runDeviceStorageDiagnostics,
  type DeviceDiagnosticResult,
} from '@/db/deviceDiagnostics';
import { rotateAnonymousDeviceId } from '@/services/identity/deviceIdentity';

export function DeviceDiagnosticsCard() {
  const [results, setResults] = useState<DeviceDiagnosticResult[]>([]);

  return (
    <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, gap: 10, padding: 16 }}>
      <Text style={{ color: '#334155', fontSize: 16, fontWeight: '700' }}>Diagnostic appareil</Text>
      <Text style={{ color: '#64748b' }}>
        Vérifie le module SQLite natif. Pour le parcours offline, active le mode avion, modifie une liste,
        redémarre l’app puis réactive le réseau.
      </Text>
      <Pressable
        accessibilityRole="button"
        testID="run-device-diagnostics"
        onPress={() => setResults(runDeviceStorageDiagnostics())}
        style={{ alignItems: 'center', borderColor: '#475569', borderRadius: 10, borderWidth: 1, padding: 10 }}
      >
        <Text style={{ color: '#334155', fontWeight: '700' }}>Tester SQLite sur cet appareil</Text>
      </Pressable>
      {results.map((result) => (
        <Text key={result.name} style={{ color: result.passed ? '#15803d' : '#b91c1c' }}>
          {result.passed ? '✓' : '✕'} {result.name} — {result.detail}
        </Text>
      ))}
      <Pressable onPress={() => Alert.alert(
        'Réinitialiser l’identité anonyme ?',
        'Les accès aux listes partagées devront être invités à nouveau.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Réinitialiser', style: 'destructive', onPress: async () => {
            await rotateAnonymousDeviceId();
            setResults([{ name: 'Identité anonyme', passed: true, detail: 'Nouvel identifiant sécurisé créé.' }]);
          } },
        ],
      )}>
        <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Réinitialiser mon identité anonyme</Text>
      </Pressable>
    </View>
  );
}
