import contextlib
import importlib.util
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch, mock_open

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

setup = module('setup_admin', 'setup-admin.py')
https = module('local_https', 'local-https.py')

class AdminSetupTests(unittest.TestCase):
    def test_totp_reference_and_confirmation(self):
        secret = b'12345678901234567890'
        self.assertEqual(setup.totp(secret, 1), '287082')
        with patch.object(setup.secrets, 'token_bytes', return_value=secret), patch.object(setup.time, 'time', return_value=59), \
             patch('builtins.open', mock_open()), patch.object(setup.getpass, 'getpass', return_value='287082'):
            self.assertEqual(setup.enroll_totp('owner'), (secret.hex(), 1))
        with patch.object(setup.secrets, 'token_bytes', return_value=secret), patch.object(setup.time, 'time', return_value=59), \
             patch('builtins.open', mock_open()), patch.object(setup.getpass, 'getpass', return_value='invalid'):
            with self.assertRaisesRegex(ValueError, 'non confirmé'):
                setup.enroll_totp('owner')
    def test_contact_requires_explicit_admin(self):
        with patch.object(https.subprocess, 'Popen') as spawn:
            with self.assertRaisesRegex(RuntimeError, '--contact exige --admin'):
                https.run_server(3000, False, True)
            spawn.assert_not_called()

    def test_private_credentials_without_echo_or_overwrite(self):
        with tempfile.TemporaryDirectory(prefix='poduna-setup-test-') as directory:
            root = Path(directory)
            hasher = root / 'hasher'
            hasher.touch()
            target = root / 'admin' / 'credentials.json'
            password = 'A-test-password-not-deployed'
            hashed = '$argon2id$v=19$m=19456,t=2,p=1$test$test'
            result = type('Result', (), {'stdout': hashed + '\n'})()
            output = io.StringIO()
            args = ['setup-admin.py', '--hasher', str(hasher), '--output', str(target)]
            with patch('sys.argv', args), patch('builtins.input', return_value='owner'), \
                 patch.object(setup.getpass, 'getpass', return_value=password), \
                 patch.object(setup, 'enroll_totp', return_value=('ab'*20, 100)), \
                 patch.object(setup.subprocess, 'run', return_value=result) as run, contextlib.redirect_stdout(output):
                setup.main()
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            self.assertEqual(json.loads(target.read_text()), {'username': 'owner', 'password_hash': hashed, 'totp_secret_hex': 'ab'*20})
            state = Path(str(target) + '.totp-state')
            self.assertEqual(stat.S_IMODE(state.stat().st_mode), 0o600)
            self.assertEqual(json.loads(state.read_text())['last_step'], 100)
            self.assertNotIn('ab'*20, output.getvalue())
            self.assertEqual(run.call_args.kwargs['input'], password)
            self.assertNotIn(password, str(run.call_args.args))
            self.assertNotIn(password, output.getvalue())
            self.assertNotIn(hashed, output.getvalue())
            with patch('sys.argv', args), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                setup.main()
            self.assertEqual(json.loads(target.read_text())['password_hash'], hashed)

    def test_admin_tunnel_refuses_missing_credentials_and_running_backend(self):
        with tempfile.TemporaryDirectory(prefix='poduna-tunnel-test-') as directory:
            root = Path(directory)
            (root / 'https').mkdir()
            with patch.object(https, 'STATE', root), patch.object(https, 'HTTPS', root / 'https'), \
                 patch.object(https.os, 'access', return_value=True), patch.object(https, 'backend_ready', return_value=True), \
                 patch.object(https.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(RuntimeError, 'Créer le compte'):
                    https.run_server(3000, True)
                (root / 'admin').mkdir()
                (root / 'admin' / 'credentials.json').write_text('{}')
                origin = root / 'https' / 'admin-origin'
                origin.write_text('https://old.example')
                with self.assertRaisesRegex(RuntimeError, 'tourne déjà'):
                    https.run_server(3000, True)
                self.assertEqual(origin.read_text(), 'https://old.example')
                spawn.assert_not_called()

if __name__ == '__main__':
    unittest.main()
