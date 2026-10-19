import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('pg_private', Path(__file__).resolve().parents[1] / 'pg-private.py')
pg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pg)

class PrivateConnectionTests(unittest.TestCase):
    def test_url_decoding_and_no_inherited_target(self):
        result = pg.connection_environment('postgresql://user:p%40ss@localhost:5433/shop?sslmode=verify-full',
            {'PATH': '/usr/bin', 'PGHOSTADDR': 'wrong', 'PGSERVICE': 'wrong', 'DATABASE_URL': 'private'})
        self.assertEqual(result, {'PATH': '/usr/bin', 'PGHOST': 'localhost', 'PGPORT': '5433', 'PGDATABASE': 'shop', 'PGUSER': 'user', 'PGPASSWORD': 'p@ss', 'PGSSLMODE': 'verify-full'})

    def test_unix_socket_and_unsupported_parameters(self):
        result = pg.connection_environment('postgresql:///shop?host=%2Ftmp%2Ffixture', {})
        self.assertEqual(result, {'PGDATABASE': 'shop', 'PGHOST': '/tmp/fixture'})
        for url in ['https://example.test/shop', 'postgresql:///shop?unknown=value', 'postgresql:///shop#fragment']:
            with self.assertRaises(ValueError): pg.connection_environment(url, {})
