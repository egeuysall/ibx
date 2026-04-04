#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${IBX_INSTALL_BASE_URL:-https://ibx.egeuysal.com}"
BIN_DIR="${IBX_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/ibx"
TMP_FILE="$(mktemp "${TMPDIR:-/tmp}/ibx.XXXXXX")"

cleanup() {
  rm -f "$TMP_FILE"
}

trap cleanup EXIT

printf "installing ibx from %s\n" "$BASE_URL"
mkdir -p "$BIN_DIR"
if ! curl -fsSL "$BASE_URL/ibx" -o "$TMP_FILE"; then
  printf "failed to download %s/ibx\n" "$BASE_URL" >&2
  printf "check that the URL is reachable and the ibx binary is published in the deploy.\n" >&2
  exit 1
fi

chmod +x "$TMP_FILE"
mv "$TMP_FILE" "$TARGET"

if ! command -v ibx >/dev/null 2>&1; then
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      printf "\nadd this to your shell profile:\n"
      printf "  export PATH=\"%s:\$PATH\"\n" "$BIN_DIR"
      ;;
  esac
fi

printf "\ninstalled: %s\n" "$TARGET"
printf "try: ibx --help\n"
