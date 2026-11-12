import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, Share, View } from 'react-native';
import { Button, PageModal, Pressable, Text, TextInput } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { InvitationSession } from '@/services/api/invitationSession';
import QRCode from 'react-native-qrcode-svg';
import {
  BackendApiError,
  createListInvitation,
  getListMembers,
  removeListMember,
  revokeListInvitation,
  type SharedListMember,
} from '@/services/api/backend';
import { getAnonymousDeviceId } from '@/services/identity/deviceIdentity';
import { getMemberAliases, saveMemberAlias } from '@/services/storage/memberAliases';

type Props = { session?: InvitationSession; listId: string; showInstructions?: boolean; canCreateInvitation?: boolean; onBeforeInvite: () => Promise<boolean>; onInvitationCreated?: () => void; onSharingChanged?: () => void };

export function ShareListCard(props: Props) {
  const [localSession] = useState(() => new InvitationSession());
  // The home screen keeps this session alive when the sharing panel closes.
  return <ListShareControls key={props.listId} {...props} session={props.session ?? localSession} />;
}

function ListShareControls({ session, listId, showInstructions = true, canCreateInvitation = true, onBeforeInvite, onInvitationCreated, onSharingChanged }: Props & { session: InvitationSession }) {
  const { theme } = useTheme();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const key = session.key(deviceId ?? '', listId);
  const entry = useSyncExternalStore(session.subscribe, () => session.get(key));
  const [expiryRevision, refreshExpiry] = useState(0);
  const invitation = entry.invitation;
  const expired = !!invitation && invitation.expires_at <= Date.now();
  const createdCode = invitation && !expired ? invitation.code : null;
  const [message, setMessage] = useState<string | null>(null);
  const [actionBusy, setBusy] = useState(false);
  const busy = actionBusy || entry.pending;
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [members, setMembers] = useState<SharedListMember[]>([]);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [memberName, setMemberName] = useState('');
  const [aliasError, setAliasError] = useState<string | null>(null);
  const canCreateRef = useRef(canCreateInvitation);
  canCreateRef.current = canCreateInvitation;
  const memberLabel = (id: string, fallback = '') => Object.prototype.hasOwnProperty.call(aliases, id) ? aliases[id] : fallback;

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
      {message ? <Text accessibilityLiveRegion="polite" style={{ color: theme.muted }}>{message}</Text>
        : showInstructions ? <Text style={{ color: theme.muted }}>Le partage reste facultatif et anonyme.</Text> : null}
      {expired ? <Text style={{ color: theme.muted }}>Ce code a expiré. Crée une nouvelle invitation.</Text> : null}
      {!createdCode && !canCreateInvitation ? <Text style={{ color: theme.muted }}>Créer un code d’invitation nécessite le premium. Rejoindre une liste et gérer un partage existant restent gratuits.</Text> : null}
      {!createdCode ? <Pressable disabled={busy || !canCreateInvitation} onPress={() => void run(async () => {
        if (!canCreateRef.current) return;
        setMessage('Préparation de la liste à partager…');
        const id = await getAnonymousDeviceId();
        if (!mounted.current) return;
        setDeviceId(id);
        const result = await session.create(session.key(id, listId), async () => {
          if (!await onBeforeInvite() || !canCreateRef.current) return null;
          const invitation = await createListInvitation(id, listId);
          onInvitationCreated?.();
          return invitation;
        });
        if (!mounted.current) return;
        if (!result) {
          setMessage(canCreateRef.current ? 'Connexion nécessaire pour préparer le partage. Tes articles restent enregistrés.' : 'Création annulée : le mode premium n’est plus actif.');
          return;
        }
        setMessage('Transmets ce code uniquement à une personne de confiance.');
      })} style={{ alignItems: 'center', backgroundColor: theme.primary, borderRadius: theme.radius, padding: 10 }}>
        <Text style={{ color: theme.onPrimary, fontWeight: '700' }}>{entry.pending ? 'Préparation du code…' : canCreateInvitation ? 'Créer un code d’invitation' : 'Créer un code · Premium'}</Text>
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
          message: `Rejoins ma liste Poduna : smartshopping://invite/${createdCode}\nCode : ${createdCode}`,
          url: `smartshopping://invite/${createdCode}`,
        }); })}><Text style={{ color: theme.primary, fontWeight: '700' }}>Partager avec une application</Text></Pressable>
        <Pressable disabled={busy} onPress={() => void run(async () => {
          const id = await getAnonymousDeviceId();
          await session.revoke(session.key(id, listId), () => revokeListInvitation(id, createdCode));
          onSharingChanged?.();
          if (mounted.current) setMessage('Invitation révoquée. Les membres déjà présents restent synchronisés.');
        })}><Text style={{ color: theme.danger, fontWeight: '700' }}>Révoquer ce code</Text></Pressable>
      </> : null}
      <Pressable disabled={busy} onPress={() => void run(async () => {
        const result = await getListMembers(await getAnonymousDeviceId(), listId);
        if (!mounted.current) return;
        setMembers(result); setMessage(`${result.length} membre(s) autorisé(s).`);
        try { setAliases(getMemberAliases(listId)); setAliasError(null); }
        catch { setAliasError('Impossible de lire les noms locaux. Les identifiants restent affichés.'); }
      })}><Text style={{ color: theme.muted, fontWeight: '700' }}>Gérer les membres</Text></Pressable>
      {showInstructions ? <Text style={{ color: theme.muted, fontSize: 13 }}>Révoquer un code bloque les nouvelles arrivées. Les membres déjà présents restent synchronisés. Pour couper leur accès, utilise Gérer les membres.</Text> : null}
      {aliasError && !editingMember ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{aliasError}</Text> : null}
      {members.map((member, index) => (
        <View key={member.device_id} style={{ gap: 8, paddingVertical: 8 }}>
          <Text style={{ fontWeight: '700' }}>{memberLabel(member.device_id, `Membre ${index + 1}`)}</Text>
          <Text selectable style={{ color: theme.muted, fontSize: 12 }}>{member.device_id}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Button variant="secondary" label="Renommer" accessibilityLabel={`Renommer ${memberLabel(member.device_id, `Membre ${index + 1}`)}`}
            onPress={() => { setEditingMember(member.device_id); setMemberName(memberLabel(member.device_id)); setAliasError(null); }} />
          <Pressable disabled={busy} onPress={() => void run(async () => {
            const id = await getAnonymousDeviceId();
            // Removing a member also revokes invitations on the server. Clear
            // the cached code even if this panel closes while awaiting the reply.
            await session.revoke(session.key(id, listId), () => removeListMember(id, listId, member.device_id));
            onSharingChanged?.();
            if (!mounted.current) return;
            setMembers((current) => current.filter((entry) => entry.device_id !== member.device_id));
            setMessage('Synchronisation coupée pour ce membre. Sa copie locale reste sur son appareil.');
          })}><Text style={{ color: theme.danger, fontWeight: '700' }}>Retirer</Text></Pressable>
          </View>
        </View>
      ))}
      {editingMember ? <PageModal title="Renommer le membre" onClose={() => { setEditingMember(null); setAliasError(null); }}>
        <Text>Ce nom reste privé sur cet appareil, uniquement pour cette liste. Il n’est pas envoyé aux autres membres.</Text>
        <TextInput autoFocus accessibilityLabel="Nom du membre" value={memberName} maxLength={80} onChangeText={value => { setMemberName(value); setAliasError(null); }}
          placeholder="Ex. Camille" />
        <Text style={{ color: theme.muted, fontSize: 14 }}>Laisse vide pour retirer le nom personnalisé.</Text>
        {aliasError ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{aliasError}</Text> : null}
        <Button label="Enregistrer le nom" onPress={() => {
          try { setAliases(saveMemberAlias(listId, editingMember, memberName)); setEditingMember(null); setAliasError(null); }
          catch { setAliasError('Impossible d’enregistrer ce nom. Réessaie.'); }
        }} />
        <Button label="Annuler" variant="ghost" onPress={() => { setEditingMember(null); setAliasError(null); }} />
      </PageModal> : null}
    </View>
  );
}
