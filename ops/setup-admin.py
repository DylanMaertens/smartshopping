#!/usr/bin/env python3
"""Provision the single local admin; no default password or secret CLI arguments."""
import argparse
import getpass
import json
import os
from pathlib import Path
import subprocess

def main():
    repo = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hasher', type=Path, help='Binaire admin-password-hash compilé (détection locale par défaut).')
    parser.add_argument('--output', type=Path, default=repo / '.local-dev/admin/credentials.json')
    args = parser.parse_args()
    if args.hasher is None:
        args.hasher = repo / 'backend/target/debug/admin-password-hash'
        settings = repo / '.local-dev/server-tools.json'
        if not args.hasher.is_file() and settings.is_file():
            backend = json.loads(settings.read_text()).get('backend')
            if backend:
                args.hasher = Path(backend).parent / 'admin-password-hash'
    if args.output.exists():
        parser.error('Fichier déjà présent. Pour une rotation, choisissez un nouveau --output puis changez ADMIN_CREDENTIALS_FILE et redémarrez le backend.')
    if not args.hasher.is_file():
        parser.error('Compiler d’abord : cargo build --manifest-path backend/Cargo.toml --bin admin-password-hash')
    username = input('Identifiant administrateur : ').strip()
    if not username or len(username.encode()) > 80:
        parser.error('Identifiant requis (80 octets maximum).')
    password = getpass.getpass('Mot de passe (14 caractères minimum) : ')
    if len(password) < 14 or len(password.encode()) > 1024 or '\n' in password or '\r' in password:
        parser.error('Mot de passe trop court ou trop long.')
    if password != getpass.getpass('Confirmer le mot de passe : '):
        parser.error('Les mots de passe diffèrent.')
    result = subprocess.run([str(args.hasher.resolve())], input=password, text=True, capture_output=True, check=True)
    password = None
    hashed = result.stdout.strip()
    if not hashed.startswith('$argon2id$v=19$m=19456,t=2,p=1$'):
        parser.error('Format de hachage inattendu.')
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump({'username': username, 'password_hash': hashed}, output)
        output.write('\n')
    print(f'Compte préparé dans {args.output}. Aucun mot de passe affiché. Activer ADMIN_CREDENTIALS_FILE et ADMIN_ORIGIN (ou ADMIN_ORIGIN_FILE), puis redémarrer le backend.')

if __name__ == '__main__':
    main()
