Typed Harmony storage regression proof
=====================================

Run the focused proof from the checkout root:

```sh
python3 harmony/entry/src/main/cpp/business/tests/verify.py storage \
  --output /tmp/storage-proof-new-directory \
  --support-receipt /tmp/valdi-picker-object-contract-20261103/harmony-reset-fresh/receipt.json \
  --sdk
```

The output directory must be new. `--reuse-build /absolute/prior/output` can reuse
the bounded support build only after all recorded input and object hashes and
the source list and flags match. The supplied Value support receipt is verified
against its dependency files, source recipes and object/archive hashes. Its
`Runtime.cpp` member is excluded from the new storage support archive. No old
`Context`/`IJavaScriptContext` archive is used. The historical broad business
runner is not the storage proof entry point.

The native fixture calls the actual production `HarmonyStorageHost::hostValue()`
through the current canonical generated `StorageWriteRequest`, `StorageReadReply`
and `StorageHost` marshalling. The bridge carries typed objects and native maps,
with no JSON string transport. JSON exists only in
`app-storage-structured.sqlite3`; there is no legacy database migration or
old-format reader.

Persistence uses the already linked JSONCPP writer with `max_digits10`
significant precision and length-aware strings and keys. The reader uses
JSONCPP's strict structural/string parser and recursive conversion to real
Valdi values. Numeric tokens are checked against JSON grammar and converted
with a private C numeric locale. Finite nonzero subnormal results are accepted
even if `strtod_l` reports `ERANGE`; overflow and underflow to zero are errors.
This avoids the JSONCPP iostream reader's rejection of valid subnormals on
libc++. To keep JSONCPP's source offsets, independently validated numeric tokens
are replaced by `0` plus spaces during structural parsing, then restored by
offset. Booleans, null, integers, negative zero, special dictionary keys and
embedded NUL remain distinct. Empty stored text is corrupt data rather than a
missing row.

The storage boundary also rejects raw NUL bytes anywhere in a stored record and
unquoted commas followed only by JSON whitespace and `}` or `]`. These checks
cover JSONCPP accepting raw NUL as EOF and an object trailing comma after an
empty key despite its strict reader settings. Escaped `\u0000`, valid empty keys,
quoted delimiters and escaped quotes/backslashes remain valid. Corruption tests
insert stored bytes with length-aware SQLite bindings.

For an immutable baseline RED, pass `--source /snapshot/path/HarmonyStorageHost.cpp`
with its original adjacent header, plus `--expect-red`. The same fixture must
fail the precision and control-character cases. The final fixture additionally
checks mixed nested numbers, malformed records, failed synchronous replacement,
null versus missing, removal/clear, expired ownership and closed callbacks.
For a later review correction whose baseline already fixes those original
cases, repeat `--red-test TestName` to require its specific regressions instead.

The runner serializes native commands and records a fresh global compiler scan
before every compile, archive, link and test execution. It waits for an external
compiler without killing it, then stops after bounded waiting if still busy.
Commands, errors, dependency hashes, source/header copies, objects, test XML and
the final process scan are retained in the output directory. Earlier receipts
are never rewritten.

Host execution uses ASan and UBSan with real SQLite, JSONCPP, fmt, gtest and
current Valdi Value/schema/marshalling sources. This is a native typed-object
test on macOS, with no JavaScript VM, Harmony runtime execution, HAP or device.
SDK26 checks compile local production storage and canonical generated bindings
for x86_64 and arm64-v8a; they do not build or link an application.
