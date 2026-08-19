import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NetworkState } from 'expo-network';

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

type Props = {
  lastSyncAt: number;
  message: string | null;
  networkState: NetworkState;
  onSync: () => void;
  pendingCount: number;
  phase: SyncPhase;
};

const PHASE_COLORS: Record<SyncPhase, string> = {
  idle: '#475569',
  syncing: '#1d4ed8',
  synced: '#15803d',
  offline: '#a16207',
  error: '#b91c1c',
};

export function SyncStatusCard({
  lastSyncAt,
  message,
  networkState,
  onSync,
  pendingCount,
  phase,
}: Props) {
  const networkKnown = networkState.isConnected !== undefined;
  const online = networkState.isConnected === true && networkState.isInternetReachable !== false;
  const disabled = phase === 'syncing';

  return (
    <View style={{ backgroundColor: '#eff6ff', borderRadius: 16, gap: 10, padding: 16 }}>
      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: '#1e3a8a', fontSize: 16, fontWeight: '700' }}>Synchronisation</Text>
        <Text style={{ color: online ? '#15803d' : '#a16207', fontWeight: '700' }}>
          {!networkKnown ? '● Vérification…' : online ? '● En ligne' : '● Hors ligne'}
        </Text>
      </View>
      <Text style={{ color: '#475569' }}>
        {pendingCount} changement{pendingCount > 1 ? 's' : ''} en attente.
      </Text>
      <Text style={{ color: '#64748b', fontSize: 13 }}>
        Dernière synchronisation : {lastSyncAt > 0 ? new Date(lastSyncAt).toLocaleString() : 'jamais'}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onSync}
        style={{
          alignItems: 'center',
          backgroundColor: disabled ? '#94a3b8' : '#1d4ed8',
          borderRadius: 12,
          padding: 12,
        }}
      >
        <Text style={{ color: '#ffffff', fontWeight: '700' }}>
          {phase === 'syncing' ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </Text>
      </Pressable>
      {message ? <Text style={{ color: PHASE_COLORS[phase] }}>{message}</Text> : null}
    </View>
  );
}
