#!/usr/bin/env python3
"""Verify the selected archive itself, even if its checksum names an old path."""
import argparse
import hashlib
from pathlib import Path
import re
import sys


def verify_backup(archive):
    archive = Path(archive)
    manifest = Path(str(archive) + '.sha256')
    # One SHA-256 line only. Old absolute paths are accepted as descriptive labels,
    # but are never opened: verification always covers the selected archive.
    with manifest.open(encoding='utf-8') as stream:
        text = stream.read(8193)
    match = re.fullmatch(r'([0-9a-fA-F]{64}) [ *]([^\r\n]+)\n?', text)
    if len(text) > 8192 or match is None:
        raise ValueError('Invalid checksum manifest: expected one SHA-256 entry')
    digest = hashlib.sha256()
    size = 0
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(chunk)
            digest.update(chunk)
    if not size or digest.hexdigest() != match[1].lower():
        raise ValueError('Backup is empty or its SHA-256 checksum does not match')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    try:
        verify_backup(args.archive)
    except (ValueError, OSError):
        print('Backup verification failed; database restoration has not started.', file=sys.stderr)
        return 1
    print('Backup checksum verified.', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
