# Static-file OTA

OTA targets a platform and an application version chosen by the publisher:
Android `versionName`, or iOS `CFBundleShortVersionString`. There is no automatic
native-source compatibility fingerprint or release-record prerequisite.
The publisher must increase the application version when native APIs, the
Hermes bytecode contract, or other required native behavior becomes incompatible.

## Contents and ownership

Only `app_pages` is OTA-owned: its `.valdimodule`, optional `.map.json` and owned
resources. All other enabled application and Valdi modules, including their JS
wrappers, remain bundled in the native installation. Production clients require
`modules: ["app_pages"]` in generated `valdi_ota.json`; this does not restrict
normal loading of other bundled modules. Kotlin, Swift, Objective-C and C++
implementations, including the C++ example inside `app_pages`, remain native.
In Release, archive code entries contain Hermes bytecode despite ending in `.js`.

A release always includes the complete signed full-file inventory for
`app_pages`. Clients can reuse verified unchanged files and optionally reconstruct
its archive from a matching base using per-entry copy, full payloads and binary
patches. Every delta retains the original full archive as fallback. Optional maps
and resources still use verified full-file reuse/download; Android bundled
drawable reuse is best-effort because resource selection can change density.

The `.valdimodule` format remains a default-ZSTD-compressed Valdi packet.
The source/build hashes in runtime export receipts still detect stale C++
exports; those checks do not decide which OTA version a device can receive.

## Native and business versions

`appVersion` comes from the installed native application: Android `versionName`
or iOS `CFBundleShortVersionString`. The root `package.json` field
`valdi.ota.bundleVersion` identifies that binary's embedded business bundle
(initially `pages-001`); app-info writes it and `modules: ["app_pages"]` into
`valdi_ota.json`. Set it to the business version actually embedded when building
a new native binary.

Checks request
`<base>/<platform>/<appVersion>/latest.json?platform=<platform>&appVersion=<appVersion>&bundleVersion=<runningVersion>`
with encoded query values. The running version is the process's fixed active
snapshot version, or the embedded `bundleVersion` when running bundled content.
It never comes from pending state or a later change to persisted current state.
Offers matching the embedded or current version are skipped.

## JavaScript and native access

The enabled `app_ota` module exposes the application's existing native client
through a generated `OtaHost` proxy. The native client owns state; JavaScript
receives an information snapshot on each call.

```ts
import { getInfo, checkForUpdate } from 'app_ota/src';

const info = await getInfo();
// enabled, appVersion, embeddedBundleVersion, bundleVersion,
// pendingBundleVersion (absent when nothing is staged),
// isNewVersion, previousBundleVersion

if (info.isNewVersion) {
  // Business code can show a notice here:
  // `${info.previousBundleVersion} -> ${info.bundleVersion}`
}

const afterCheck = await checkForUpdate();
if (afterCheck.pendingBundleVersion) {
  // Show: "Update ready. Close and reopen the app to apply it."
  // Keep the user in the app; the next cold start applies it.
}
```

Both functions return `Promise<OtaInfo>`. `checkForUpdate()` checks the offer,
downloads/verifies any needed files, and resolves after staging. It joins an
already running automatic or manual check. Errors reject the Promise.
`bundleVersion` continues to identify this process's running content; a
download only changes `pendingBundleVersion`. With an empty update URL or in
a Debug build, `enabled` is false and checking performs no network work.

`isNewVersion` is true only for the client session that successfully activates a
different bundle. `previousBundleVersion` is present only then. Both values stay
fixed for that session; a subsequent startup on the already-current bundle
reports false and no previous version. This is activation information, not a
render or health signal. The client does not display a notice or persist a
notice acknowledgment.

The app silently checks after StartApp and route validation. Business UI can
prompt when `pendingBundleVersion` is present: "Update ready. Close and reopen
the app to apply it." The client never quits or restarts the app and exposes no
reload API. Returning from the background is not a cold start. A valid pending
package becomes current on the next cold start. There is no launch-confirmation API.

Native callers use `ValdiOta.getInfo()` and
`ValdiOta.checkForUpdateOrThrow()` on either platform. Android calls are blocking
and belong on a worker thread; the Swift check is `async throws`.
The existing `ValdiOta.checkForUpdate()` is the automatic-check convenience
method that logs failures. Both paths use the same client and download.
The `app_ota` interface and its native implementation ship with the native app;
only `app_pages` content participates in OTA delivery.

## Static protocol

Point `valdiOtaUrl` on Android or `VALDI_OTA_URL` on iOS at a base directory.
For example, use `https://updates.example.com/app`, without a platform, version,
or `latest.json` suffix. The client appends the platform and application version:

```text
android/0.1/
  latest.json
  pages-002/
    manifest.json
    manifest.sig
    modules/
      app_pages.valdimodule
      app_pages.map.json
    res/
      drawable-xhdpi/app_pages_tab_home.webp
      ...
    deltas/                       # Optional, in addition to the full files
      pages-001/
        manifest.json
        payload/
          <sha256>.hdiff
          <sha256>.bin
          <sha256>.zst
ios/1.0/
  latest.json
  pages-002/
    manifest.json
    manifest.sig
    modules/...
    res/app_pages.bundle/...
```

`latest.json` contains `{"version":"pages-002"}`. `{"version":null}` offers no
new update and does not remove an already installed update. Version identifiers
must match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` and are immutable once published.
`latest.json` is reserved case-insensitively for the index and cannot be an
update version.

The signed manifest uses schema version 1:

```json
{
  "schemaVersion": 1,
  "platform": "android",
  "appVersion": "0.1",
  "version": "pages-002",
  "files": {
    "modules/app_pages.valdimodule": {
      "sha256": "<64 lowercase hexadecimal characters>",
      "size": 182920
    }
  }
}
```

The example abbreviates the inventory. A production manifest must contain
`modules/app_pages.valdimodule`; optional maps and resources must belong to
`app_pages`. Other modules are native-bundled and cannot appear in this inventory.
Sizes are exact byte counts. The complete target is limited to 64 MiB and
4096 files, including reused files. The serialized signed manifest is limited
to 1 MiB; the publisher rejects oversized metadata before writing any version.

`manifest.sig` is the Base64 DER ECDSA P-256/SHA256 signature of the exact
`manifest.json` bytes. File hashes verify content, not native compatibility.
Clients verify signatures and identity before downloading file payloads.
The previous fingerprint/hash-only manifest format is not accepted. Install a
new native binary containing this app_pages-only client, generated embedded
version configuration and native codec integration before using this contract.
Publishing a new business bundle alone cannot upgrade an older native client.

## Optional split delta

The signed full manifest can add at most eight `deltas` descriptors:

```json
{
  "baseVersion": "pages-001",
  "baseSha256": "<SHA256 of exact compressed base app_pages.valdimodule>",
  "path": "deltas/pages-001/manifest.json",
  "sha256": "<SHA256 of exact delta manifest bytes>",
  "size": 2048
}
```

The publisher retains the intermediate SHA256 fields for compatibility with
older clients and package inspection. Current clients choose a delta by the
running `baseVersion`, download its metadata and payloads, and verify the
completed archive against the signed full-file descriptor. They do not hash
the base archive, delta metadata, individual entries, payloads or packets.

The delta manifest describes `schemaVersion: 1`, `algorithm: "hdiffpatch"`,
`format: "HDIFFSF20"` and `compression: "zlib"`, plus ordered `entries`.
Entry names, lengths, operations and payload locations drive reconstruction;
extra metadata keys and informational checksum fields do not determine success:

- `copy`: reuse a same-name base entry.
- `full`: download target entry bytes as `raw` or `zstd`; the publisher compares
  actual sizes and selects default-ZSTD only when smaller than raw.
- `patch`: apply an `hdiffpatch-zlib` payload to a same-name base entry.
  Only precompiled `.js` entries with the Valdi/HBC envelope are patch-eligible.
  The publisher uses `hdiffz -SD -s-64 -c-zlib-6 -p-1` and selects a patch only
  when smaller than that entry's selected full payload.

Downloads describe their path, length and encoding. The publisher emits paths at
`deltas/<baseVersion>/payload/<64 lowercase hex>.(hdiff|bin|zst)`.
All target entries, including `res.assetcatalog` and `hash`, retain target order;
deleted old entries are omitted. Entry names must be unique safe relative names.
Malformed paths, framing or bounds invalidate the delta attempt.
The publisher emits a delta only if its metadata plus unique payloads is strictly
smaller than the complete target `app_pages.valdimodule`; noncanonical target
packets use full-only delivery.

Clients select a base only from this process's active module or the embedded
module, with matching version. They decode it, stage target entries in a fresh
work directory, reconstruct the canonical packet and encode with default ZSTD.
The resulting compressed archive is checked once against the original signed
full-file descriptor's exact SHA256 and length. Wrong input or patch bytes can
therefore never become pending merely because the merge completed.
Equivalent decompressed content is insufficient.

Any unavailable codec, missing/corrupt base, metadata/payload error, patch error,
limit violation or recompression mismatch discards delta work and downloads the
original full archive. Default-ZSTD byte equality has host fixture evidence;
cross-platform equality is not assumed. Active directories are never patched
in place.

Full and delta metadata are limited to 1 MiB each; packages and old/target
packets are bounded to 64 MiB, with at most 4096 package files/packet entries.
Clients also bound aggregate delta metadata/download bytes. The native codec
bounds ZSTD output/window to 64 MiB and HDiff step memory to 32 MiB.

## Build and publish

Use the existing signing key. On a new project with no key, run
`node scripts/ota.mjs keygen` once and keep `ota/private.pem` private.
Only the public key is embedded in the binary.

Build an OTA-enabled Release binary against the appropriate Release runtime:

```sh
# Android, from android/
./gradlew :app:assembleRelease -PvaldiOtaUrl=https://updates.example.com/app

# iOS, from the repository root; add signing/destination options for your release.
xcodebuild -project ios/ValdiRoutes.xcodeproj -scheme ValdiRoutes \
  -configuration Release VALDI_OTA_URL=https://updates.example.com/app
```

To keep the Android setting locally, add
`valdiOtaUrl=https://updates.example.com/app` to `android/gradle.properties`
or your user-level `~/.gradle/gradle.properties`; `-PvaldiOtaUrl=...` overrides it.
For an iOS project default, edit `VALDI_OTA_URL` in `ios/project.yml`, then run
`node scripts/ios-project.mjs` to regenerate the Xcode project. The build-setting
argument shown above overrides that default.

With the current native versions, this example checks
`https://updates.example.com/app/android/0.1/latest.json` on Android and
`https://updates.example.com/app/ios/1.0/latest.json` on iOS, adding the version
query parameters described above. Serve the corresponding `ota/dist` directory
tree at that base URL.

Debug builds force the address empty on both platforms. Empty addresses disable
network checks and cached OTA selection. Updating the address/key or native
client requires a new native build.

From the repository root, after changing compatible application code:

```sh
node scripts/ota.mjs pack android 0.1 pages-002
node scripts/ota.mjs pack ios 1.0 pages-002
```

The command builds only `app_pages` in Release and writes
`ota/dist/<platform>/<appVersion>/<version>`. It signs and completes a private
staging directory before moving it into place, then replaces `latest.json`.
It does not upload files, modify a server, rotate keys, or infer compatibility.

To add a delta, supply either an old package directory or an old archive:

```sh
# Package directory: derive base version and check platform/appVersion and archive.
node scripts/ota.mjs pack android 0.1 pages-002 \
  --base ota/dist/android/0.1/pages-001
scripts/ota-pack-ios.sh 1.0 pages-002 --base ota/dist/ios/1.0/pages-001

# Archive file: --base-version is required.
VALDI_HDIFFZ=/path/to/hdiffz node scripts/ota.mjs pack android 0.1 pages-002 \
  --base /path/to/old.valdimodule --base-version pages-001
scripts/ota-pack-ios.sh 1.0 pages-002 \
  --base /path/to/old.valdimodule --base-version pages-001
```

Both `scripts/ota-pack-android.sh` and `scripts/ota-pack-ios.sh` forward these
optional base arguments. Delta packing requires a locally installed `hdiffz`,
discovered in order from `VALDI_HDIFFZ`, repository `ota/tools/hdiffz` (or
`hdiffz.exe`), then `PATH`. An explicit base with no tool fails with an actionable
error. There is no network bootstrap or automatic tool download. Full-only
packing needs no HDiff tool.

For the first OTA after a native release, retain that binary's exact embedded
`app_pages.valdimodule` and use its configured `bundleVersion` as
`--base-version`. A newly rebuilt archive with the same sources is not a
substitute: clients require the base archive's exact compressed hash.

The packer passes `--module app_pages --hermes-base <old.valdimodule>` to the
Release compiler when a base is supplied. For each matching old precompiled
entry, the compiler removes the Valdi envelope and gives its HBC to Hermes as
`-base-bytecode=<old.hbc>`, retaining the normal Release compilation settings.
There is no `deltaprep` phase or flag.

Any static HTTP(S) host can serve the directory. Upload the complete immutable
version first, then replace the index. Configure `latest.json` for revalidation
and versioned files as immutable. Clients bypass metadata caches and do not
follow download redirects; use final file URLs. Serve responses with identity
content encoding: clients request it and reject HTTP gzip/Brotli transformations.
The archive and delta payloads already carry their own specified compression.
Retain the full target archive,
maps/resources, signed metadata and every referenced delta metadata/payload path.
Keep relevant old base versions available for future delta packing, clients
still downloading those versions and any advertised older releases. Do not prune
referenced paths or replace the full fallback with delta-only content.

For loopback testing, serve `ota/dist` with a local static server. Android can
use an explicitly scoped `adb reverse` mapping; the existing network-security
configuration allows cleartext only for loopback hosts. Deployment transport
and store distribution policy are outside this client's implementation.

## Download and activation

The host checks once in the background after `StartApp` and route validation.
Business UI uses `getInfo()` / `checkForUpdate()` to decide when to show a reopen
notice. There is no polling timer, forced exit, or in-process JS runtime reload.

Downloads stream into private temporary files with byte bounds, finite timeouts
and no redirects. Intermediate split files are merged without content hashes;
only the completed module is checked against its signed SHA256 and size.
Maps, resources and full fallback downloads are independently completed files
and retain their own final checks. Reused files are copied independently and
the resulting copy is verified; files are not hard-linked between versions.
Partial downloads never replace current files.

Kotlin/Swift packet copying, hashing and reconstruction use file chunks of at
most 64 KiB. The C ZSTD encoder reads the whole input into a bounded allocation
(up to 64 MiB), plus codec state and a 16 KiB output buffer, to reproduce the
publisher's default compressed bytes. The entire pipeline is therefore not
streaming, and the file limit is not a total-process memory limit.

Only a fully prepared directory becomes pending. The next process launch
verifies its files and durably promotes it to current before exposing it or
removing obsolete packages. The package provider stays fixed for the process,
including subsequent lazy module loads.

There is no launch-confirmation API, attempted-launch flag, or failed-version
blacklist. Closing the app or crashing after activation does not invalidate the
package or trigger a business rollback. A corrupt or missing pending package can
still fall back to a verified current package, or to the binary if none remains.
State write failures preserve the previous durable state and package files.

Publish a new version to fix business errors. To restore older business content,
publish that content under a new version identifier. Legacy state fields for
launch attempts and failed versions are ignored.

Installing another native binary resets cached selection using installation
identity, rather than source hashes. The app retains current/pending/active files
as needed; it does not delete the running version while preparing another.
Switching business bundles does not undo database migrations or other persisted
business data.

## Validation

The script tests use temporary signing keys and directories:

```sh
node --test scripts/tests/ota.test.mjs scripts/tests/ota-delta.test.mjs scripts/tests/prerequisites.test.mjs
```

With no local `hdiffz`, only the two real patch-generation/application
integrations skip with setup instructions; schema, full-file, CLI and discovery
checks still run. Supply `VALDI_HDIFFZ`, a repository tool or a PATH executable
to run the complete suite. An invalid explicit override is an error.

Platform clients have focused JVM/Foundation regression runners covering actual
file operations and loopback HTTP fixtures:

```sh
python3 android/app/src/test/ValdiOtaRun.py
ios/Tests/run-ota-client-tests.sh
```

Delta fixture runners require the same locally installed `hdiffz` discovery
above. The standalone Android runner uses cached Kotlin/JUnit artifacts and
builds the host JNI codec. Ordinary `:app:testDebugUnitTest` runs the full-file
engine cases; the dedicated split/codec classes require the runner's
`OTA_SPLIT_FIXTURES` and skip explicitly when it is absent. Set `OTA_TEST_OUTPUT` to
retain runner logs in a chosen directory. `OTA_FULL_ONLY=1` selects Android's
generic full-only suite; `OTA_TEST_WITHOUT_CODEC=1` selects iOS's codec-absent
fallback scenario.

The frozen implementation reports record publisher real-Hermes/HDiff fixtures,
Android host JVM/JNI cases and iOS host Foundation/CryptoKit/C-codec cases,
including exact reconstruction and full fallback. These are supplied host
results, not fresh application-build, device, production-delivery or render
validation. Activation verifies package files; it does not assess business
startup or page rendering.
