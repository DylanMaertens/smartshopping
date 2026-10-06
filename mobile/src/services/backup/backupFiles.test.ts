import { beforeEach, expect, it, vi } from 'vitest';
import { MAX_BACKUP_BYTES, type ListBackup } from './listBackup';
import { exportBackupFile, importBackupFile, saveBackupOnDevice } from './backupFiles';
const mocks = vi.hoisted(() => ({
  picker: vi.fn(), available: vi.fn(), share: vi.fn(), text: vi.fn(), remove: vi.fn(),
  create: vi.fn(), write: vi.fn(), size: 10, directoryPicker: vi.fn(), createDocument: vi.fn(),
}));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: mocks.picker }));
vi.mock('expo-sharing', () => ({ isAvailableAsync: mocks.available, shareAsync: mocks.share }));
vi.mock('expo-file-system', () => ({
  Directory: class {
    static pickDirectoryAsync = mocks.directoryPicker;
    constructor(public uri: string) {}
    createFile = mocks.createDocument;
  },
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    uri: string;
    constructor(path: string | { uri: string }, name?: string) { this.uri = typeof path === 'string' ? path : path.uri + name; }
    get size() { return mocks.size; }
    create = mocks.create; write = mocks.write; text = mocks.text; delete = mocks.remove;
  },
}));
const backup: ListBackup = { format: 'smartshopping-lists', version: 1, backupId: 'a'.repeat(32), createdAt: '2026-10-03T12:00:00Z', lists: [{ name: 'Courses', categoryOrder: [], items: [] }] };
beforeEach(() => {
  vi.resetAllMocks(); mocks.size = 10;
  mocks.directoryPicker.mockResolvedValue({ uri: 'content://documents/selected-folder' });
  mocks.createDocument.mockImplementation((name: string) => ({ name, write: mocks.write, text: mocks.text, delete: mocks.remove }));
  mocks.picker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/picked.json' }] });
  mocks.text.mockResolvedValue(JSON.stringify(backup));
  mocks.available.mockResolvedValue(true);
});
it('reads a selected file then removes only its temporary cache copy', async () => {
  expect(await importBackupFile()).toEqual(backup);
  expect(mocks.picker).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: true, multiple: false }));
  expect(mocks.remove).toHaveBeenCalledTimes(1);
});
it('does not delete an original document outside the cache', async () => {
  mocks.picker.mockResolvedValue({ canceled: false, assets: [{ uri: 'content://documents/original.json' }] });
  await importBackupFile();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('handles cancellation without reading or deleting a file', async () => {
  mocks.picker.mockResolvedValue({ canceled: true });
  expect(await importBackupFile()).toBeNull();
  expect(mocks.text).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it('rejects oversized files before reading them even without picker size metadata', async () => {
  mocks.size = MAX_BACKUP_BYTES + 1;
  await expect(importBackupFile()).rejects.toThrow(/4 Mo/);
  expect(mocks.text).not.toHaveBeenCalled();
  expect(mocks.remove).toHaveBeenCalled();
});
it('cleans the cache after invalid JSON and never returns an unvalidated document', async () => {
  mocks.text.mockResolvedValue('{');
  await expect(importBackupFile()).rejects.toThrow(/valide/);
  expect(mocks.remove).toHaveBeenCalled();
});
it('shares a JSON file and keeps it available for the recipient', async () => {
  await exportBackupFile(backup);
  expect(JSON.parse(mocks.write.mock.calls[0][0])).toEqual(backup);
  expect(mocks.share).toHaveBeenCalledWith(expect.stringMatching(/SmartShopping-.*\.json$/), expect.objectContaining({ mimeType: 'application/json' }));
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('does not create an export when file sharing is unavailable', async () => {
  mocks.available.mockResolvedValue(false);
  await expect(exportBackupFile(backup)).rejects.toThrow(/pas disponible/);
  expect(mocks.create).not.toHaveBeenCalled();
});
it('saves directly to the selected folder and verifies the resulting content', async () => {
  const filename = await saveBackupOnDevice(backup);
  expect(filename).toMatch(/^SmartShopping-2026-10-03-.*\.json$/);
  expect(mocks.createDocument).toHaveBeenCalledWith(filename, 'application/json');
  expect(JSON.parse(mocks.write.mock.calls[0][0])).toEqual(backup);
  expect(mocks.text).toHaveBeenCalledOnce();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.share).not.toHaveBeenCalled();
});
it.each(['ERR_PICKER_CANCELLED', 'ERR_FILE_PICKING_CANCELLED'])('handles native cancellation %s without writing', async (code) => {
  mocks.directoryPicker.mockRejectedValue({ code });
  expect(await saveBackupOnDevice(backup)).toBeNull();
  expect(mocks.createDocument).not.toHaveBeenCalled();
});
it('reports denied folder access without treating it as cancellation', async () => {
  mocks.directoryPicker.mockRejectedValue({ code: 'ERR_PERMISSION' });
  await expect(saveBackupOnDevice(backup)).rejects.toThrow(/ouvrir ce dossier/);
  expect(mocks.createDocument).not.toHaveBeenCalled();
});
it('does not delete any previous file when creation fails', async () => {
  mocks.createDocument.mockImplementation(() => { throw new Error('Already exists'); });
  await expect(saveBackupOnDevice(backup)).rejects.toThrow(/enregistrée et vérifiée/);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('cleans an incomplete new document after a write error', async () => {
  mocks.write.mockImplementation(() => { throw new Error('Disk full'); });
  await expect(saveBackupOnDevice(backup)).rejects.toThrow(/espace disponible/);
  expect(mocks.remove).toHaveBeenCalledOnce();
});
it('rejects truncated output and removes only the newly created document', async () => {
  mocks.text.mockResolvedValue('{');
  await expect(saveBackupOnDevice(backup)).rejects.toThrow(/enregistrée et vérifiée/);
  expect(mocks.remove).toHaveBeenCalledOnce();
});
