#!/usr/bin/env bash
set -euo pipefail

mode="${1:-report}"
if [[ "$mode" != prepare && "$mode" != report ]]; then
  echo "Usage: bash scripts/ci-linux-disk.sh prepare|report" >&2
  exit 2
fi

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux ]]; then
  echo "Linux Actions disk preparation does not apply to this host."
  exit 0
fi

report() {
  df -h "${GITHUB_WORKSPACE:-.}"
  local directory
  for directory in \
    /usr/share/dotnet /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL \
    /usr/local/lib/android/sdk/ndk \
    "$HOME/.cache/bazel-disk-cache" "$HOME/.cache/bazel" "$HOME/.bazel" \
    "${GITHUB_WORKSPACE:-.}"; do
    if [[ -e "$directory" ]]; then
      du -sh "$directory" || echo "::warning::Could not completely measure $directory"
    fi
  done
}

report
if [[ "$mode" == report ]]; then exit 0; fi
if [[ "${CI_RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo "Skipping tool removal outside a GitHub-hosted ephemeral runner."
  exit 0
fi

# Java/Node/Bazel build Android; these preinstalled SDKs are not build inputs.
sudo rm -rf -- /usr/share/dotnet /usr/local/.ghcup /opt/ghc /opt/hostedtoolcache/CodeQL

# Gradle and Vision select this NDK. Bazel fetches its own pinned NDK separately.
for directory in /usr/local/lib/android/sdk/ndk/*; do
  if [[ -e "$directory" && "${directory##*/}" != 27.1.12297006 ]]; then
    echo "Removing unused preinstalled NDK: $directory"
    sudo rm -rf -- "$directory"
  fi
done
report
