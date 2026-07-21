#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"; cd "$project_dir"
[[ -f .env ]] || { echo "Missing .env" >&2; exit 1; }; set -a; . ./.env; set +a
psql_args=(-v ON_ERROR_STOP=1 -h "$DB_HOST" -p "${DB_PORT:-5432}" -U "$DB_USER" -d "$DB_NAME")
PGPASSWORD="$DB_PASSWORD" psql "${psql_args[@]}" -f server/schema.sql
for migration in server/migrations/*.sql; do PGPASSWORD="$DB_PASSWORD" psql "${psql_args[@]}" -f "$migration"; done

