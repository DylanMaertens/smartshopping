#!/usr/bin/env python3
"""Run pg_dump/pg_restore without putting a password-bearing URL in argv."""
import os
import sys
from urllib.parse import parse_qsl, unquote, urlsplit

PARAMETERS = {
    'host': 'PGHOST', 'hostaddr': 'PGHOSTADDR', 'port': 'PGPORT',
    'dbname': 'PGDATABASE', 'user': 'PGUSER', 'password': 'PGPASSWORD',
    'sslmode': 'PGSSLMODE', 'sslcert': 'PGSSLCERT', 'sslkey': 'PGSSLKEY',
    'sslrootcert': 'PGSSLROOTCERT', 'sslcrl': 'PGSSLCRL',
    'connect_timeout': 'PGCONNECT_TIMEOUT', 'application_name': 'PGAPPNAME',
    'channel_binding': 'PGCHANNELBINDING', 'options': 'PGOPTIONS',
    'target_session_attrs': 'PGTARGETSESSIONATTRS', 'passfile': 'PGPASSFILE',
}

def connection_environment(url, source):
    parsed = urlsplit(url)
    if parsed.scheme not in ('postgres', 'postgresql') or parsed.fragment:
        raise ValueError('Expected a PostgreSQL URI')
    env = dict(source)
    env.pop('DATABASE_URL', None)
    # Do not accidentally inherit a connection to another host/database.
    for key in ['PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE']:
        env.pop(key, None)
    for key, value in [('PGHOST', parsed.hostname), ('PGPORT', str(parsed.port) if parsed.port else None),
                       ('PGDATABASE', parsed.path[1:] or None), ('PGUSER', parsed.username), ('PGPASSWORD', parsed.password)]:
        if value is not None: env[key] = unquote(value)
    for key, value in parse_qsl(parsed.query, keep_blank_values=True, strict_parsing=True):
        if key not in PARAMETERS: raise ValueError('Unsupported PostgreSQL connection parameter')
        env[PARAMETERS[key]] = value
    return env

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ('pg_dump', 'pg_restore'):
        raise SystemExit('Expected pg_dump or pg_restore')
    try:
        env = connection_environment(os.environ['DATABASE_URL'], os.environ)
    except (KeyError, ValueError):
        raise SystemExit('Invalid or unsupported DATABASE_URL. No database operation started.')
    os.execvpe(sys.argv[1], sys.argv[1:], env)

if __name__ == '__main__':
    main()
