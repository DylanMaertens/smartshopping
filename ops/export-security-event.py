#!/usr/bin/env python3
"""Send an aggregate security event to an HTTPS SIEM endpoint."""
import argparse
import json
import pathlib
import ssl
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("event")
parser.add_argument("--url", required=True)
parser.add_argument("--token-file", required=True)
args = parser.parse_args()

if urllib.parse.urlparse(args.url).scheme != "https":
    raise SystemExit("SIEM endpoint must use HTTPS")
event = json.loads(pathlib.Path(args.event).read_text())
if event.get("schema") != "smartshopping.vault-audit-summary.v1":
    raise SystemExit("unsupported event schema")
body = json.dumps(event, separators=(",", ":")).encode()
token = pathlib.Path(args.token_file).read_text().strip()
request = urllib.request.Request(
    args.url,
    data=body,
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=10, context=ssl.create_default_context()) as response:
    if not 200 <= response.status < 300:
        raise SystemExit(f"SIEM rejected event with HTTP {response.status}")
