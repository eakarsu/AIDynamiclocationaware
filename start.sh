#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")" && pwd)"; cd "$project_dir"
[[ -f .env ]] || { echo "Missing .env; copy .env.example and configure it." >&2; exit 1; }
[[ -d node_modules ]] || { echo "Dependencies missing; run scripts/bootstrap.sh." >&2; exit 1; }
set -a; . ./.env; set +a
export API_PORT="${API_PORT:-${BACKEND_PORT:-${PORT:-4001}}}"
if [[ "${NODE_ENV:-}" == test ]]; then
  export LOCATION_SUBJECT_HMAC_SECRET="${LOCATION_SUBJECT_HMAC_SECRET:-runtime-location-subject-hmac-secret}"
fi
exec npm start
