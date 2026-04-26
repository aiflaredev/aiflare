#!/usr/bin/env bash
# AIFlare one-command install script
# Usage: curl -fsSL https://raw.githubusercontent.com/kwo2002/context-bridge/main/install.sh | bash

set -euo pipefail

# --- Colors (disabled when stdout is not a TTY) ---
if [[ -t 1 ]]; then
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  RED='\033[0;31m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN=''
  YELLOW=''
  RED=''
  BOLD=''
  NC=''
fi

info()    { echo -e "${GREEN}✓${NC} $1"; }
success() { echo -e "${GREEN}${BOLD}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}!${NC} $1"; }
error()   { echo -e "${RED}✗${NC} $1" >&2; }

# --- Check required dependencies ---
for cmd in git node; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is required but not installed. Please install $cmd and try again."
    exit 1
  fi
done

# --- Detect git root ---
GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$GIT_ROOT" ]]; then
  error "Not a git repository. Please run from the project root."
  exit 1
fi

cd "$GIT_ROOT"

# --- 0. Enforce aiflare.yml presence (must be downloaded before install) ---
if [[ ! -f "$GIT_ROOT/aiflare.yml" ]]; then
  error "aiflare.yml not found in project root."
  echo ""
  echo "  Setup steps:"
  echo "    1) Sign up & generate an API key at https://aiflare.dev"
  echo "    2) Place the downloaded aiflare.yml in $GIT_ROOT"
  echo "    3) Re-run this installer"
  echo ""
  exit 1
fi

echo ""
echo "Starting AIFlare installation..."
echo ""

# --- 1. Clone repository to a temporary location ---
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

CLONE_DIR="$TEMP_DIR/repo"
if ! git clone --depth 1 https://github.com/kwo2002/context-bridge.git "$CLONE_DIR" 2>/dev/null; then
  error "Failed to clone Skill repository. Please check your network connection."
  exit 1
fi
rm -rf "$CLONE_DIR/.git"

# --- 2. Install all skills ---
SKILLS_SOURCE="$CLONE_DIR/skills"
SKILLS_TARGET=".claude/skills"

if [[ ! -d "$SKILLS_SOURCE" ]]; then
  error "skills/ directory not found in cloned repository."
  exit 1
fi

mkdir -p "$SKILLS_TARGET"

for skill_path in "$SKILLS_SOURCE"/*/; do
  [[ -d "$skill_path" ]] || continue
  skill_name="$(basename "$skill_path")"
  target="$SKILLS_TARGET/$skill_name"
  if [[ -d "$target" ]]; then
    rm -rf "$target"
    warn "Replaced existing skill: $skill_name"
  fi
  cp -R "${skill_path%/}" "$SKILLS_TARGET/"
  info "Skill installed → $target"
done

CONTEXT_CAPTURE_DIR="$SKILLS_TARGET/context-capture"

# --- 3. Install MCP Server (shared across all skills) ---
MCP_SOURCE="$CLONE_DIR/mcp-server"
MCP_TARGET=".claude/mcp-server"

if [[ -d "$MCP_SOURCE" ]]; then
  rm -rf "$MCP_TARGET"
  cp -R "$MCP_SOURCE" "$MCP_TARGET"
  if command -v npm &>/dev/null; then
    (cd "$MCP_TARGET" && npm install --production --silent 2>/dev/null) || true
  fi
  info "MCP Server ready → $MCP_TARGET"
fi

# --- 3.5. Install hook scripts (sh + ps1 mirror) ---
HOOKS_DIR_SOURCE="$CLONE_DIR/hooks/unix"
HOOKS_DIR_TARGET=".claude/hooks"

if [[ -d "$HOOKS_DIR_SOURCE" ]]; then
  rm -rf "$HOOKS_DIR_TARGET"
  cp -R "$HOOKS_DIR_SOURCE" "$HOOKS_DIR_TARGET"
  chmod +x "$HOOKS_DIR_TARGET"/*.sh
  info "Hook scripts installed → $HOOKS_DIR_TARGET"
else
  warn "Hook scripts source not found: $HOOKS_DIR_SOURCE"
fi

# --- 3.6. Remove Windows-only scripts (.ps1) — sh installer doesn't need them ---
for dir in "$HOOKS_DIR_TARGET" "$CONTEXT_CAPTURE_DIR/scripts"; do
  [[ -d "$dir" ]] || continue
  find "$dir" -maxdepth 1 -type f -name "*.ps1" -delete 2>/dev/null || true
done

# --- 4. Install settings.local.json (hooks) ---
SETTINGS_FILE=".claude/settings.local.json"
HOOKS_SOURCE="$CLONE_DIR/aiflare_settings.json"
MERGE_SCRIPT="$CLONE_DIR/scripts/merge-hooks.js"
REFERENCE_FILE=".claude/aiflare_settings.reference.json"

mkdir -p .claude

if [[ ! -f "$HOOKS_SOURCE" ]]; then
  warn "Hooks source file not found in repository: aiflare_settings.json"
elif [[ ! -f "$SETTINGS_FILE" ]]; then
  cp "$HOOKS_SOURCE" "$SETTINGS_FILE"
  info "Hooks config created → $SETTINGS_FILE"
elif command -v node &>/dev/null && [[ -f "$MERGE_SCRIPT" ]]; then
  cp "$SETTINGS_FILE" "$SETTINGS_FILE.bak"
  if node "$MERGE_SCRIPT" "$SETTINGS_FILE" "$HOOKS_SOURCE"; then
    info "Hooks merged → $SETTINGS_FILE (backup: $SETTINGS_FILE.bak)"
  else
    mv "$SETTINGS_FILE.bak" "$SETTINGS_FILE"
    warn "Hook merge failed. Original $SETTINGS_FILE restored."
    cp "$HOOKS_SOURCE" "$REFERENCE_FILE"
    echo "  Reference saved to $REFERENCE_FILE for manual merge."
  fi
else
  cp "$HOOKS_SOURCE" "$REFERENCE_FILE"
  warn "node not found. Cannot auto-merge hooks into existing $SETTINGS_FILE."
  echo "  Reference saved to $REFERENCE_FILE."
  echo "  Please merge its \"hooks\" section into $SETTINGS_FILE manually."
fi

# --- 5. Install/merge .mcp.json ---
MCP_JSON=".mcp.json"
MERGE_MCP_SCRIPT="$CLONE_DIR/scripts/merge-mcp.js"
MCP_REFERENCE_FILE=".claude/mcp.reference.json"

MCP_CONFIG_JSON='{
  "mcpServers": {
    "aiflare": {
      "command": "node",
      "args": [".claude/mcp-server/dist/index.js"]
    }
  }
}'

if [[ ! -f "$MCP_JSON" ]]; then
  printf '%s\n' "$MCP_CONFIG_JSON" > "$MCP_JSON"
  info "MCP config created → $MCP_JSON"
elif [[ -f "$MERGE_MCP_SCRIPT" ]]; then
  MCP_SRC_TMP="$TEMP_DIR/mcp-aiflare.json"
  printf '%s\n' "$MCP_CONFIG_JSON" > "$MCP_SRC_TMP"
  cp "$MCP_JSON" "$MCP_JSON.bak"
  if node "$MERGE_MCP_SCRIPT" "$MCP_JSON" "$MCP_SRC_TMP"; then
    info "MCP config merged → $MCP_JSON (backup: $MCP_JSON.bak)"
  else
    mv "$MCP_JSON.bak" "$MCP_JSON"
    warn "MCP config merge failed. Original $MCP_JSON restored."
    printf '%s\n' "$MCP_CONFIG_JSON" > "$MCP_REFERENCE_FILE"
    echo "  Reference saved to $MCP_REFERENCE_FILE for manual merge."
  fi
else
  printf '%s\n' "$MCP_CONFIG_JSON" > "$MCP_REFERENCE_FILE"
  warn "Merge script unavailable. Cannot update existing $MCP_JSON."
  echo "  Reference saved to $MCP_REFERENCE_FILE."
  echo "  Please add the \"aiflare\" entry to $MCP_JSON manually."
fi

# --- 6. Update .gitignore ---
touch .gitignore

add_gitignore() {
  local pattern="$1"
  if ! grep -qx "$pattern" .gitignore 2>/dev/null; then
    echo "$pattern" >> .gitignore
    info "Added $pattern to .gitignore"
  else
    info "$pattern already in .gitignore"
  fi
}

add_gitignore 'aiflare.yml'
add_gitignore '.context-capture/'
add_gitignore '.claude/settings.local.json'

# --- 7. Install Git pre-push hook ---
PREPUSH_SOURCE="$CLONE_DIR/scripts/githooks/pre-push"
HOOKS_TARGET_DIR=".git/hooks"

if [[ -f "$PREPUSH_SOURCE" ]]; then
  if [[ -f "$HOOKS_TARGET_DIR/pre-push" ]]; then
    warn "Existing $HOOKS_TARGET_DIR/pre-push found. Will not overwrite."
    echo "  Please merge manually:"
    echo "    cat $PREPUSH_SOURCE"
  else
    cp "$PREPUSH_SOURCE" "$HOOKS_TARGET_DIR/pre-push"
    chmod +x "$HOOKS_TARGET_DIR/pre-push"
    info "pre-push hook installed → $HOOKS_TARGET_DIR/pre-push"
  fi
else
  warn "pre-push hook script not found: $PREPUSH_SOURCE"
fi

# --- 8. Update CLAUDE.md ---
CLAUDE_MD="CLAUDE.md"
DIRECTIVE="After git commit, you must always run the context-capture skill."

if [[ ! -f "$CLAUDE_MD" ]]; then
  echo "$DIRECTIVE" > "$CLAUDE_MD"
  info "CLAUDE.md created with directive"
elif ! grep -qF "context-capture" "$CLAUDE_MD" 2>/dev/null; then
  echo "" >> "$CLAUDE_MD"
  echo "$DIRECTIVE" >> "$CLAUDE_MD"
  info "Directive added to CLAUDE.md"
else
  info "context-capture directive already exists in CLAUDE.md"
fi

# --- 9. Post-install verification ---
echo ""
info "Verifying installation..."

verify_failed=0

# Verify each skill has SKILL.md
for skill_dir in "$SKILLS_TARGET"/*/; do
  [[ -d "$skill_dir" ]] || continue
  skill_name="$(basename "$skill_dir")"
  if [[ ! -f "$skill_dir/SKILL.md" ]]; then
    warn "Skill missing SKILL.md: $skill_name"
    verify_failed=1
  fi
done

# Verify MCP server entry point exists and parses
if [[ -d "$MCP_TARGET" ]]; then
  MCP_ENTRY="$MCP_TARGET/dist/index.js"
  if [[ ! -f "$MCP_ENTRY" ]]; then
    warn "MCP server entry point missing: $MCP_ENTRY"
    verify_failed=1
  elif ! node --check "$MCP_ENTRY" 2>/dev/null; then
    warn "MCP server entry point failed syntax check: $MCP_ENTRY"
    verify_failed=1
  fi
fi

# Verify .mcp.json is valid JSON
if [[ -f "$MCP_JSON" ]] && ! node -e "JSON.parse(require('fs').readFileSync('$MCP_JSON','utf8'))" 2>/dev/null; then
  warn "$MCP_JSON is not valid JSON"
  verify_failed=1
fi

if [[ "$verify_failed" -eq 0 ]]; then
  info "All components verified"
fi

# --- Done ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "Installation complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
