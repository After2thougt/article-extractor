#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ARTICLES_DIR="${PROJECT_DIR}/articles"

echo "[INFO] Starting cleanup in ${PROJECT_DIR}"

# 1. Delete everything inside articles/, but keep articles/ itself
if [[ -d "${ARTICLES_DIR}" ]]; then
    find "${ARTICLES_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
    echo "[PASS] articles/ contents removed"
else
    echo "[WARN] articles/ directory not found, skipping"
fi

# 2. Delete temporary files in project root
find "${PROJECT_DIR}" -maxdepth 1 -type f \
    \( -name "*.tmp" -o -name "*.temp" \) \
    -delete

echo "[PASS] Temporary files removed"

# 3. Delete project-root logs older than 7 days
find "${PROJECT_DIR}" -maxdepth 1 -type f \
    \( -name "*.log" -o -name "pm2-*.log" \) \
    -mtime +7 \
    -delete

echo "[PASS] Old logs removed"
echo "[INFO] Cleanup completed"
