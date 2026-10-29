#!/bin/sh
# Hot reload the Valdi pages into the running debug apps: the Android emulators and the booted iOS simulator; a phone
# only when ANDROID_SERIAL names it. Rebuilds the modules whose sources or res/ change and pushes what changed.
# The apps listen on port 13592. tools/valdi-rolldown/dev.ts; `pnpm install` in tools/valdi-rolldown installs it.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root/tools/valdi-rolldown"
exec pnpm dev
