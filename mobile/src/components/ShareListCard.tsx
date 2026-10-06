import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Share, View } from 'react-native';
import { Pressable, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { InvitationSession } from '@/services/api/invitationSession';
import QRCode from 'react-native-qrcode-svg';
import {
  BackendApiError,
  createListInvitation,
  deleteSharedList,
  getListMembers,
  removeListMember,
  revokeListInvitation,
  type SharedListMember,
} from '@/services/api/backend';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';

type Props = { session?: InvitationSession; listId: string; onDeleted: () => void; onBeforeInvite: () => Promise<boolean> };

export function ShareListCard(props: Props) {
  const [localSession] = useState(() => new InvitationSession());
  // The home screen keeps this session alive when the sharing panel closes.
  return <ListShareControls key={props.listId} {...props} session={props.session ?? localSession} />;
}

function ListShareControls({ session, listId, onDeleted, onBeforeInvite }: Props & { session: InvitationSession }) {
  const { theme } = useTheme();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const key = session.key(deviceId ?? '', listId);
  const entry = useSyncExternalStore(session.subscribe, () => session.get(key));
  const [expiryRevision, refreshExpiry] = useState(0);
  const invitation = entry.invitation;
  const expired = !!invitation && invitation.expires_at <= Date.now();
  const createdCode = invitation && !expired ? invitation.code : null;
  const [message, setMessage] = useState('Le partage reste facultatif et anonyme.');
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || entry.pending;
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [ownerControls, setOwnerControls] = useState(false);
  const [members, setMembers] = useState<SharedListMember[]>([]);

  useEffect(() => {
    mounted.current = true;
    void getAnonymousDeviceId().then((id) => { if (mounted.current) setDeviceId(id); }).catch(() => {
      if (mounted.current) setMessage('Partage indisponible. Réessaie dans un instant.');
    });
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const refresh = () => refreshExpiry((value) => value + 1);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    const delay = invitation ? invitation.expires_at - Date.now() : 0;
    const timer = delay > 0 ? setTimeout(refresh, Math.min(delay, 2_147_483_647)) : undefined;
    return () => { subscription.remove(); if (timer !== undefined) clearTimeout(timer); };
  }, [invitation, expiryRevision]);

  async function run(action: () => Promise<void>) {
    if (busyRef.current || entry.pending || !mounted.current) return;
    busyRef.current = true;
    setBusy(true);
    try { await action(); }
    catch (error) {
      const reference = error instanceof BackendApiError ? ` Référence : ${error.requestId}.` : '';
      if (mounted.current) setMessage(error instanceof BackendApiError && error.status === 403
        ? 'Cette action est réservée au propriétaire de la liste.' : `Partage indisponible.${reference}`);
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: theme.radius, gap: 10, padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>Partager cette liste</Text>
      <Text style={{ color: theme.muted }}>{message}</Text>
      {expired ? <Text style={{ color: theme.muted }}>Ce code a expiré. Crée une nouvelle invitation.</Text> : null}
      {!createdCode ? <Pressable disabled={busy} onPress={() => void run(async () => {
        setMessage('Préparation de la liste à partager…');
        const id = await getAnonymousDeviceId();
        if (!mounted.current) return;
        setDeviceId(id);
        const result = await session.create(session.key(id, listId), async () => {
          if (!await onBeforeInvite()) return null;
          return createListInvitation(id, listId);
        });
        if (!mounted.current) return;
        if (!result) {
          setMessage('Connexion nécessaire pour préparer le partage. Tes articles restent enregistrés.');
          return;
        }
        setOwnerControls(true);
        setMessage('Transmets ce code uniquement à une personne de confiance.');
      })} style={{ alignItems: 'center', backgroundColor: theme.primary, borderRadius: theme.radius, padding: 10 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{entry.pending ? 'Préparation du code…' : 'Créer un code d’invitation'}</Text>
      </Pressable> : null}
      {createdCode && invitation ? <>
        <Text style={{ color: theme.muted }}>Valable jusqu’au {new Date(invitation.expires_at).toLocaleString('fr-FR', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}.</Text>
        <View accessible accessibilityLabel="QR code d’invitation" style={{ alignItems: 'center', alignSelf: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 12 }}>
          <QRCode size={150} value={`smartshopping://invite/${createdCode}`} />
        </View>
        <Text selectable style={{ color: theme.text, fontWeight: '800' }}>{createdCode}</Text>
        <Pressable disabled={busy} onPress={() => void run(async () => {
          if (!invitation || invitation.expires_at <= Date.now()) { refreshExpiry((value) => value + 1); return; }
          await Share.share({
          message: `Rejoins ma liste SmartShopping : smartshopping://invite/${createdCode}\nCode : ${createdCode}`,
          url: `smartshopping://invite/${createdCode}`,
        }); })}><Text style={{ color: theme.primary, fontWeight: '700' }}>Partager avec une application</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void run(async () => {
          const id = await getAnonymousDeviceId();
          await session.revoke(session.key(id, listId), () => revokeListInvitation(id, createdCode));
          if (mounted.current) setMessage('Invitation révoquée. Les membres déjà présents restent synchronisés.');
        })}><Text style={{ color: theme.danger, fontWeight: '700' }}>Révoquer ce code</Text></Pressable>
      </> : null}
      <Pressable disabled={busy} onPress={() => void run(async () => {
        const result = await getListMembers(await getAnonymousDeviceId(), listId);
        if (!mounted.current) return;
        setOwnerControls(true); setMembers(result); setMessage(`${result.length} membre(s) autorisé(s).`);
      })}><Text style={{ color: theme.muted, fontWeight: '700' }}>Gérer les membres</Text></Pressable>
      <Text style={{ color: theme.muted, fontSize: 13 }}>Révoquer un code bloque les nouvelles arrivées. Les membres déjà présents restent synchronisés. Pour couper leur accès, utilise Gérer les membres.</Text>
      {members.map((member) => (
        <View key={member.device_id} style={{ alignItems: 'center', flexDirection: 'row', gap: 8 }}>
          <Text numberOfLines={1} style={{ color: theme.muted, flex: 1 }}>{member.device_id}</Text>
          <Pressable disabled={busy} onPress={() => void run(async () => {
            await removeListMember(await getAnonymousDeviceId(), listId, member.device_id);
            if (!mounted.current) return;
            setMembers((current) => current.filter((entry) => entry.device_id !== member.device_id));
            setMessage('Synchronisation coupée pour ce membre. Sa copie locale reste sur son appareil.');
          })}><Text style={{ color: theme.danger, fontWeight: '700' }}>Retirer</Text></Pressable>
        </View>
      ))}
      {ownerControls || createdCode ? <Pressable disabled={busy} onPress={() => Alert.alert(
        'Supprimer définitivement la liste ?',
        'Les articles, membres et invitations seront supprimés du serveur. Cette action est irréversible.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => void run(async () => {
            await deleteSharedList(await getAnonymousDeviceId(), listId);
            session.clear(key);
            if (mounted.current) onDeleted();
          }) },
        ],
      )}><Text style={{ color: theme.danger, fontWeight: '800' }}>Supprimer définitivement</Text></Pressable> : null}
    </View>
  );
}
