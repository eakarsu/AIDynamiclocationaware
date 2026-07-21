#!/usr/bin/env bash
set -euo pipefail
[[ "${CONFIRM_DEMO_SEED:-}" == "yes" ]] || { echo "Refusing demo seed. Set CONFIRM_DEMO_SEED=yes only for an isolated database." >&2; exit 1; }
project_dir="$(cd "$(dirname "$0")/.." && pwd)"; cd "$project_dir"; node server/seed.js

