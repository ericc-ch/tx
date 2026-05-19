#!/bin/sh
set -eu

REMOTE="hp240g5"
REMOTE_PATH="$HOME/projects/tiket-tools"
PROJECT_ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

echo "Syncing to ${REMOTE}:${REMOTE_PATH}..."

rsync -avh --delete-after \
  --exclude='.references/' \
  --exclude='node_modules/' \
  "$PROJECT_ROOT/" "${REMOTE}:${REMOTE_PATH}/"

echo "Done!"
