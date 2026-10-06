import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { BackupPanel } from './BackupPanel';
import { ShoppingListStorage as Storage } from '@/services/storage/shoppingListStorage';
import { exportBackupFile, importBackupFile, saveBackupOnDevice } from '@/services/backup/backupFiles';
import type { ListBackup } from '@/services/backup/listBackup';

jest.mock('@/services/storage/shoppingListStorage', () => ({ ShoppingListStorage: { createBackup: jest.fn(), restoreBackup: jest.fn() } }));
jest.mock('@/services/backup/backupFiles', () => ({ exportBackupFile: jest.fn(), importBackupFile: jest.fn(), saveBackupOnDevice: jest.fn() }));
const backup: ListBackup = { format: 'smartshopping-lists', version: 1, backupId: 'a'.repeat(32), createdAt: '2026-10-03T12:00:00Z',
  lists: [{ name: 'Courses', categoryOrder: [], items: [{ name: 'Pain', quantity: 2, checked: true }] }] };
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(importBackupFile).mockResolvedValue(backup);
  jest.mocked(Storage.createBackup).mockReturnValue(backup);
  jest.mocked(Storage.restoreBackup).mockReturnValue(['copy']);
});
it('previews without writing, cancels without writes, then restores only after confirmation', async () => {
  const restored = jest.fn();
  const screen = render(<BackupPanel onRestored={restored} />);
  await act(async () => fireEvent.press(screen.getByText('Choisir une sauvegarde')));
  screen.getByText('1 liste(s) · 1 article(s)');
  expect(Storage.restoreBackup).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Annuler la restauration'));
  expect(Storage.restoreBackup).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Choisir une sauvegarde')));
  await act(async () => fireEvent.press(screen.getByText('Restaurer les listes')));
  expect(Storage.restoreBackup).toHaveBeenCalledWith(backup);
  expect(restored).toHaveBeenCalledWith(['copy']);
});
it('retains the preview when persistence fails and allows retry', async () => {
  jest.mocked(Storage.restoreBackup).mockImplementationOnce(() => { throw new Error('Stockage indisponible'); });
  const restored = jest.fn();
  const screen = render(<BackupPanel onRestored={restored} />);
  await act(async () => fireEvent.press(screen.getByText('Choisir une sauvegarde')));
  await act(async () => fireEvent.press(screen.getByText('Restaurer les listes')));
  screen.getByText('Stockage indisponible');
  expect(restored).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Restaurer les listes')));
  expect(restored).toHaveBeenCalledWith(['copy']);
});
it('handles picker cancellation and malformed files without a restore', async () => {
  jest.mocked(importBackupFile).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Fichier invalide'));
  const screen = render(<BackupPanel onRestored={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Choisir une sauvegarde')));
  expect(screen.queryByText('Restaurer les listes')).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Choisir une sauvegarde')));
  screen.getByText('Fichier invalide');
  expect(Storage.restoreBackup).not.toHaveBeenCalled();
});
it('exports a snapshot, prevents duplicate taps, and does not claim a file was saved', async () => {
  let finish!: () => void;
  jest.mocked(exportBackupFile).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const screen = render(<BackupPanel onRestored={jest.fn()} />);
  fireEvent.press(screen.getByText('Partager le fichier'));
  fireEvent.press(screen.getByText('Partager le fichier'));
  expect(exportBackupFile).toHaveBeenCalledTimes(1);
  expect(exportBackupFile).toHaveBeenCalledWith(backup);
  await act(async () => finish());
  screen.getByText(/Vérifie que le fichier/);
});
it('confirms device storage only after the write has been verified', async () => {
  let finish!: (filename: string) => void;
  jest.mocked(saveBackupOnDevice).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const screen = render(<BackupPanel onRestored={jest.fn()} />);
  fireEvent.press(screen.getByText('Enregistrer sur l’appareil'));
  fireEvent.press(screen.getByText('Enregistrer sur l’appareil'));
  expect(saveBackupOnDevice).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Sauvegarde enregistrée/)).toBeNull();
  await act(async () => finish('SmartShopping-test.json'));
  screen.getByText('Sauvegarde enregistrée dans le dossier choisi : SmartShopping-test.json');
  expect(exportBackupFile).not.toHaveBeenCalled();
});
it('does not claim success after cancellation or an unsuccessful save', async () => {
  jest.mocked(saveBackupOnDevice).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Espace insuffisant'));
  const screen = render(<BackupPanel onRestored={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByText('Enregistrer sur l’appareil')));
  expect(screen.queryByText(/Sauvegarde enregistrée/)).toBeNull();
  await act(async () => fireEvent.press(screen.getByText('Enregistrer sur l’appareil')));
  screen.getByText('Espace insuffisant');
  expect(screen.queryByText(/Sauvegarde enregistrée/)).toBeNull();
});
