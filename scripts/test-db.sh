#!/usr/bin/env bash
# Aplica todas las migraciones en una base vacía y corre las pruebas de la base.
#
# Uso:
#   DATABASE_URL=postgres://usuario:clave@host:puerto/base npm run test:db
#
# Usá SIEMPRE una base de prueba descartable: el script la vacía al empezar.
set -euo pipefail

: "${DATABASE_URL:?Definí DATABASE_URL apuntando a una base de PRUEBA}"

cd "$(dirname "$0")/.."

echo "→ Vaciando la base de prueba"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; create schema public;"

for f in supabase/migrations/*.sql; do
  echo "→ Migración $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "→ Datos de ejemplo"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql

for f in supabase/tests/*.test.sql; do
  echo "→ Pruebas $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

echo "✓ Base de datos: todas las pruebas pasaron"
