#!/usr/bin/env bash
# Claude Code PreToolUse hook wrapper.
#
# Reads the tool-call JSON from stdin, and if Claude is about to run a
# git/gh command that would publish content (commit, push, PR create,
# repo create), runs the secrets scanner first and blocks the call if
# any leaks are found.

set -u

input="$(cat)"

# Extract the bash command being attempted.
cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null || true)"

case "$cmd" in
  *"git commit"*|*"git push"*|*"gh pr create"*|*"gh repo create"*)
    repo_root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
    if ! bash "$repo_root/scripts/check-secrets.sh" 1>&2; then
      echo "" 1>&2
      echo "🛑 BLOCKED by Sprout secrets scan — see output above." 1>&2
      echo "    Fix the leak (move keys to .env.local, replace with REPLACE_ME, rotate any exposed key)" 1>&2
      echo "    before letting this command run." 1>&2
      exit 2  # Exit code 2 = block the tool call and feed stderr back to Claude.
    fi
    ;;
  *)
    : # not a publish-style command, allow it
    ;;
esac

exit 0
