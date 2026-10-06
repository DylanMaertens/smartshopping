import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Text } from '@/theme/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { ShoppingListStorage } from '@/services/storage/shoppingListStorage';
import { exportBackupFile, importBackupFile, saveBackupOnDevice } from '@/services/backup/backupFiles';
import type { ListBackup } from '@/services/backup/listBackup';

export function BackupPanel({ onRestored }: { onRestored: (ids: string[]) => void }) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState<ListBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); setMessage(null);
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Opération impossible. Réessaie.'); }
    finally { locked.current = false; setBusy(false); }
  }
  return <>
    {!draft ? <>
    <Text>Conserve tes listes, leurs articles et l’ordre de tes rayons dans un fichier, puis retrouve-les sur un autre téléphone.</Text>
    <Text style={{ color: theme.muted }}>Le fichier contient tes listes en clair. Choisis un emplacement privé pour le conserver. Aucun code d’invitation ni secret de connexion n’y est inclus.</Text>
    <Button label="Enregistrer sur l’appareil" disabled={busy} onPress={() => void run(async () => {
      const filename = await saveBackupOnDevice(ShoppingListStorage.createBackup());
      if (filename) setMessage(`Sauvegarde enregistrée dans le dossier choisi : ${filename}`);
    })} />
    <Button variant="secondary" label="Partager le fichier" disabled={busy} onPress={() => void run(async () => {
      await exportBackupFile(ShoppingListStorage.createBackup());
      setMessage('Vérifie que le fichier a bien été enregistré à l’emplacement choisi avant de changer de téléphone.');
    })} />
    <Button variant="secondary" label="Choisir une sauvegarde" disabled={busy || !!draft} onPress={() => void run(async () => {
      setDraft(await importBackupFile());
    })} />
    </> : null}
    {draft ? <View style={{ gap: 12, backgroundColor: theme.surface, borderRadius: theme.radius, padding: 16 }}>
      <Text style={{ fontWeight: '700' }}>Restaurer cette sauvegarde ?</Text>
      <Text>{draft.lists.length} liste(s) · {draft.lists.reduce((sum, list) => sum + list.items.length, 0)} article(s)</Text>
      <Text>Sauvegarde du {new Date(draft.createdAt).toLocaleString('fr-FR')}</Text>
      <Text>{draft.lists.slice(0, 5).map((list) => list.name).join(' · ')}{draft.lists.length > 5 ? '…' : ''}</Text>
      <Text>De nouvelles copies seront ajoutées. Tes listes actuelles seront conservées. Pour retrouver les membres d’une liste partagée, rejoins-la avec une invitation.</Text>
      <Button label="Restaurer les listes" disabled={busy} onPress={() => void run(async () => {
        const ids = ShoppingListStorage.restoreBackup(draft);
        setDraft(null);
        onRestored(ids);
      })} />
      <Button variant="ghost" label="Annuler la restauration" disabled={busy} onPress={() => { setDraft(null); setError(null); }} />
    </View> : null}
    {busy ? <Text accessibilityRole="alert">Traitement en cours…</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text> : null}
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </>;
}
