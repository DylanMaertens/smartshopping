#!/usr/bin/env python3
"""Run the existing local backend behind a temporary HTTPS tunnel (Linux)."""
import argparse
import fcntl
import json
import ipaddress
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPO = Path(__file__).resolve().parent.parent
STATE = REPO / '.local-dev'
HTTPS = STATE / 'https'
MOBILE_CONFIG = REPO / 'mobile' / '.local-api.json'
DNS_FALLBACKS = {}
URL_PATTERN = re.compile(r'https://[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b')


def atomic_json(path, value):
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


def request(url, body=None):
    headers = {'Content-Type': 'application/json'} if body is not None else {}
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=5) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except urllib.error.URLError as error:
        # Some home resolvers cache NXDOMAIN for newly created tunnel names.
        # Resolve only our Cloudflare hostname via HTTPS; curl still verifies
        # the original hostname's TLS certificate. Never use --insecure.
        parsed = urllib.parse.urlsplit(url)
        if not isinstance(error.reason, socket.gaierror) or not URL_PATTERN.fullmatch('https://' + parsed.netloc):
            raise
        host = parsed.hostname
        if host not in DNS_FALLBACKS:
            query = 'https://cloudflare-dns.com/dns-query?' + urllib.parse.urlencode({'name': host, 'type': 'A'})
            req = urllib.request.Request(query, headers={'accept': 'application/dns-json'})
            with urllib.request.urlopen(req, timeout=5) as response:
                answers = json.load(response).get('Answer', [])
            addresses = [entry['data'] for entry in answers if entry.get('type') == 1
                         and ipaddress.ip_address(entry['data']).is_global]
            if not addresses:
                raise OSError('Adresse du tunnel pas encore publiée dans le DNS public.') from error
            DNS_FALLBACKS[host] = addresses[0]
            print('DNS local indisponible pour le tunnel ; contrôle HTTPS via le DNS public. '
                  'Si le téléphone ne se connecte pas en Wi-Fi, essayer la 4G/5G.', flush=True)
        args = ['curl', '--silent', '--show-error', '--max-time', '8', '--proto', '=https',
                '--resolve', f'{host}:443:{DNS_FALLBACKS[host]}', '--write-out', '\n%{http_code}', url]
        if data is not None:
            args += ['--header', 'Content-Type: application/json', '--data-binary', '@-']
        result = subprocess.run(args, input=data, capture_output=True, check=True).stdout
        content, status = result.rsplit(b'\n', 1)
        return int(status), content


def backend_ready(origin):
    try:
        status, data = request(origin + '/health')
        return status == 200 and json.loads(data).get('status') == 'ok'
    except (OSError, ValueError, subprocess.CalledProcessError):
        return False


def require_auth(origin):
    status, _ = request(origin + '/api/v1/sync', {'list_id': 'https-auth-probe', 'items': [], 'last_sync': 0})
    if status != 401:
        raise RuntimeError('Le backend doit refuser la synchronisation sans identité (HTTP 401).')


def remove_mobile_config(url):
    # Do not erase another session's configuration.
    try:
        if json.loads(MOBILE_CONFIG.read_text()).get('apiBaseUrl') == url + '/api/v1':
            MOBILE_CONFIG.unlink()
    except (FileNotFoundError, ValueError):
        pass


def tool(name, settings):
    configured = settings.get(name)
    candidate = configured or shutil.which(name)
    if not candidate or not os.access(candidate, os.X_OK):
        raise RuntimeError(f'Outil manquant : {name}. Voir docs/SERVEUR_LOCAL_HTTPS.md.')
    return str(candidate)


def run_server(port):
    settings_path = STATE / 'server-tools.json'
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    cloudflared = settings.get('cloudflared', str(STATE / 'bin/cloudflared'))
    if not os.access(cloudflared, os.X_OK):
        raise RuntimeError('Installer le tunnel : bash ops/install-local-https.sh')
    origin = f'http://127.0.0.1:{port}'
    stop = HTTPS / 'stop'
    stop.unlink(missing_ok=True)
    stopping = False
    children = []
    logs = []
    pg_owned = False
    pg_ctl = None
    url = None

    def on_signal(*_):
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    def interrupted():
        return stopping or stop.exists()

    def spawn(args, log_name, env=None):
        log = (HTTPS / log_name).open('w')
        logs.append(log)
        process = subprocess.Popen(args, cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT)
        children.append(process)
        return process

    try:
        if backend_ready(origin):
            print('Backend existant réutilisé ; ses données et sa session restent en place.', flush=True)
        else:
            # Fail before touching the database if an unrelated service holds the port.
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', port))
            binary = tool('backend', settings)
            pg_isready = tool('pg_isready', settings)
            pg_ctl = tool('pg_ctl', settings)
            pg_socket = STATE / 'socket'
            pg_socket.mkdir(exist_ok=True)
            pg_data = STATE / 'postgres'
            ready = subprocess.run([pg_isready, '-h', str(pg_socket)], stdout=subprocess.DEVNULL).returncode == 0
            if not ready:
                if not (pg_data / 'PG_VERSION').exists():
                    subprocess.run([tool('initdb', settings), '-D', str(pg_data), '--auth=trust', '--no-locale', '--encoding=UTF8'], check=True)
                subprocess.run([pg_ctl, '-D', str(pg_data), '-l', str(HTTPS / 'postgres.log'),
                                '-o', f"-h '' -k '{pg_socket}'", '-w', 'start'], check=True)
                pg_owned = True
            psql = tool('psql', settings)
            exists = subprocess.check_output([psql, '-h', str(pg_socket), '-d', 'postgres', '-Atc',
                                              "SELECT 1 FROM pg_database WHERE datname='smartshopping_dev'"]).strip()
            if exists != b'1':
                subprocess.run([tool('createdb', settings), '-h', str(pg_socket), 'smartshopping_dev'], check=True)
            key = STATE / 'device-secret-key'
            if not key.exists():
                # Existing identities cannot be recovered using a newly invented key.
                if (STATE / 'device-registry.json').exists():
                    raise RuntimeError('Clé appareil manquante : restaurer device-secret-key avant de démarrer.')
                import base64
                key.write_text(base64.b64encode(os.urandom(32)).decode() + '\n')
            env = dict(os.environ, HOST='127.0.0.1', PORT=str(port), ENABLE_SYNC_ENDPOINT='true',
                       REQUIRE_DEVICE_SIGNATURES='true', DEVICE_SECRET_KEY_FILE=str(key),
                       DEVICE_REGISTRY_PATH=str(STATE / 'device-registry.json'),
                       DATABASE_URL='postgresql:///smartshopping_dev?host=' + urllib.parse.quote(str(pg_socket), safe=''))
            ocr_python = STATE / 'ocr/venv/bin/python'
            if ocr_python.exists() and (STATE / 'ocr/models/rec.onnx').exists():
                env.update(OCR_PYTHON=str(ocr_python), OCR_MODELS_DIR=str(STATE / 'ocr/models'))
            backend = spawn([binary], 'backend.log', env)
            deadline = time.monotonic() + 30
            while not backend_ready(origin):
                if interrupted():
                    return
                if backend.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('Backend indisponible. Voir .local-dev/https/backend.log.')
                time.sleep(.25)
        require_auth(origin)
        if interrupted():
            return
        # An explicit empty config avoids inheriting unrelated user tunnel rules.
        config = HTTPS / 'cloudflared.yml'
        config.write_text('{}\n')
        tunnel = spawn([cloudflared, 'tunnel', '--config', str(config), '--no-autoupdate',
                        '--protocol', 'http2', '--url', origin], 'tunnel.log')
        deadline = time.monotonic() + 90
        while not interrupted():
            if tunnel.poll() is not None:
                raise RuntimeError('Tunnel arrêté. Voir .local-dev/https/tunnel.log.')
            match = URL_PATTERN.search((HTTPS / 'tunnel.log').read_text())
            if match:
                url = match.group()
                if backend_ready(url):
                    require_auth(url)
                    break
            if time.monotonic() > deadline:
                raise RuntimeError('HTTPS non joignable après 90 secondes. Voir .local-dev/https/tunnel.log.')
            time.sleep(.5)
        else:
            return
        atomic_json(MOBILE_CONFIG, {'apiBaseUrl': url + '/api/v1'})
        atomic_json(HTTPS / 'status.json', {'url': url, 'apiBaseUrl': url + '/api/v1', 'backend': origin})
        print(f'\nServeur HTTPS prêt : {url}\nAPI : {url}/api/v1\n'
              'Recharge Expo Go sur les deux téléphones.\n'
              'PC allumé, session ouverte : Ctrl+C pour arrêter. Les données restent conservées.\n'
              'Depuis un autre terminal : python3 ops/local-https.py stop', flush=True)
        while not interrupted():
            if any(child.poll() is not None for child in children):
                raise RuntimeError('Un service s’est arrêté. Consulter .local-dev/https/*.log puis relancer.')
            time.sleep(.5)
    finally:
        if url:
            remove_mobile_config(url)
        (HTTPS / 'status.json').unlink(missing_ok=True)
        for process in reversed(children):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
        for log in logs:
            log.close()
        if pg_owned:
            subprocess.run([pg_ctl, '-D', str(STATE / 'postgres'), '-m', 'fast', '-w', 'stop'], check=False)
        stop.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', choices=['start', 'status', 'stop'], default='start')
    parser.add_argument('--port', type=int, default=3000)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Choisir un port entre 1024 et 65535.')
    os.umask(0o077)
    HTTPS.mkdir(parents=True, exist_ok=True)
    with (HTTPS / 'lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            running = False
        except BlockingIOError:
            running = True
        if args.action == 'stop':
            if running:
                (HTTPS / 'stop').touch()
            print('Arrêt demandé.' if running else 'Serveur HTTPS déjà arrêté.')
        elif args.action == 'status' or running:
            status = HTTPS / 'status.json'
            if running and status.exists():
                print(status.read_text())
            else:
                print('Démarrage en cours.' if running else 'Serveur HTTPS arrêté.')
        else:
            run_server(args.port)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Échec : {error}', file=sys.stderr)
        sys.exit(1)
