#!/usr/bin/env python3
"""Provision the single local admin; no default password or secret CLI arguments."""
import argparse
import base64
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import secrets
import struct
import time
from urllib.parse import quote

def totp(secret, step):
    digest = hmac.new(secret, struct.pack('>Q', step), hashlib.sha1).digest()
    offset = digest[-1] & 15
    return f'{(struct.unpack(">I", digest[offset:offset+4])[0] & 0x7fffffff) % 1000000:06}'

def enroll_totp(username):
    secret = secrets.token_bytes(20)
    encoded = base64.b32encode(secret).decode().rstrip('=')
    # Never stdout/stderr, which may be collected by automation.
    with open('/dev/tty', 'w') as terminal:
        terminal.write('\nAjoutez un compte TOTP dans votre application d’authentification.\n'
                       'Émetteur : Poduna ; SHA-1 ; 6 chiffres ; période : 30 secondes.\n'
                       f'Clé à saisir : {encoded}\n'
                       f'URI : otpauth://totp/Poduna:{quote(username, safe="")}?secret={encoded}&issuer=Poduna&algorithm=SHA1&digits=6&period=30\n'
                       'Cette clé est privée : ne la partagez pas et ne la copiez pas dans le chat.\n')
        terminal.flush()
    for _ in range(3):
        code = getpass.getpass('Code à 6 chiffres affiché par l’application : ').strip()
        if len(code) != 6 or not code.isascii() or not code.isdigit():
            continue
        step = int(time.time()) // 30
        matches = [value for value in range(step-1, step+2) if hmac.compare_digest(totp(secret, value), code)]
        if matches:
            return secret.hex(), max(matches)
    raise ValueError('Appairage non confirmé. Aucun compte créé. Vérifiez l’heure du téléphone.')

def write_private_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(value, output)
        output.write('\n')
        output.flush()
        os.fsync(output.fileno())

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
    state_path = Path(str(args.output) + '.totp-state')
    if os.path.lexists(args.output) or os.path.lexists(state_path):
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
    try:
        secret, step = enroll_totp(username)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    args.output.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if args.output.parent.stat().st_mode & 0o077:
        parser.error('Le dossier de destination doit être privé (mode 700).')
    write_private_json(state_path, {'secret_id': hashlib.sha256(bytes.fromhex(secret)).hexdigest(), 'last_step': step})
    try:
        write_private_json(args.output, {'username': username, 'password_hash': hashed, 'totp_secret_hex': secret})
    except Exception:
        state_path.unlink()  # Only the new state just created by this invocation.
        raise
    print(f'Compte avec 2FA préparé dans {args.output}. Attendez le code suivant pour vous connecter. Activer ADMIN_CREDENTIALS_FILE et ADMIN_ORIGIN (ou ADMIN_ORIGIN_FILE), puis redémarrer le backend. Conserver les deux fichiers privés ensemble. Récupération : reprovisionner un nouveau compte depuis le terminal privé, puis redémarrer ; aucune désactivation web du 2FA.')

if __name__ == '__main__':
    main()
