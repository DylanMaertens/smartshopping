#!/usr/bin/env python3
"""Fail if the deployment dependency graph enables the unpatched RSA/MySQL path.

This checks active default features for the requested target, NOT Cargo.lock
advisories. Keep cargo audit independently enabled, including RUSTSEC-2023-0071.
"""
import argparse
from pathlib import Path
import re
import subprocess
import sys


def check_tree(output):
    lines = output.splitlines()
    if not any(re.match(r'^shopping-list-backend v\S+', line) for line in lines):
        raise ValueError('Graphe Cargo vide ou inattendu : vérification impossible.')
    blocked = [line for line in lines if re.match(r'^(rsa|sqlx-mysql) v\S+', line)]
    if blocked:
        raise ValueError('Dépendance cryptographique interdite active : ' + ', '.join(blocked))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', default='x86_64-unknown-linux-gnu')
    args = parser.parse_args()
    manifest = Path(__file__).resolve().parents[1] / 'backend' / 'Cargo.toml'
    try:
        result = subprocess.run([
            'cargo', 'tree', '--locked', '--manifest-path', str(manifest),
            '--target', args.target, '--edges', 'normal,build', '--prefix', 'none',
            '--format', '{p}',
        ], check=True, capture_output=True, text=True, timeout=180)
        check_tree(result.stdout)
    except (OSError, subprocess.SubprocessError, ValueError) as error:
        # Do not mistake a failed Cargo invocation for an empty/safe graph.
        print(f'Échec du contrôle RSA : {error}', file=sys.stderr)
        return 1
    print(f'RSA et SQLx/MySQL absents des dépendances actives ({args.target}, fonctionnalités par défaut).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
