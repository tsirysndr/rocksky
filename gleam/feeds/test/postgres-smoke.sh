#!/bin/sh
# An isolated PostgreSQL cluster; never connects to the application's database.
set -eu
feeds_test_dir=$(mktemp -d /tmp/rocksky-feeds-pg.XXXXXX)
cleanup() {
  if test -f "$feeds_test_dir/data/postmaster.pid"; then
    pg_ctl -D "$feeds_test_dir/data" -m immediate stop >/dev/null
  fi
  rm -rf "$feeds_test_dir"
}
trap cleanup EXIT INT TERM
initdb -D "$feeds_test_dir/data" -A trust --no-locale >"$feeds_test_dir/init.log" 2>&1
mkdir "$feeds_test_dir/socket"
pg_ctl -D "$feeds_test_dir/data" -l "$feeds_test_dir/server.log" -o "-k $feeds_test_dir/socket -c listen_addresses='' -p 56432" -w start >/dev/null
FEEDS_TEST_DATABASE_URL="postgresql://$(id -un)@localhost/postgres?host=$feeds_test_dir/socket&port=56432" node --test feeds/test/*.test.mjs
