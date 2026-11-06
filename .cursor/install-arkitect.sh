#!/usr/bin/env bash
# Build Arkitect MCP for Cursor cloud agents.
# Non-fatal: any failure prints a warning and exits 0 so app install is not blocked.
set -u

ARKITECT_HOME="${ARKITECT_HOME:-${HOME}/Arkitect-MCP.AI}"
ARKITECT_REPO_URL="${ARKITECT_REPO_URL:-https://github.com/ezequielcasillas1/Arkitect-MCP.AI.git}"
STDIO_JS="${ARKITECT_HOME}/packages/mcp-server/dist/stdio.js"

warn() {
  printf 'install-arkitect: WARNING: %s\n' "$*" >&2
}

fail_soft() {
  warn "$*"
  warn "Skipping Arkitect MCP setup; cloud agent can continue without it."
  exit 0
}

if [[ -f "${STDIO_JS}" ]]; then
  printf 'install-arkitect: already built at %s\n' "${STDIO_JS}"
  exit 0
fi

if [[ ! -d "${ARKITECT_HOME}/.git" ]]; then
  if [[ -e "${ARKITECT_HOME}" ]]; then
    fail_soft "path exists but is not an Arkitect git clone: ${ARKITECT_HOME}"
  fi
  printf 'install-arkitect: cloning %s into %s\n' "${ARKITECT_REPO_URL}" "${ARKITECT_HOME}"
  if ! git clone --depth 1 "${ARKITECT_REPO_URL}" "${ARKITECT_HOME}"; then
    fail_soft "git clone failed"
  fi
fi

cd "${ARKITECT_HOME}" || fail_soft "cannot cd to ${ARKITECT_HOME}"

if ! command -v corepack >/dev/null 2>&1; then
  fail_soft "corepack not found (need Node.js with corepack)"
fi

if ! corepack enable; then
  fail_soft "corepack enable failed"
fi

# packageManager in Arkitect package.json is pnpm@11.6.0
if ! corepack prepare pnpm@11.6.0 --activate; then
  fail_soft "corepack prepare pnpm@11.6.0 failed"
fi

printf 'install-arkitect: pnpm install --frozen-lockfile\n'
if ! pnpm install --frozen-lockfile; then
  fail_soft "pnpm install --frozen-lockfile failed"
fi

printf 'install-arkitect: building packages\n'
if ! pnpm -r --filter "./packages/**" build; then
  fail_soft "pnpm packages build failed"
fi

if [[ ! -f "${STDIO_JS}" ]]; then
  fail_soft "expected entrypoint missing after build: ${STDIO_JS}"
fi

printf 'install-arkitect: ready at %s\n' "${STDIO_JS}"
exit 0
