#!/bin/sh
# Starts (and on first use creates) the local Postgres the tests use: port 5433, data in /var/tmp/gpg.
P=/usr/lib/postgresql/16/bin
$P/pg_isready -q -p 5433 -h localhost && exit 0
if [ ! -f /var/tmp/gpg/PG_VERSION ]; then
  mkdir -p /var/tmp/gpg && chown postgres /var/tmp/gpg
  su postgres -c "$P/initdb -D /var/tmp/gpg -A trust" >/dev/null
fi
su postgres -c "$P/pg_ctl -D /var/tmp/gpg -o '-p 5433 -k /tmp' -l /var/tmp/gpg/log -w start" >/dev/null
$P/pg_isready -p 5433 -h localhost
