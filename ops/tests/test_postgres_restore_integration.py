"""Opt-in integration tests. Both URLs must point to disposable, distinct databases."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid

OPS = Path(__file__).resolve().parents[1]
ENABLED = os.environ.get('RUN_POSTGRES_BACKUP_TESTS') == '1'


@unittest.skipUnless(ENABLED, 'requires two disposable PostgreSQL databases and explicit opt-in')
class PostgresRestoreIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.source = os.environ['TEST_BACKUP_SOURCE_URL']
        self.target = os.environ['TEST_BACKUP_TARGET_URL']
        self.assertNotEqual(self.source, self.target, 'Source and target must be distinct disposable databases')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.schema = 'backup_test_' + uuid.uuid4().hex
        for url in [self.source, self.target]:
            self.query(url, f'CREATE SCHEMA {self.schema}')
            self.addCleanup(self.query, url, f'DROP SCHEMA IF EXISTS {self.schema} CASCADE')
            for table in ['a_probe', 'z_probe']:
                marker = 'source' if url == self.source else 'original'
                self.query(url, f"CREATE TABLE {self.schema}.{table} (id int PRIMARY KEY, marker text); "
                               f"INSERT INTO {self.schema}.{table} VALUES (1, '{marker}')")

    def query(self, url, sql, env=None):
        result = subprocess.run(['psql', '-X', url, '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def backup(self):
        result = subprocess.run([str(OPS/'backup-postgres.sh'), str(self.root/'backups')],
                                env=dict(os.environ, DATABASE_URL=self.source), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return Path(result.stdout.strip())

    def restore(self, archive):
        return subprocess.run([str(OPS/'restore-postgres.sh'), str(archive)], cwd=self.root,
                              env=dict(os.environ, DATABASE_URL=self.target, CONFIRM_RESTORE='RESTORE'),
                              capture_output=True, text=True)

    def test_real_backup_restores_after_move(self):
        archive = self.backup()
        moved = self.root/'moved backup'
        shutil.move(archive.parent, moved)
        result = self.restore(moved/archive.name)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.query(self.target, f'SELECT marker FROM {self.schema}.z_probe'), 'source')

    def test_sql_error_rolls_back_all_restore_changes(self):
        archive = self.backup()
        # pg_restore drops z_probe before a_probe; the extra dependency prevents
        # dropping a_probe, so the earlier DROP must be rolled back too.
        self.query(self.target, f'CREATE TABLE {self.schema}.guard (ref int REFERENCES {self.schema}.a_probe(id))')
        result = self.restore(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('depend', result.stderr.lower())
        for table in ['a_probe', 'z_probe']:
            self.assertEqual(self.query(self.target, f'SELECT marker FROM {self.schema}.{table}'), 'original')

    def test_corruption_does_not_change_target(self):
        archive = self.backup()
        with archive.open('ab') as stream:
            stream.write(b'corruption')
        result = self.restore(archive)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('verification failed', result.stderr)
        self.assertEqual(self.query(self.target, f'SELECT marker FROM {self.schema}.z_probe'), 'original')

    def test_retention_probe_removes_expired_secrets_and_keeps_recent_device(self):
        env = dict(os.environ, DATABASE_URL=self.source, PGOPTIONS=f'-c search_path={self.schema}')
        for migration in sorted((OPS.parent/'backend/migrations').glob('*.sql')):
            result = subprocess.run(['psql', '-X', self.source, '-v', 'ON_ERROR_STOP=1', '-f', str(migration)],
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        self.query(self.source, "INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, auth_secret) "
                   "VALUES ('recent-probe', 0, (extract(epoch from now())*1000)::bigint, 'recent-secret')", env)
        self.query(self.source, "INSERT INTO anonymous_devices (device_id, first_seen_at, last_seen_at, auth_secret) "
                   "VALUES ('expired-probe', 0, 0, 'expired-secret'); "
                   "INSERT INTO deleted_lists (id, owner_device_id, deleted_at) VALUES ('expired-list', 'expired-probe', 0)", env)
        restored = self.restore(self.backup())
        self.assertEqual(restored.returncode, 0, restored.stderr)
        env = dict(env, DATABASE_URL=self.target)
        self.assertEqual(self.query(self.target, 'SELECT count(*) FROM anonymous_devices', env), '2')
        result = subprocess.run([str(OPS/'verify-retention-purge.sh')], cwd=self.root,
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Retention purge verified', result.stdout)
        self.assertEqual(self.query(self.target, 'SELECT count(*) FROM deleted_lists', env), '0')
        self.assertEqual(self.query(self.target, 'SELECT auth_secret FROM anonymous_devices', env), 'recent-secret')


if __name__ == '__main__':
    unittest.main()
