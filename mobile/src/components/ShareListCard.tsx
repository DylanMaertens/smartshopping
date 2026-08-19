import React, { useEffect, useState } from 'react';
import { Linking, Pressable, Share, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  BackendApiError,
  createListInvitation,
  getListMembers,
  joinListInvitation,
  removeListMember,
  revokeListInvitation,
  type SharedListMember,
} from '@/services/api/backend';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';

type Props = { listId: string; onJoined: (listId: string) => void };

export function ShareListCard({ listId, onJoined }: Props) {
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [message, setMessage] = useState('Le partage reste facultatif et anonyme.');
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState<SharedListMember[]>([]);

  useEffect(() => {
    const readInvitation = (url: string | null) => {
      const match = url?.match(/^smartshopping:\/\/invite\/([0-9a-f]{32})$/i);
      if (match) setCode(match[1]);
    };
    void Linking.getInitialURL().then(readInvitation);
    const subscription = Linking.addEventListener('url', ({ url }) => readInvitation(url));
    return () => subscription.remove();
  }, []);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch (error) {
      const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
      setMessage(`Partage indisponible.${reference}`);
    } finally { setBusy(false); }
  }

  return (
    <View style={{ backgroundColor: '#f8fafc', borderRadius: 16, gap: 10, padding: 16 }}>
      <Text style={{ color: '#334155', fontSize: 16, fontWeight: '700' }}>Partager cette liste</Text>
      <Text style={{ color: '#64748b' }}>{message}</Text>
      <Pressable disabled={busy} onPress={() => void run(async () => {
        const result = await createListInvitation(await getAnonymousDeviceId(), listId);
        setCreatedCode(result.code);
        setMessage('Code valable 24 heures. Transmets-le uniquement à une personne de confiance.');
      })} style={{ alignItems: 'center', backgroundColor: '#0f766e', borderRadius: 10, padding: 10 }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Créer un code d’invitation</Text>
      </Pressable>
      {createdCode ? <>
        <View accessible accessibilityLabel="QR code d’invitation" style={{ alignItems: 'center', padding: 8 }}>
          <QRCode size={150} value={`smartshopping://invite/${createdCode}`} />
        </View>
        <Text selectable style={{ color: '#0f172a', fontWeight: '800' }}>{createdCode}</Text>
        <Pressable onPress={() => void Share.share({
          message: `Rejoins ma liste SmartShopping avec ce code : ${createdCode}`,
          url: `smartshopping://invite/${createdCode}`,
        })}><Text style={{ color: '#0369a1', fontWeight: '700' }}>Partager avec une application</Text></Pressable>
        <Pressable onPress={() => void run(async () => {
          await revokeListInvitation(await getAnonymousDeviceId(), createdCode);
          setCreatedCode(null); setMessage('Invitation révoquée.');
        })}><Text style={{ color: '#b91c1c', fontWeight: '700' }}>Révoquer ce code</Text></Pressable>
      </> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput autoCapitalize="none" onChangeText={setCode} placeholder="Code reçu" testID="invitation-code-input" value={code}
          style={{ backgroundColor: '#fff', borderColor: '#cbd5e1', borderRadius: 10, borderWidth: 1, flex: 1, padding: 10 }} />
        <Pressable disabled={busy || !code.trim()} onPress={() => void run(async () => {
          const result = await joinListInvitation(await getAnonymousDeviceId(), code);
          onJoined(result.list_id); setCode(''); setMessage('Liste partagée ajoutée.');
        })} style={{ backgroundColor: '#334155', borderRadius: 10, justifyContent: 'center', paddingHorizontal: 14 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Rejoindre</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => void run(async () => {
        const result = await getListMembers(await getAnonymousDeviceId(), listId);
        setMembers(result); setMessage(`${result.length} membre(s) autorisé(s).`);
      })}><Text style={{ color: '#475569', fontWeight: '700' }}>Gérer les membres</Text></Pressable>
      {members.map((member) => (
        <View key={member.device_id} style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: '#64748b', flex: 1 }}>{member.device_id}</Text>
          <Pressable onPress={() => void run(async () => {
            await removeListMember(await getAnonymousDeviceId(), listId, member.device_id);
            setMembers((current) => current.filter((entry) => entry.device_id !== member.device_id));
            setMessage('Accès du membre révoqué.');
          })}><Text style={{ color: '#b91c1c', fontWeight: '700' }}>Retirer</Text></Pressable>
        </View>
      ))}
    </View>
  );
}
