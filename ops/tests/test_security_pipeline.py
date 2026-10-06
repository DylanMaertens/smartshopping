"""Audit and HTTP regressions; all network responses are supplied in memory."""
import base64
from email.message import Message
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import urllib.response

OPS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(OPS))
from security_event import validate_event, SCHEMA


def load(name):
    spec = importlib.util.spec_from_file_location(name, OPS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audit = load('check-vault-audit')
export = load('export-security-event')


def pair(path, identifier, error=''):
    return [dict(type=kind, request=dict(path=path, id=identifier), error=error if kind == 'response' else '')
            for kind in ['request', 'response']]


def valid_log():
    return pair('transit/encrypt/smartshopping-device-secrets', 'encrypt') + pair('transit/decrypt/smartshopping-device-secrets', 'decrypt')


def summarize(items, expect=False):
    return audit.summarize(map(json.dumps, items), expect)


class AuditTests(unittest.TestCase):
    def test_successful_pairs_produce_only_fixed_aggregate(self):
        records = valid_log()
        records[0]['auth'] = {'client_token': 'a-secret-token'}
        event, passed = summarize(records)
        self.assertTrue(passed)
        self.assertEqual(event, dict(schema=SCHEMA, vault_audit_entries=4, vault_errors=0, status='ok'))
        self.assertNotIn('a-secret-token', json.dumps(event))

    def test_request_only_does_not_prove_operation_succeeded(self):
        with self.assertRaises(ValueError):
            summarize(valid_log()[::2])

    def test_orphan_or_mismatched_response_is_rejected(self):
        for change in ['orphan', 'path']:
            records = valid_log()
            if change == 'orphan':
                records.pop(0)
            else:
                records[1]['request']['path'] = audit.PROBE_PATH
            with self.subTest(change=change), self.assertRaises(ValueError):
                summarize(records)

    def test_failed_required_operation_does_not_prove_success(self):
        records = valid_log()
        records[1]['error'] = 'permission denied'
        with self.assertRaises(ValueError):
            summarize(records)

    def test_expected_denial_still_emits_alert(self):
        records = valid_log() + pair(audit.PROBE_PATH, 'denial', '1 error occurred: permission denied')
        event, passed = summarize(records, True)
        self.assertTrue(passed)
        self.assertEqual(event['status'], 'alert')
        self.assertEqual(event['vault_errors'], 1)
        self.assertFalse(summarize(records)[1])

    def test_denial_logged_on_both_request_and_response_is_one_probe(self):
        records = valid_log() + pair(audit.PROBE_PATH, 'denial', 'permission denied')
        records[-2]['error'] = 'permission denied'
        event, passed = summarize(records, True)
        self.assertTrue(passed)
        self.assertEqual(event['vault_errors'], 2)

    def test_missing_duplicate_or_wrong_denial_fails(self):
        cases = [valid_log(),
                 valid_log() + pair(audit.PROBE_PATH, 'one', 'permission denied') + pair(audit.PROBE_PATH, 'two', 'permission denied'),
                 valid_log() + pair(audit.PROBE_PATH, 'one', 'invalid ciphertext')]
        for records in cases:
            with self.subTest(records=records):
                self.assertFalse(summarize(records, True)[1])

    def test_expected_denial_does_not_hide_another_error(self):
        records = valid_log() + pair(audit.PROBE_PATH, 'one', 'permission denied') + pair('auth/token/lookup', 'two', 'other error')
        event, passed = summarize(records, True)
        self.assertFalse(passed)
        self.assertEqual(event['vault_errors'], 2)

    def test_unexpected_error_remains_exportable_as_alert(self):
        event, passed = summarize(valid_log() + pair('auth/token/lookup', 'other', 'failure'))
        self.assertFalse(passed)
        self.assertEqual(event['status'], 'alert')
        validate_event(event)

    def test_canaries_in_plaintext_or_base64_are_rejected(self):
        for value in ['device-secret-before', base64.b64encode(b'device-secret-after').decode()]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                audit.summarize([value])

    def test_bad_json_and_bad_metadata_are_rejected(self):
        for line in ['{broken', '{"type":"request"}', '{"type":"response","request":null}']:
            with self.subTest(line=line), self.assertRaises(ValueError):
                audit.summarize([line])

    def test_startup_messages_are_ignored(self):
        event, passed = audit.summarize(['Vault server started!', 'null'] + list(map(json.dumps, valid_log())))
        self.assertTrue(passed)
        self.assertEqual(event['vault_audit_entries'], 4)

    def test_duplicate_entries_are_rejected(self):
        with self.assertRaises(ValueError):
            summarize(valid_log() + [valid_log()[0]])

    def test_failed_cli_removes_stale_aggregate_without_echoing_log(self):
        with tempfile.TemporaryDirectory() as temp:
            log, output = Path(temp)/'audit.log', Path(temp)/'event.json'
            log.write_text('{secret broken')
            output.write_text('{}')
            result = subprocess.run([sys.executable, '-B', str(OPS/'check-vault-audit.py'), str(log), '--output', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertFalse(output.exists())
            self.assertNotIn('secret broken', result.stderr)


class FakeTransport(urllib.request.BaseHandler):
    def __init__(self, code=204, destination='https://other.example/collect'):
        self.code, self.destination, self.requests = code, destination, []

    def https_open(self, request):
        self.requests.append(request)
        headers = Message()
        if 300 <= self.code < 400:
            headers['Location'] = self.destination
        response = urllib.response.addinfourl(io.BytesIO(b'server-secret-content'), headers, request.full_url, self.code)
        response.msg = 'fixture'
        return response

    http_open = https_open


class ExportTests(unittest.TestCase):
    def setUp(self):
        blocker = patch.object(urllib.request.HTTPHandler, 'http_open', side_effect=AssertionError('unexpected HTTP request'))
        blocker.start()
        self.addCleanup(blocker.stop)
        self.event = dict(schema=SCHEMA, vault_audit_entries=4, vault_errors=0, status='ok')

    def test_https_post_sends_exact_schema(self):
        transport = FakeTransport()
        with patch.object(export.urllib.request.HTTPSHandler, 'https_open', side_effect=transport.https_open):
            export.send_event(self.event, 'https://siem.example/ingest', 'fixture-token')
        request, = transport.requests
        self.assertEqual(request.get_method(), 'POST')
        self.assertEqual(json.loads(request.data), self.event)
        self.assertEqual(request.get_header('Authorization'), 'Bearer fixture-token')

    def test_all_redirects_refused_before_second_request(self):
        for code in [301, 302, 303, 307, 308]:
            for destination in ['https://other.example/collect', 'http://siem.example/collect', 'https://siem.example/other']:
                transport = FakeTransport(code, destination)
                with self.subTest(code=code, destination=destination):
                    with patch.object(export.urllib.request.HTTPSHandler, 'https_open', side_effect=transport.https_open), self.assertRaises(ValueError):
                        export.send_event(self.event, 'https://siem.example/ingest', 'fixture-token')
                    self.assertEqual(len(transport.requests), 1)

    def test_extra_fields_and_invalid_counters_rejected_before_network(self):
        for event in [dict(self.event, secret='private'), dict(self.event, vault_errors=True),
                      dict(self.event, vault_errors=5), dict(self.event, vault_audit_entries=-1),
                      dict(self.event, status='alert'), [], dict(self.event, vault_errors=float('nan'))]:
            with self.subTest(event=event), patch.object(export.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    export.send_event(event, 'https://siem.example', 'fixture-token')
                opener.assert_not_called()

    def test_invalid_endpoint_rejected_before_network(self):
        for url in ['http://siem.example', 'https://', 'https://user:pass@siem.example',
                    'https://siem.example/#fragment', 'https://siem.example:bad', 'https://siem.example/\n']:
            with self.subTest(url=url), patch.object(export.urllib.request, 'build_opener') as opener:
                with self.assertRaises(ValueError):
                    export.send_event(self.event, url, 'fixture-token')
                opener.assert_not_called()

    def test_blank_or_injected_token_rejected(self):
        for token in ['', ' ', 'abc\r\nInjected: yes', 'é']:
            with self.subTest(token=token), self.assertRaises(ValueError):
                export.send_event(self.event, 'https://siem.example', token)

    def test_http_failure_never_echoes_server_content(self):
        transport = FakeTransport(403)
        with patch.object(export.urllib.request.HTTPSHandler, 'https_open', side_effect=transport.https_open):
            with self.assertRaises(ValueError) as raised:
                export.send_event(self.event, 'https://siem.example', 'fixture-token')
        self.assertNotIn('server-secret-content', str(raised.exception))
        self.assertNotIn('fixture-token', str(raised.exception))

    def test_tls_network_failure_never_echoes_url(self):
        with patch.object(export.urllib.request.OpenerDirector, 'open', side_effect=urllib.error.URLError('secret-url')):
            with self.assertRaises(ValueError) as raised:
                export.send_event(self.event, 'https://siem.example', 'fixture-token')
        self.assertNotIn('secret-url', str(raised.exception))


if __name__ == '__main__':
    unittest.main()
