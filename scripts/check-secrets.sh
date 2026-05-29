#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# Sprout — secrets scanner
#
# Scans for API keys / credentials that should never reach GitHub.
# Used by:
#   • the git pre-commit hook (.githooks/pre-commit) — scans staged content
#   • manual "did I leak anything?" check — scans the whole working tree
#
# Usage:
#   scripts/check-secrets.sh             # scan all tracked + untracked files
#   scripts/check-secrets.sh --staged    # scan only staged content (fast)
#
# Exit codes:
#   0 — clean, nothing found
#   1 — at least one likely secret found (commit/push should abort)
#   2 — usage / setup error
# ─────────────────────────────────────────────────────────────────

set -u

mode="full"
if [[ "${1:-}" == "--staged" ]]; then
  mode="staged"
fi

# Colors (no-op if not a terminal)
if [[ -t 1 ]]; then
  RED=$'\033[0;31m'; YEL=$'\033[0;33m'; GRN=$'\033[0;32m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
else
  RED=""; YEL=""; GRN=""; DIM=""; BOLD=""; OFF=""
fi

# ─── What we look for ───
# Each pattern is paired with a human-readable label.
# Patterns are crafted to:
#   • match the real key shape (length + alphabet)
#   • NOT match the placeholders in *.example files (REPLACE_ME, xxxxx, ...)
patterns=(
  # OpenRouter — sk-or-v1- followed by ≥32 chars of mixed base64-ish
  'OpenRouter|sk-or-v[0-9]+-[A-Za-z0-9]{32,}'

  # OpenAI — sk-proj- and legacy sk-
  'OpenAI project key|sk-proj-[A-Za-z0-9_-]{32,}'
  'OpenAI legacy key|sk-[A-Za-z0-9]{40,}'

  # Anthropic
  'Anthropic API key|sk-ant-[A-Za-z0-9_-]{40,}'

  # Google API key — exactly 35 chars after AIza
  'Google API key|AIza[0-9A-Za-z_-]{35}'

  # trigger.dev — tr_pat_ + ≥30 alnum
  'trigger.dev personal access token|tr_pat_[A-Za-z0-9]{30,}'

  # GitHub PATs / app tokens
  'GitHub PAT (classic/fine-grained)|gh[pousr]_[A-Za-z0-9_]{36,}'

  # Slack tokens
  'Slack token|xox[baprs]-[A-Za-z0-9-]{20,}'

  # AWS access key id
  'AWS access key ID|AKIA[0-9A-Z]{16}'

  # Stripe live secret keys
  'Stripe secret key|sk_live_[A-Za-z0-9]{24,}'

  # JWT (rough — three base64url segments separated by dots)
  'JWT|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'

  # Generic high-entropy assignment of *_SECRET / *_TOKEN / *_API_KEY
  # Matches `XXX_SECRET = "..."` where the value has both letters and digits and is ≥24 chars.
  'High-entropy *_SECRET / *_TOKEN / *_API_KEY assignment|(_SECRET|_TOKEN|_API_KEY|_PRIVATE_KEY)[[:space:]]*[:=][[:space:]]*['"'"'"]?[A-Za-z0-9/_+=-]{24,}'
)

# ─── File-level skips ───
# We scan source files but skip these paths entirely.
should_skip_path() {
  local f="$1"
  case "$f" in
    *.example|*.example.*|*/\.env.example|.env.example|agent/.env.example) return 0 ;;
    .gitignore|CHANGELOG.md|README.md|CLAUDE.md|sprout_prd.md) return 0 ;;
    scripts/check-secrets.sh|.githooks/*) return 0 ;;
    .claude/settings.json) return 0 ;;
    knowledge/*) return 0 ;;
    *.pdf|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.zip|*.gz|*.tar) return 0 ;;
    node_modules/*|.next/*|dist/*|build/*|.venv/*|venv/*|__pycache__/*) return 0 ;;
    .DS_Store) return 0 ;;
  esac
  return 1
}

# ─── File list ───
files=()
if [[ "$mode" == "staged" ]]; then
  # Only files staged for commit, in Added/Copied/Modified/Renamed states.
  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null)
else
  # Tracked + untracked-but-not-ignored, all rooted at repo root.
  while IFS= read -r f; do
    [[ -n "$f" ]] && files+=("$f")
  done < <(git ls-files --cached --others --exclude-standard 2>/dev/null)
  if [[ ${#files[@]} -eq 0 ]]; then
    # Not a git repo yet — fall back to a plain find.
    while IFS= read -r f; do
      files+=("$f")
    done < <(find . -type f \
              -not -path './.git/*' \
              -not -path './node_modules/*' \
              -not -path './.next/*' \
              -not -path './.venv/*' \
              -not -path './venv/*' \
              -not -path './__pycache__/*' \
              | sed 's|^\./||')
  fi
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "${DIM}check-secrets: no files to scan${OFF}"
  exit 0
fi

# ─── Scan ───
hits=0
echo "${BOLD}🔍 Sprout secrets scan${OFF} ${DIM}(${mode}, ${#files[@]} files)${OFF}"

for f in "${files[@]}"; do
  if should_skip_path "$f"; then
    continue
  fi
  if [[ ! -f "$f" ]]; then
    continue
  fi
  # Skip files we can't read or that look binary
  if file --mime "$f" 2>/dev/null | grep -q 'charset=binary'; then
    continue
  fi

  # In full mode .env.local etc. live on disk legitimately (they're gitignored),
  # so only the staged-mode scan should treat them as a leak.
  if [[ "$mode" == "staged" ]]; then
    case "$(basename "$f")" in
      .env|.env.local|.env.development|.env.production|.env.staging)
        echo "${RED}${BOLD}✗ FORBIDDEN FILE STAGED:${OFF} ${RED}$f${OFF}"
        echo "  ${DIM}This file matches the pattern of a real env file. Move secrets to .env.local (gitignored)"
        echo "  and commit a .env.example with placeholder values instead.${OFF}"
        hits=$((hits + 1))
        continue
        ;;
    esac
  else
    # Full mode: skip gitignored env files entirely. They can't reach GitHub.
    case "$(basename "$f")" in
      .env|.env.local|.env.development|.env.production|.env.staging)
        continue
        ;;
    esac
  fi

  for entry in "${patterns[@]}"; do
    label="${entry%%|*}"
    rx="${entry#*|}"
    # -E extended regex; -n line numbers; -H filename; -I skip binary
    matches=$(grep -EnHI "$rx" "$f" 2>/dev/null || true)
    if [[ -n "$matches" ]]; then
      while IFS= read -r line; do
        # line looks like: filename:lineno:matched-content
        echo "${RED}${BOLD}✗ ${label}${OFF} ${DIM}in${OFF} ${YEL}$f${OFF}"
        # Trim very long matches when echoing back to the user
        snippet="$(echo "$line" | sed 's|^[^:]*:||' | cut -c1-160)"
        echo "    ${DIM}${snippet}${OFF}"
        hits=$((hits + 1))
      done <<< "$matches"
    fi
  done
done

echo
if [[ $hits -gt 0 ]]; then
  echo "${RED}${BOLD}🛑 ${hits} potential secret(s) found.${OFF}"
  echo "${RED}Refusing to let this content reach GitHub.${OFF}"
  echo
  echo "${BOLD}What to do:${OFF}"
  echo "  1. Move real keys to ${BOLD}.env.local${OFF} (or ${BOLD}agent/.env${OFF}) — both are gitignored."
  echo "  2. Replace any real values in committed files with placeholders (REPLACE_ME)."
  echo "  3. If you accidentally committed a key earlier, ${BOLD}rotate it${OFF} at the provider, then"
  echo "     scrub history with: git filter-repo --path <file> --invert-paths   (do NOT just delete the file)."
  echo "  4. Re-run: ${BOLD}scripts/check-secrets.sh${OFF}"
  exit 1
else
  echo "${GRN}${BOLD}✓ No secrets detected.${OFF} ${DIM}Safe to commit / push.${OFF}"
  exit 0
fi
