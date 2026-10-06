import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup, type ListBackup } from './listBackup';

/** Write to the user-selected folder, outside the disposable application cache. */
export async function saveBackupOnDevice(backup: ListBackup): Promise<string | null> {
  const text = serializeBackup(backup);
  let directory: Directory;
  try {
    const selected = await Directory.pickDirectoryAsync();
    directory = new Directory(selected.uri);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'ERR_PICKER_CANCELLED' || code === 'ERR_FILE_PICKING_CANCELLED') return null;
    throw new Error('Impossible d’ouvrir ce dossier. Réessaie ou choisis un autre emplacement.');
  }
  let file: File | undefined;
  try {
    file = directory.createFile(backupFilename(backup), 'application/json');
    file.write(text);
    if (await file.text() !== text) throw new Error('Incomplete backup write');
    return file.name;
  } catch {
    // Only the newly created document is removed, never a previous backup.
    try { file?.delete(); } catch { /* The provider may no longer grant access. */ }
    throw new Error('La sauvegarde n’a pas pu être enregistrée et vérifiée. Vérifie l’espace disponible ou choisis un autre dossier.');
  }
}

function backupFilename(backup: ListBackup): string {
  return `SmartShopping-${backup.createdAt.slice(0, 10)}-${backup.backupId}.json`;
}

export async function exportBackupFile(backup: ListBackup): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
  const text = serializeBackup(backup);
  const filename = backupFilename(backup);
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(text);
  // Keep the cache copy alive: a chosen recipient may read it after the picker closes.
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Enregistrer ma sauvegarde' });
}

export async function importBackupFile(): Promise<ListBackup | null> {
  const selection = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (selection.canceled) return null;
  const asset = selection.assets[0];
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? 0) > MAX_BACKUP_BYTES || file.size > MAX_BACKUP_BYTES) {
      throw new Error('Ce fichier dépasse la limite de 4 Mo.');
    }
    return parseBackup(await file.text());
  } finally {
    // Delete only the private cache copy, never the user's original document.
    const cachePrefix = Paths.cache.uri.replace(/\/+$/, '') + '/';
    if (file.uri.startsWith(cachePrefix)) {
      try { file.delete(); } catch { /* The OS may have already reclaimed it. */ }
    }
  }
}
