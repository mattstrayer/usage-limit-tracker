#!/usr/bin/env bash
# Installs the Claude Code usage status line for the current user.
# Usage: ./install.sh            (global only)
#        ./install.sh /path/to/project ...   (also chain into projects that override statusLine)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
command -v jq >/dev/null || { echo "jq is required: brew install jq"; exit 1; }
command -v claude >/dev/null || echo "warn: claude not on PATH; continuing"

mkdir -p ~/.claude/statusline
install -m 755 "$here/usage-bar.sh" ~/.claude/statusline/usage-bar.sh

s=~/.claude/settings.json
[ -f "$s" ] || echo '{}' > "$s"
cp "$s" "$s.bak.$(date +%Y%m%d%H%M%S)"
jq '.statusLine = {"type":"command","command":"~/.claude/statusline/usage-bar.sh","padding":0}' "$s" > "$s.tmp" && mv "$s.tmp" "$s"
echo "global: statusLine set in $s"

# Projects that define their own statusLine override the global one. Chain ours around theirs.
for proj in "$@"; do
  ps="$proj/.claude/settings.json"; pl="$proj/.claude/settings.local.json"
  existing=$(jq -r '.statusLine.command // empty' "$ps" 2>/dev/null || true)
  [ -n "$existing" ] || { echo "$proj: no project statusLine, global applies"; continue; }
  [ -f "$pl" ] || echo '{}' > "$pl"
  esc=$(printf '%s' "$existing" | sed 's/"/\\"/g')
  jq --arg cmd "~/.claude/statusline/usage-bar.sh \"$esc\"" \
     '.statusLine = {"type":"command","command":$cmd,"padding":0}' "$pl" > "$pl.tmp" && mv "$pl.tmp" "$pl"
  echo "$proj: chained existing statusLine in $pl"
done

# pi / oh-my-pi extension (optional): link the repo root as a plugin if a host is present.
root=$(cd "$here/.." && pwd)
if [ -f "$root/index.ts" ]; then
  if command -v omp >/dev/null; then omp plugin link "$root" && echo "omp: linked usage-limit-tracker plugin"; fi
  if command -v pi >/dev/null; then pi install "$root" && echo "pi: installed usage-limit-tracker"; fi
fi

# smoke test
printf '{"model":{"display_name":"Test"},"context_window":{"used_percentage":12}}' | ~/.claude/statusline/usage-bar.sh
echo "ok — restart Claude Code to see it"
