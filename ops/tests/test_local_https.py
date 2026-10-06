import importlib.util
import json
from pathlib import Path
import socket
import tempfile
import unittest
import urllib.error
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('local_https', Path(__file__).parents[1] / 'local-https.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class LocalHttpsTests(unittest.TestCase):
    def test_only_exposes_backend_with_authentication(self):
        for status in (200, 400, 403, 404, 500):
            with patch.object(server, 'request', return_value=(status, b'')):
                with self.assertRaises(RuntimeError):
                    server.require_auth('http://127.0.0.1:3000')
        with patch.object(server, 'request', return_value=(401, b'')):
            server.require_auth('http://127.0.0.1:3000')

    def test_cleanup_does_not_remove_another_sessions_endpoint(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'api.json'
            with patch.object(server, 'MOBILE_CONFIG', path):
                server.atomic_json(path, {'apiBaseUrl': 'https://new.trycloudflare.com/api/v1'})
                server.remove_mobile_config('https://old.trycloudflare.com')
                self.assertTrue(path.exists())
                server.remove_mobile_config('https://new.trycloudflare.com')
                self.assertFalse(path.exists())
                server.remove_mobile_config('https://new.trycloudflare.com')

    def test_initial_dns_propagation_is_retried_instead_of_stopping_tunnel(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'Status': 3}).encode()
        error = urllib.error.URLError(socket.gaierror('not yet published'))
        with patch.object(server.urllib.request, 'urlopen', side_effect=[error, response]):
            self.assertFalse(server.backend_ready('https://new.trycloudflare.com'))

    def test_dns_fallback_is_restricted_and_keeps_tls_verification(self):
        error = urllib.error.URLError(socket.gaierror('not found'))
        with patch.object(server.urllib.request, 'urlopen', side_effect=error) as opener:
            self.assertFalse(server.backend_ready('https://unrelated.example.org'))
            self.assertEqual(opener.call_count, 1)
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'Answer': [{'type': 1, 'data': '104.16.230.132'}]}).encode()
        process = MagicMock(stdout=b'{"status":"ok"}\n200')
        with patch.object(server, 'DNS_FALLBACKS', {}), patch.object(server.urllib.request, 'urlopen', side_effect=[error, response]), patch.object(server.subprocess, 'run', return_value=process) as run:
            self.assertTrue(server.backend_ready('https://new.trycloudflare.com'))
            args = run.call_args.args[0]
            self.assertIn('new.trycloudflare.com:443:104.16.230.132', args)
            self.assertIn('https://new.trycloudflare.com/health', args)
            self.assertNotIn('--insecure', args)


if __name__ == '__main__':
    unittest.main()
