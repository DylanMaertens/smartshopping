#!/usr/bin/env python3
"""Integration tests in an ephemeral PostgreSQL database; never reads the app DSN.

Requires initdb/pg_ctl/createdb on PATH (or PODUNA_TEST_PG_BIN), cargo and optionally
the Playwright variables documented in docs/ADMINISTRATION.md. --browser runs UI QA.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from urllib.parse import quote

root = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--browser', action='store_true')
    parser.add_argument('--backups', action='store_true', help='Restore only into two extra disposable databases.')
    args = parser.parse_args()
    pg = os.environ.get('PODUNA_TEST_PG_BIN')
    def tool(name):
        value = str(Path(pg) / name) if pg else shutil.which(name)
        if not value:
            raise RuntimeError(f'Outil manquant : {name}')
        return value
    with tempfile.TemporaryDirectory(prefix='poduna-workflows-pg-') as temp:
        data = str(Path(temp) / 'data')
        subprocess.run([tool('initdb'), '-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8'], check=True, stdout=subprocess.DEVNULL)
        subprocess.run([tool('pg_ctl'), '-D', data, '-l', str(Path(temp) / 'server.log'), '-o', f"-k {temp} -h ''", '-w', 'start'], check=True, stdout=subprocess.DEVNULL)
        try:
            subprocess.run([tool('createdb'), '-h', temp, 'workflow_test'], check=True)
            env = dict(os.environ, TEST_DATABASE_URL=f'postgresql:///workflow_test?host={quote(temp, safe="")}')
            for target in ['admin', 'community_catalog', 'postgres_sync', 'database_role', 'access_security']:
                subprocess.run(['cargo', 'test', '--manifest-path', 'backend/Cargo.toml', '--locked', '--offline', '--test', target, '--', '--ignored', '--test-threads=1'], cwd=root, env=env, check=True)
            if args.backups:
                for name in ['backup_source', 'backup_target']:
                    subprocess.run([tool('createdb'), '-h', temp, name], check=True)
                backup_env = dict(env, RUN_POSTGRES_BACKUP_TESTS='1',
                    TEST_BACKUP_SOURCE_URL=f'postgresql:///backup_source?host={quote(temp, safe="")}',
                    TEST_BACKUP_TARGET_URL=f'postgresql:///backup_target?host={quote(temp, safe="")}',
                    PATH=str(Path(tool('psql')).parent) + os.pathsep + env['PATH'])
                subprocess.run(['python3', '-m', 'unittest', 'discover', '-s', 'ops/tests', '-p', 'test_postgres_restore_integration.py'], cwd=root, env=backup_env, check=True)
            if args.browser:
                # Separate DB: UI assertions see only their own fixtures.
                subprocess.run([tool('createdb'), '-h', temp, 'browser_test'], check=True)
                env['TEST_DATABASE_URL'] = f'postgresql:///browser_test?host={quote(temp, safe="")}'
                env['PODUNA_TEST_PSQL'] = tool('psql')
                subprocess.run(['node', 'web/scripts/check-live-workflows.mjs'], cwd=root, env=env, check=True)
        finally:
            subprocess.run([tool('pg_ctl'), '-D', data, '-m', 'fast', '-w', 'stop'], check=True, stdout=subprocess.DEVNULL)

if __name__ == '__main__':
    main()
