#!/usr/bin/env bash
# Aplica todas las migraciones en una base vacía y corre las pruebas de la base.
#
# Uso:
#   DATABASE_URL=postgres://usuario:clave@host:puerto/base npm run test:db
#
# Usá SIEMPRE una base de prueba descartable: el script la vacía al empezar.
# Simula las partes de Supabase que usan las migraciones (auth.users, auth.uid()).
set -euo pipefail

: "${DATABASE_URL:?Definí DATABASE_URL apuntando a una base de PRUEBA}"

if [[ "$DATABASE_URL" == *"supabase.co"* || "$DATABASE_URL" == *"supabase.com"* ]]; then
  echo "✗ Esto parece una base de Supabase. Este script borra datos: usalo sólo con una base de prueba." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q)

echo "→ Vaciando la base de prueba"
"${PSQL[@]}" -c "drop schema if exists public cascade; create schema public;"

echo "→ Simulación mínima de Supabase"
"${PSQL[@]}" -f supabase/tests/_stub_supabase.sql

for f in supabase/migrations/*.sql; do
  echo "→ Migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "→ Datos de ejemplo"
"${PSQL[@]}" -f supabase/seed.sql

for f in supabase/tests/[0-9]*.test.sql; do
  echo "→ Pruebas $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "✓ Base de datos: todas las pruebas pasaron"
