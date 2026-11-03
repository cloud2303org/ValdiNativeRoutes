# ClientSQL prerequisite validation — 2026-11-02

Source pin: `15feb6530ceecb971f4c8519ea8ab77474b959db`.
All evidence below was obtained from source preparation and native builds in this
checkout. No Hvigor build, device, remote operation, or commit was performed.

## Source identity

SHA-256:

```text
ClientSQLNativeModuleFactory.cpp
1ea5c6058620e1285f929a5476d0d43a9729b7399707dfa983a19c0d68f1252f
ClientSQLNativeModuleFactory.hpp
bf4b86592f25e1e6e322b7c916fb355a48070f638d0d3ee1d39695a2c98d95be
ClientSQLNativeModuleFactory_tests.cpp
02e93b6b2ccffd203c4a2b5c532a7085604dda4036c7dd1d0229ba2cb57ee5a8
generated/valdi_modules/client_sql/client_sql.hpp
5aa9794fb1d9cf67393d48c7d644adfc28bb33e5513ce0ca8f0b0722e0d484b7
generated/valdi_modules/client_sql/client_sql.cpp
7f925d9b3a7359f16bc97d6125a9614571c6610cb4df3137daed39119357a518
sqlite3.c
b1dd5d74ec7f29055a6684fa06fb3c2f6821c87dd38f9a458dfd2e8a1db28189
sqlite3.h
919e7f2e8ed1d8f56ac17b412b8971c76aa5d1a879752cc6058f75e7d5910e1d
sqlite3ext.h
ac9645e5c9ff0cf176efdd6e75cb5e98f46295d38e02db5c4d208826a39ab4be
```

Native inputs were checked against the pin's git objects. Bindings were freshly
generated through the existing Node compiler and match the two cached Bazel C++
output pairs. SQLite's archive was authenticated using the MODULE's SHA-256
`0e9483900e92cd5de8fd48d16bf9200145a61f7fd5be542a5ac81d8a9516eb9c`,
then its three sources were checked against the extracted Bazel cache.

SQLite reports source ID:

```text
2026-07-24 19:02:57 bf7c7f30031888f4e796e429ab3978879485813aaca6f641c7b33e4e09459bcc
```

## OHOS compile/link

SDK/NDK: `26.0.0.865`, OHOS Clang `15.0.4`, platform level `26`, Release,
C++20. Each ABI compiles the exact native implementation, generated C++ bindings,
SQLite C amalgamation, and the constructor/registry integration probe. The test
driver imports the already-built static OHOS runtime and its exact static link
dependency closure; no Apple archive participates.

Both final shared checks use `--whole-archive` for ClientSQL,
`--no-undefined`, and `--no-gc-sections`. ELF machines are X86-64 and AArch64.
Both contain real factory, generated connection proxy, SQLite open/source-ID,
and registration-probe definitions. Both have no TEXTREL and need only
`libc++_shared.so` and `libc.so`.

Artifacts live in `.artifacts/<ABI>/business/`. SHA-256:

```text
x86_64/libvaldi_clientsql_ohos.a
fe962090d4049e2cb73510c71da915b02e500adcbb1767c41b3cfc9fe6e42f1e
x86_64/libvaldi_clientsql_sqlite_ohos.a
21f490a5d759ca6e4116d45e066d31e0811a602afd809a274b6a4fc18a7c573e
x86_64/libvaldi_clientsql_ohos_link_check.so
2dfa6cae5c0c9629d58bbee0aee6ca270c479773d63b734ac00299b8b7039e3b
arm64-v8a/libvaldi_clientsql_ohos.a
7428c69e69d861e0f86ea2b01b9c0c53dc4b271f8b1b211e271e74bbd18c6e73
arm64-v8a/libvaldi_clientsql_sqlite_ohos.a
4c9292d8b0069a60f10e08b6ec854830d496639487c6d93297b16ac109b4a69b
arm64-v8a/libvaldi_clientsql_ohos_link_check.so
3813981a80d63dd052949dbdc0d53e10fdb5b7af8589f4f12b5bca5a06ee0352
```

The imported real runtime archives have SHA-256:

```text
x86_64:    a2bf931161ebf98090b8a286195ccbf4cd9ea05d2ce15be76a891a241ea4a253
arm64-v8a: 89a0190cdb6ae26016480391d18274d3eb9e7ee1d21f6f37ccbd37050db9aed2
```

Full configure/build logs, compile commands, ELF headers/dynamic tags, and defined
symbols are in `.artifacts/<ABI>/`. `.artifacts/proof.json` records machine,
source provenance fingerprint, compile input paths, file sizes/hashes, and exact
configure commands.

## Host execution and remaining integration

The unchanged 34 pinned `ClientSQLNativeModuleFactory` tests pass against source-
built macOS Valdi core/runtime methods, regenerated bindings, and this bundled
SQLite, including real temporary on-disk WAL databases. XML results are at
`.artifacts/host/results.xml`, with output in `tests.log`.

The parent must still add the CMake directory, link `valdi_clientsql_ohos`, register
the factory exactly once for `client_sql/src/ClientSQLNative`, supply the owned
absolute writable persistent disk root to `RuntimeManager`, and deliver the
business/client_sql HBC assets before business startup. Register the shared
factory before `RuntimeManager::postInit()`, or add a dedicated provider explicitly
to an existing manager. Disk-root ownership and WAL/SHM permissions must be
validated on OHOS.

This work proves native host SQL behavior and both OHOS compilation/link closures.
It does not prove business JS startup, native-to-JS callback scheduling in the
complete OHOS host, application packaging, OHOS filesystem behavior, or execution
on a device.
