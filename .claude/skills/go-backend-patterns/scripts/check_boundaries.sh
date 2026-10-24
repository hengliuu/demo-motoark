#!/usr/bin/env bash
# Checks module-first import boundaries in a Go service.
#
# Rules:
#   1. internal/platform/... never imports a business module (internal/<module>/...).
#   2. A module never imports another module's sub-package (internal/<other>/<sub>).
#      Modules are flat packages, so only internal/<other> itself is importable.
#
# Import cycles between modules are already rejected by the Go compiler.
#
# Usage: run from the service root (the directory with go.mod), or pass it as $1.
#   bash check_boundaries.sh [service-dir]
# Exit code 0 = clean, 1 = violations found, 2 = could not run.

set -euo pipefail

cd "${1:-.}"

if ! command -v go >/dev/null 2>&1; then
  echo "check_boundaries: go is not installed" >&2
  exit 2
fi
if [[ ! -f go.mod ]]; then
  echo "check_boundaries: no go.mod in $(pwd)" >&2
  exit 2
fi
if [[ ! -d internal ]]; then
  echo "check_boundaries: no internal/ directory, nothing to check"
  exit 0
fi

mod="$(go list -m)"
prefix="${mod}/internal/"

# One line per package: "<import path> <import> <import> ..."
listing="$(go list -f '{{.ImportPath}}{{range .Imports}} {{.}}{{end}}' ./internal/... 2>/dev/null)" || {
  echo "check_boundaries: go list failed, fix the build first (go build ./...)" >&2
  exit 2
}

violations=0

while read -r pkg imports; do
  [[ -z "${pkg}" ]] && continue
  rel="${pkg#"${prefix}"}"
  owner="${rel%%/*}"

  for imp in ${imports}; do
    [[ "${imp}" != "${prefix}"* ]] && continue
    target="${imp#"${prefix}"}"
    target_owner="${target%%/*}"

    # Rule 1: platform must not depend on business modules.
    if [[ "${owner}" == "platform" && "${target_owner}" != "platform" && "${target_owner}" != "api" ]]; then
      echo "platform imports a module: ${rel} -> ${target}"
      violations=$((violations + 1))
      continue
    fi

    # Rule 2: no reaching into another module's sub-packages.
    if [[ "${owner}" != "platform" && "${target_owner}" != "platform" && "${target_owner}" != "${owner}" && "${target}" == */* && "${target_owner}" != "api" ]]; then
      echo "module reaches into another module's sub-package: ${rel} -> ${target}"
      violations=$((violations + 1))
    fi
  done
done <<< "${listing}"

if (( violations > 0 )); then
  echo "check_boundaries: ${violations} violation(s)"
  exit 1
fi
echo "check_boundaries: ok"
