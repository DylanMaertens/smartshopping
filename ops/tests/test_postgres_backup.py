"""Portable backups and fail-closed restore tests; no database needed."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

OPS = Path(__file__).resolve().parents[1]


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.trace = self.root / 'restore.json'
        self.env = dict(os.environ, DATABASE_URL='postgresql://fixture', CONFIRM_RESTORE='RESTORE',
                        PATH=str(self.bin)+os.pathsep+os.environ['PATH'], RESTORE_TRACE=str(self.trace))
        dump = self.bin / 'pg_dump'
        dump.write_text('#!' + sys.executable + '''
import os, pathlib, sys
path = next(arg.split('=',1)[1] for arg in sys.argv if arg.startswith('--file='))
pathlib.Path(path).write_bytes(b'' if os.environ.get('EMPTY_DUMP') else b'fixture dump')
sys.exit(int(os.environ.get('DUMP_EXIT', '0')))
''')
        restore = self.bin / 'pg_restore'
        restore.write_text('#!' + sys.executable + '''
import json, os, pathlib, sys
pathlib.Path(os.environ['RESTORE_TRACE']).write_text(json.dumps(sys.argv[1:]))
sys.exit(int(os.environ.get('RESTORE_EXIT', '0')))
''')
        dump.chmod(0o755)
        restore.chmod(0o755)

    def run_script(self, name, *args, env=None):
        return subprocess.run([str(OPS / name), *map(str, args)], cwd=self.root,
                              env=env or self.env, capture_output=True, text=True)

    def backup(self):
        result = self.run_script('backup-postgres.sh', self.root / 'backups with spaces')
        self.assertEqual(result.returncode, 0, result.stderr)
        path = Path(result.stdout.strip())
        self.assertTrue(path.is_file())
        return path

    def test_moved_backup_restores_from_another_directory(self):
        original = self.backup()
        copied = self.root / 'relocated'
        shutil.move(original.parent, copied)
        selected = copied / original.name
        result = self.run_script('restore-postgres.sh', selected)
        self.assertEqual(result.returncode, 0, result.stderr)
        args = json.loads(self.trace.read_text())
        self.assertIn('--single-transaction', args)
        self.assertIn('--exit-on-error', args)
        self.assertEqual(args[-1], str(selected))

    def test_concurrent_backups_do_not_overwrite_each_other(self):
        with ThreadPoolExecutor(max_workers=3) as executor:
            paths = list(executor.map(lambda _: self.backup(), range(3)))
        self.assertEqual(len(set(paths)), 3)
        self.assertTrue(all(path.read_bytes() == b'fixture dump' for path in paths))

    def test_backup_and_manifest_are_private(self):
        path = self.backup()
        for item in [path.parent, path, Path(str(path)+'.sha256')]:
            self.assertEqual(item.stat().st_mode & 0o077, 0)
        manifest = Path(str(path)+'.sha256').read_text()
        self.assertNotIn(str(path.parent), manifest)

    def test_failed_or_empty_dump_leaves_no_published_backup(self):
        for overrides in [dict(DUMP_EXIT='1'), dict(EMPTY_DUMP='1')]:
            with self.subTest(overrides=overrides):
                destination = self.root / 'failures'
                result = self.run_script('backup-postgres.sh', destination, env=dict(self.env, **overrides))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                self.assertEqual(list(destination.iterdir()), [])

    def test_corrupt_selected_archive_cannot_validate_using_another_file(self):
        archive = self.backup()
        other = self.root / 'other.dump'
        other.write_bytes(archive.read_bytes())
        digest = hashlib.sha256(other.read_bytes()).hexdigest()
        Path(str(archive)+'.sha256').write_text(f'{digest}  {other}\n')
        archive.write_bytes(b'corruption')
        result = self.run_script('restore-postgres.sh', archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.trace.exists())

    def test_legacy_manifest_works_after_original_path_disappears(self):
        archive = self.backup()
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        Path(str(archive)+'.sha256').write_text(f'{digest}  /old/machine/backup.dump\n')
        result = self.run_script('restore-postgres.sh', archive)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_or_invalid_manifests_never_start_restore(self):
        archive = self.backup()
        manifest = Path(str(archive)+'.sha256')
        valid = manifest.read_text()
        for text in [None, '', valid+valid, 'not a hash', 'x'*9000]:
            with self.subTest(text=str(text)[:30]):
                if text is None:
                    manifest.unlink()
                else:
                    manifest.write_text(text)
                result = self.run_script('restore-postgres.sh', archive)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.trace.exists())

    def test_confirmation_is_still_required(self):
        archive = self.backup()
        result = self.run_script('restore-postgres.sh', archive, env=dict(self.env, CONFIRM_RESTORE=''))
        self.assertEqual(result.returncode, 2)
        self.assertFalse(self.trace.exists())

    def test_restore_failure_is_propagated(self):
        archive = self.backup()
        result = self.run_script('restore-postgres.sh', archive, env=dict(self.env, RESTORE_EXIT='7'))
        self.assertEqual(result.returncode, 7)


if __name__ == '__main__':
    unittest.main()
