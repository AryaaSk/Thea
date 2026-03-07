#!/usr/bin/env bash
# bundle-openclaw.sh — Downloads a standalone Node.js binary and installs the
# openclaw npm package into resources/openclaw/ so Breeze can run it as a sidecar.
#
# Usage:
#   ./scripts/bundle-openclaw.sh            # auto-detect platform/arch
#   ./scripts/bundle-openclaw.sh --clean    # remove existing bundle first
#
# The resulting layout (macOS/Linux):
#   resources/openclaw/
#   ├── node                  # standalone Node.js binary
#   └── node_modules/
#       ├── .bin/openclaw     # CLI entry point (symlink)
#       └── openclaw/         # package + dependencies
#
# The resulting layout (Windows):
#   resources/openclaw/
#   ├── node.exe              # standalone Node.js binary
#   └── node_modules/
#       ├── .bin/openclaw.cmd # CLI entry point
#       └── openclaw/         # package + dependencies

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$PROJECT_DIR/resources/openclaw"

# Node.js version to bundle — must be >= 22.12.0 (openclaw engine requirement)
NODE_VERSION="22.14.0"

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33mWARN:\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31mERROR:\033[0m %s\n" "$*" >&2; exit 1; }

# ── Detect platform & arch ───────────────────────────────────────────────────

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin)                os="darwin" ;;
    Linux)                 os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="win" ;;
    *)                     err "Unsupported OS: $(uname -s)" ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)             err "Unsupported architecture: $(uname -m)" ;;
  esac

  echo "$os" "$arch"
}

# ── Clean ────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--clean" ]]; then
  log "Cleaning existing bundle at $TARGET_DIR"
  rm -rf "$TARGET_DIR"
fi

# ── Main ─────────────────────────────────────────────────────────────────────

read -r OS ARCH <<< "$(detect_platform)"
log "Platform: $OS-$ARCH"
log "Node.js version: $NODE_VERSION"
log "Target: $TARGET_DIR"

mkdir -p "$TARGET_DIR"

# ── Step 1: Download Node.js binary ─────────────────────────────────────────

if [[ "$OS" == "win" ]]; then
  NODE_BIN="$TARGET_DIR/node.exe"
else
  NODE_BIN="$TARGET_DIR/node"
fi

if [[ -f "$NODE_BIN" ]]; then
  EXISTING_VERSION=$("$NODE_BIN" --version 2>/dev/null || echo "unknown")
  if [[ "$EXISTING_VERSION" == "v$NODE_VERSION" ]]; then
    log "Node.js v$NODE_VERSION already bundled, skipping download"
  else
    log "Existing Node.js is $EXISTING_VERSION, replacing with v$NODE_VERSION"
    rm -f "$NODE_BIN"
  fi
fi

if [[ ! -f "$NODE_BIN" ]]; then
  TMPDIR_DL="$(mktemp -d)"

  if [[ "$OS" == "win" ]]; then
    # Windows: download .zip, extract node.exe
    ZIPFILE="node-v${NODE_VERSION}-win-${ARCH}.zip"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${ZIPFILE}"

    log "Downloading Node.js from $URL"
    curl -fSL --progress-bar "$URL" -o "$TMPDIR_DL/$ZIPFILE"

    log "Extracting node.exe"
    unzip -qo "$TMPDIR_DL/$ZIPFILE" "node-v${NODE_VERSION}-win-${ARCH}/node.exe" -d "$TMPDIR_DL"
    mv "$TMPDIR_DL/node-v${NODE_VERSION}-win-${ARCH}/node.exe" "$NODE_BIN"
  else
    # macOS/Linux: download .tar.gz, extract node binary
    TARBALL="node-v${NODE_VERSION}-${OS}-${ARCH}.tar.gz"
    URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"

    log "Downloading Node.js from $URL"
    curl -fSL --progress-bar "$URL" -o "$TMPDIR_DL/$TARBALL"

    log "Extracting node binary"
    tar -xzf "$TMPDIR_DL/$TARBALL" -C "$TMPDIR_DL" --strip-components=2 "node-v${NODE_VERSION}-${OS}-${ARCH}/bin/node"
    mv "$TMPDIR_DL/node" "$NODE_BIN"
    chmod +x "$NODE_BIN"
  fi

  rm -rf "$TMPDIR_DL"
  log "Node.js binary installed: $("$NODE_BIN" --version)"
fi

# ── Step 2: Install openclaw package ─────────────────────────────────────────

# Create a minimal package.json so npm install works in this directory
cat > "$TARGET_DIR/package.json" << 'EOF'
{
  "name": "breeze-openclaw-runtime",
  "private": true,
  "description": "Bundled OpenClaw runtime for Breeze"
}
EOF

log "Installing openclaw package (this may take a minute)..."
cd "$TARGET_DIR"
npm install openclaw 2>&1 || {
  err "npm install openclaw failed. Check output above for details."
}

# Verify the CLI is available
if [[ "$OS" == "win" ]]; then
  # On Windows npm creates .cmd shims
  OPENCLAW_BIN="$TARGET_DIR/node_modules/.bin/openclaw.cmd"
  if [[ ! -f "$OPENCLAW_BIN" ]]; then
    OPENCLAW_BIN="$TARGET_DIR/node_modules/.bin/openclaw"
  fi
else
  OPENCLAW_BIN="$TARGET_DIR/node_modules/.bin/openclaw"
fi

if [[ ! -f "$OPENCLAW_BIN" ]]; then
  log "Contents of node_modules/.bin/:"
  ls -la "$TARGET_DIR/node_modules/.bin/" 2>/dev/null || echo "(directory not found)"
  err "openclaw CLI not found at $OPENCLAW_BIN after install"
fi

# ── Step 3: Verify ───────────────────────────────────────────────────────────

log "Verifying installation..."

# Always use the .mjs entry point directly with our bundled node for verification
OPENCLAW_MJS="$TARGET_DIR/node_modules/openclaw/openclaw.mjs"
if [[ -f "$OPENCLAW_MJS" ]]; then
  OPENCLAW_VERSION=$("$NODE_BIN" "$OPENCLAW_MJS" --version 2>&1 || echo "unknown")
else
  OPENCLAW_VERSION=$("$NODE_BIN" "$OPENCLAW_BIN" --version 2>&1 || echo "unknown")
fi
log "openclaw version: $OPENCLAW_VERSION"

BUNDLE_SIZE=$(du -sh "$TARGET_DIR" | cut -f1)
log "Bundle size: $BUNDLE_SIZE"

echo ""
log "OpenClaw bundled successfully at: $TARGET_DIR"
log "Breeze will pick it up automatically on next launch."
