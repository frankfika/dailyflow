#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="DailyFlow"
PROCESS_NAME="dailyflow"
BUNDLE_ID="com.dailyflow.app"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_BUNDLE="$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/$PROCESS_NAME"

pkill -x "$PROCESS_NAME" >/dev/null 2>&1 || true
pkill -f '/DailyFlow\.app/Contents/Resources/.*/dist-server/index\.cjs' >/dev/null 2>&1 || true

cd "$ROOT_DIR"

case "$MODE" in
  --debug|debug)
    npm run tauri -- dev
    exit 0
    ;;
  run|--logs|logs|--telemetry|telemetry|--verify|verify)
    npm run tauri -- build --bundles app
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac

if [[ ! -x "$APP_BINARY" ]]; then
  echo "built app binary not found: $APP_BINARY" >&2
  exit 1
fi

/usr/bin/open -n "$APP_BUNDLE"

case "$MODE" in
  --logs|logs)
    /usr/bin/log stream --info --style compact --predicate "process == \"$PROCESS_NAME\""
    ;;
  --telemetry|telemetry)
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    for _ in {1..20}; do
      if pgrep -x "$PROCESS_NAME" >/dev/null; then
        exit 0
      fi
      sleep 0.25
    done
    echo "$APP_NAME did not stay running after launch" >&2
    exit 1
    ;;
esac
