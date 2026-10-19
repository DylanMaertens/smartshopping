#!/usr/bin/env python3
"""Redacted Gitleaks scan of tracked + non-ignored source files, including local edits.

Never scans ignored local credential/build directories. Does not change Git.
Set GITLEAKS to the installed executable if not on PATH.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
paths = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root)
with tempfile.TemporaryDirectory(prefix='poduna-source-secret-scan-') as temporary:
    for raw in set(paths.split(b'\0')) - {b''}:
        relative = Path(os.fsdecode(raw))
        source = root / relative
        if not source.exists():  # locally deleted tracked file: covered by git history scan
            continue
        if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root):
            raise SystemExit(f'Unsupported source entry (not followed): {relative}')
        target = Path(temporary) / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    result = subprocess.run([os.environ.get('GITLEAKS', 'gitleaks'), 'dir', '--redact=100', '--no-banner', temporary])
    raise SystemExit(result.returncode)
