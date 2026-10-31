import importlib.util
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    'crypto_guard', Path(__file__).resolve().parents[1] / 'check-backend-crypto.py')
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class CryptoGuardTests(unittest.TestCase):
    def test_accepts_postgres_graph(self):
        guard.check_tree('shopping-list-backend v0.1.0 (/project/backend)\nsqlx-postgres v0.8.6\n')

    def test_rejects_rsa_and_mysql_including_duplicate_markers(self):
        for dependency in ['rsa v0.9.10', 'rsa v0.10.0-rc.18 (*)', 'sqlx-mysql v0.8.6']:
            with self.subTest(dependency=dependency), self.assertRaises(ValueError):
                guard.check_tree('shopping-list-backend v0.1.0\n' + dependency)

    def test_empty_or_unexpected_output_is_not_safe(self):
        for output in ['', 'warning: nothing to print', 'unrelated-backend v1.0.0']:
            with self.subTest(output=output), self.assertRaises(ValueError):
                guard.check_tree(output)

    def test_cargo_failure_is_not_safe(self):
        with patch('sys.argv', ['check-backend-crypto.py']), \
                patch.object(guard.subprocess, 'run', side_effect=subprocess.CalledProcessError(101, 'cargo')):
            self.assertEqual(guard.main(), 1)

    def test_target_and_locked_build_graph_are_checked(self):
        with patch('sys.argv', ['check-backend-crypto.py', '--target', 'aarch64-unknown-linux-gnu']), \
                patch.object(guard.subprocess, 'run', return_value=subprocess.CompletedProcess(
                    [], 0, stdout='shopping-list-backend v0.1.0\nsqlx-postgres v0.8.6\n')) as run:
            self.assertEqual(guard.main(), 0)
            arguments = run.call_args.args[0]
            self.assertIn('--locked', arguments)
            self.assertIn('normal,build', arguments)
            self.assertIn('aarch64-unknown-linux-gnu', arguments)


if __name__ == '__main__':
    unittest.main()
