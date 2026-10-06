import React from 'react';
import { View } from 'react-native';
import { Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import type { NetworkState } from 'expo-network';

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'disconnected';

type Props = {
  lastSyncAt: number;
  message: string | null;
  networkState: NetworkState;
  onSync: () => void;
  pendingCount: number;
  phase: SyncPhase;
};

export function SyncStatusCard({
  lastSyncAt,
  message,
  networkState,
  onSync,
  pendingCount,
  phase,
}: Props) {
  const { theme } = useTheme();
  const networkKnown = networkState.isConnected !== undefined;
  const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
  const disconnected = phase === 'disconnected';
  const disabled = phase === 'syncing' || disconnected;

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: theme.radius, gap: 10, padding: 16 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Synchronisation</Text>
        <Text style={{ color: disconnected ? theme.muted : online ? theme.success : theme.warning, fontWeight: '700' }}>
          {disconnected ? 'Synchronisation coupée' : !networkKnown ? '● Vérification…' : online ? '● En ligne' : '● Hors ligne'}
        </Text>
      </View>
      <Text style={{ color: theme.muted }}>
        {disconnected ? 'Cette copie reste disponible sur cet appareil.' : `${pendingCount} changement${pendingCount > 1 ? 's' : ''} en attente.`}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 13 }}>
        {disconnected ? 'Pour rétablir le partage, rejoins cette liste avec une nouvelle invitation.' : 'Actualisation à l’ouverture et au retour dans l’app. Envoi des modifications après 1 seconde, lorsque l’app est ouverte et connectée.'}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 13 }}>
        Dernière synchronisation : {lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleString() : 'jamais'}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onSync}
        style={{
          alignItems: 'center',
          backgroundColor: disconnected ? theme.border : theme.primary,
          borderRadius: theme.radius,
          padding: 12,
        }}
      >
        <Text style={{ color: disconnected ? theme.muted : theme.onPrimary, fontWeight: '700' }}>
          {phase === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </Text>
      </Pressable>
      {message && !disconnected ? <Text style={{ color: phase === 'error' ? theme.danger : phase === 'offline' ? theme.warning : theme.muted }}>{message}</Text> : null}
    </View>
  );
}
