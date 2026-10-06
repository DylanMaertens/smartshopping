// Browser-only adapter for the isolated preview, using its fictitious lists.
import { parseBackup, serializeBackup, type ListBackup } from '../src/services/backup/listBackup';
export async function exportBackupFile(backup: ListBackup) {
  const url = URL.createObjectURL(new Blob([serializeBackup(backup)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'SmartShopping-apercu.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function saveBackupOnDevice(backup: ListBackup): Promise<string | null> {
  await exportBackupFile(backup);
  // A browser download cannot confirm a native filesystem write.
  return null;
}
export async function importBackupFile(): Promise<ListBackup | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
    input.oncancel = () => resolve(null);
    input.onchange = async () => {
      try { resolve(input.files?.[0] ? parseBackup(await input.files[0].text()) : null); }
      catch (error) { reject(error); }
    };
    input.click();
  });
}
