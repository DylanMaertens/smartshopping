#!/usr/bin/env python3
"""Check Transit request/response evidence and emit a fixed safe aggregate."""
import argparse
import base64
import json
import pathlib
import sys

from beta_evidence import write_json
from security_event import SCHEMA, validate_event

REQUIRED = {"transit/encrypt/smartshopping-device-secrets", "transit/decrypt/smartshopping-device-secrets"}
PROBE_PATH = "transit/decrypt/smartshopping-denied-probe"
CANARIES = ("device-secret-before", "device-secret-after")


def summarize(lines, expect_denial=False):
    entries, requests, responses = 0, {}, {}
    canaries = CANARIES + tuple(base64.b64encode(v.encode()).decode() for v in CANARIES)
    for line in lines:
        if any(value in line for value in canaries):
            raise ValueError("Vault audit contains a plaintext test secret")
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            if line.lstrip().startswith("{"):
                raise ValueError("malformed JSON in Vault audit") from None
            continue  # Docker also includes ordinary Vault startup messages.
        if not isinstance(item, dict) or item.get("type") not in ("request", "response"):
            continue
        request = item.get("request")
        if not isinstance(request, dict):
            raise ValueError("audit entry is missing request metadata")
        path, identifier = request.get("path"), request.get("id")
        if not isinstance(path, str) or not path or not isinstance(identifier, str) or not identifier:
            raise ValueError("audit entry is missing request path or id")
        error = item.get("error", "")
        if error is None:
            error = ""
        if not isinstance(error, str):
            raise ValueError("invalid audit error field")
        record = (path, error)
        target = requests if item["type"] == "request" else responses
        if identifier in target:
            raise ValueError("duplicate audit request or response")
        target[identifier] = record
        entries += 1
    successful = set()
    denied = 0
    unexpected = 0
    errors = 0
    for identifier, (path, error) in requests.items():
        if error:
            errors += 1
            if path != PROBE_PATH or "permission denied" not in error.lower():
                unexpected += 1
        if path in REQUIRED or path == PROBE_PATH:
            if identifier not in responses or responses[identifier][0] != path:
                raise ValueError("Transit request has no matching response")
    for identifier, (path, error) in responses.items():
        if path in REQUIRED or path == PROBE_PATH:
            if identifier not in requests or requests[identifier][0] != path:
                raise ValueError("Transit response has no matching request")
        if error:
            errors += 1
            if path == PROBE_PATH and "permission denied" in error.lower():
                denied += 1
            else:
                unexpected += 1
        elif path in REQUIRED and not requests[identifier][1]:
            successful.add(path)
    if REQUIRED - successful:
        raise ValueError("missing successful audited Transit encrypt/decrypt operations")
    summary = validate_event({"schema": SCHEMA, "vault_audit_entries": entries,
                              "vault_errors": errors, "status": "alert" if errors else "ok"})
    passed = not unexpected and ((denied == 1) if expect_denial else denied == 0)
    return summary, passed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=pathlib.Path, default=pathlib.Path("vault-audit.log"))
    parser.add_argument("--output", type=pathlib.Path)
    parser.add_argument("--expect-denial", action="store_true", help="require exactly one permission denial on the dedicated CI probe path")
    args = parser.parse_args()
    # A failed check must never leave an old success event available for export.
    if args.output and args.output.resolve() == args.path.resolve():
        parser.error("output must differ from the input audit log")
    try:
        if args.output:
            args.output.unlink(missing_ok=True)
        with args.path.open() as stream:
            summary, passed = summarize(stream, args.expect_denial)
        if args.output:
            write_json(args.output, summary)
    except (ValueError, OSError):
        print("Vault audit validation failed; no aggregate is available for export.", file=sys.stderr)
        return 1
    print(json.dumps(summary))
    if not passed:
        print("Vault audit contains unexpected errors or the expected denial is missing.", file=sys.stderr)
    return int(not passed)


if __name__ == "__main__":
    raise SystemExit(main())
