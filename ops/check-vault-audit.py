#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys

parser = argparse.ArgumentParser(description="Validate a redacted Vault audit stream")
parser.add_argument("path", nargs="?", default="vault-audit.log")
parser.add_argument("--output", help="write a SIEM-safe aggregate (never raw audit entries)")
args = parser.parse_args()
path = pathlib.Path(args.path)
entries = []
for line in path.read_text(errors="replace").splitlines():
    try:
        value = json.loads(line)
    except json.JSONDecodeError:
        continue
    if value.get("type") in {"request", "response"}:
        entries.append(value)

serialized = json.dumps(entries)
if "device-secret-before" in serialized or "device-secret-after" in serialized:
    print("Vault audit leaked plaintext", file=sys.stderr)
    raise SystemExit(1)
paths = [entry.get("request", {}).get("path", "") for entry in entries]
required = {"transit/encrypt/smartshopping-device-secrets", "transit/decrypt/smartshopping-device-secrets"}
missing = required.difference(paths)
if missing:
    print("Missing audited Transit operations: " + ", ".join(sorted(missing)), file=sys.stderr)
    raise SystemExit(1)
errors = sum(bool(entry.get("error")) for entry in entries)
summary = {
    "schema": "smartshopping.vault-audit-summary.v1",
    "vault_audit_entries": len(entries),
    "vault_errors": errors,
    "status": "alert" if errors else "ok",
}
if args.output:
    pathlib.Path(args.output).write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary))
raise SystemExit(1 if errors else 0)
