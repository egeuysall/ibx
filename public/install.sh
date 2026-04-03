#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${IBX_INSTALL_BASE_URL:-https://ibx.egeuysal.com}"
BIN_DIR="${IBX_BIN_DIR:-$HOME/.local/bin}"
TARGET="$BIN_DIR/ibx"

printf "installing ibx from %s\n" "$BASE_URL"
mkdir -p "$BIN_DIR"
curl -fsSL "$BASE_URL/ibx" -o "$TARGET"
chmod +x "$TARGET"

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
