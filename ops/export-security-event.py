#!/usr/bin/env python3
"""Send a strictly validated aggregate to a single HTTPS SIEM endpoint."""
import argparse
import json
import pathlib
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

from security_event import validate_event


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward the bearer token or event to a redirect destination.
        raise urllib.error.HTTPError(req.full_url, code, "redirect refused", headers, fp)


def send_event(event, url, token):
    validate_event(event)
    try:
        parsed = urllib.parse.urlsplit(url)
        valid = (parsed.scheme == "https" and parsed.hostname and parsed.port != 0
                 and not parsed.username and not parsed.password and not parsed.fragment
                 and not any(ord(c) <= 32 or ord(c) == 127 for c in url))
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("SIEM endpoint must be HTTPS without credentials or fragment")
    if not isinstance(token, str) or not token or any(ord(c) <= 32 or ord(c) >= 127 for c in token):
        raise ValueError("SIEM bearer token must be non-empty printable ASCII without whitespace")
    request = urllib.request.Request(
        url, data=json.dumps(event, separators=(",", ":"), allow_nan=False).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, method="POST",
    )
    opener = urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()),
    )
    try:
        with opener.open(request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise ValueError(f"SIEM rejected event with HTTP {response.status}")
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.close()
        # Do not print response bodies, Location headers, URLs or tokens.
        raise ValueError(f"SIEM rejected event with HTTP {code}; redirects are disabled") from None
    except (urllib.error.URLError, OSError) as exc:
        raise ValueError("SIEM delivery failed: network or TLS error") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("event", type=pathlib.Path)
    parser.add_argument("--url", required=True)
    parser.add_argument("--token-file", type=pathlib.Path, required=True)
    args = parser.parse_args()
    try:
        event = json.loads(args.event.read_text())
        token = args.token_file.read_text().rstrip("\r\n")
        send_event(event, args.url, token)
    except (ValueError, OSError):
        # CLI errors deliberately omit filenames and server-provided content.
        print("Security event delivery failed; verify aggregate, endpoint, token and connectivity.", file=sys.stderr)
        return 1
    print("Security aggregate accepted by the configured SIEM endpoint.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
