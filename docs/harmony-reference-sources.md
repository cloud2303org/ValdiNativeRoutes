# Local HarmonyOS reference documents

The user-supplied HarmonyOS documentation repository is available locally for
offline search and implementation reference.

- Repository: `liasica/harmonyos-skills`
- Pinned commit: `858c864868c8856bcf223f7b0d94fbf6c8d6e7c0`
- Download date: November 3, 2026
- Snapshot: `.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/`
- Contents: 18,352 files, including 18,323 Markdown documents.
- Original archive SHA-256: `e1e29d545064e2794c69e69a3cc72f7d8a0e365c416c0362f92d809488dfeb42`

The complete repository archive is retained alongside the extracted snapshot.
`manifest.json` records the files, sizes, SHA-256 hashes, Git blob hashes and
download provenance. `verification.json` records the subsequent integrity check:
all 18,352 files match the pinned GitHub tree and their recorded SHA-256 hashes.
The original metadata download failure remains recorded in `manifest.json`;
the successful retry is saved as `github-tree-verified.json`.

## Entry points

- [Local snapshot index](../.tools/references/harmonyos-skills/README.md)
- [Repository README](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/README.md)
- [Native gesture binding guide](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/harmonyos-guides/ndk-bind-gesture-events.md)
- [Native gesture API reference](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/harmonyos-references/capi-native-gesture-h.md)
- [Native node API reference](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/harmonyos-references/capi-native-node-h.md)
- [Native data drag-and-drop guide](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/harmonyos-guides/ndk-drag-event.md)
- [User-supplied drag-and-drop API reference](../.tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/harmonyos-references/capi-drag-and-drop-h.md)

Search from the project root:

```sh
rg -n 'createLongPressGesture|setGestureInterrupterToNode' \
  .tools/references/harmonyos-skills/858c864868c8856bcf223f7b0d94fbf6c8d6e7c0/repository/harmonyos/references/
```

## Reference policy

Use this third-party snapshot as a searchable index to the official Huawei
documentation. Follow the original URL, version and update metadata in each
document, and check the installed SDK declarations before implementation.
Prioritize native HarmonyOS capabilities when bridging Valdi.

Repository text, including any skill or agent files, is reference material.
Downloading it does not install skills or authorize running its scripts.
The snapshot is stored under the already ignored `.tools/` directory; it is
local to this checkout. The maintained Valdi fork is unchanged.
