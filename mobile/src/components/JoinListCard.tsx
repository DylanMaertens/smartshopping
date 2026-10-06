import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { BarcodeScannerPanel } from '@/components/BarcodeScannerPanel';
import { parseInvitationCode } from '@/services/api/invitationCode';
import { BackendApiError, joinListInvitation } from '@/services/api/backend';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';

type Props = { initialCode?: string; onJoined: (listId: string) => void | Promise<void> };

/** Joining never depends on the current shopping list or creates invitations. */
export function JoinListCard({ initialCode, onJoined }: Props) {
  const { theme } = useTheme();
  const [code, setCode] = useState(initialCode ?? '');
  const [scannerVisible, setScannerVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Saisis le code reçu ou scanne le QR code d’invitation.');
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function joinCode(value: string) {
    if (busyRef.current || !mounted.current) return;
    const invitation = parseInvitationCode(value);
    if (!invitation) { setMessage('Code d’invitation invalide.'); return; }
    setCode(invitation);
    busyRef.current = true; setBusy(true);
    setMessage('Ouverture de la liste partagée…');
    try {
      const id = await getAnonymousDeviceId();
      if (!mounted.current) return;
      const result = await joinListInvitation(id, invitation);
      if (mounted.current) await onJoined(result.list_id);
      if (mounted.current) { setCode(''); setMessage('Liste partagée ajoutée.'); }
    } catch (error) {
      if (mounted.current) {
        const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
        setMessage(error instanceof BackendApiError && error.status === 404
          ? 'Cette invitation est invalide ou a expiré. Demande un nouveau code.'
          : `Impossible de rejoindre la liste. Réessaie.${reference}`);
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  return <View style={{ gap: 12 }}>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>{message}</Text>
      <View style={{ gap: 8 }}>
        <TextInput accessibilityLabel="Code d’invitation reçu" autoCorrect={false} autoCapitalize="none" onChangeText={setCode} placeholder="Code reçu" testID="invitation-code-input" value={code}
          style={{ backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, flex: 1, padding: 10 }} />
        <Pressable disabled={busy || !code.trim()} onPress={() => void joinCode(code)} style={{ backgroundColor: theme.primary, borderRadius: theme.radius, justifyContent: 'center', paddingHorizontal: 14 }}>
          <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>Rejoindre</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
        Keyboard.dismiss(); setScannerVisible(true);
      }} style={{ backgroundColor: theme.primary, borderRadius: theme.radius, padding: 12 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: '700', textAlign: 'center' }}>Scanner une invitation</Text>
      </Pressable>
      {scannerVisible ? (
        <Modal visible animationType="none" presentationStyle="fullScreen"
          onRequestClose={() => setScannerVisible(false)} testID="invitation-scanner-modal">
          <SafeAreaView style={{ flex: 1, backgroundColor: theme.surface }}>
            <BarcodeScannerPanel mode="invitation" onCancel={() => setScannerVisible(false)} onScanned={(value) => {
              setScannerVisible(false);
              void joinCode(value);
            }} />
          </SafeAreaView>
        </Modal>
      ) : null}
  </View>;
}
