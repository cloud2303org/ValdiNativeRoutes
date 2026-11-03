This is a bounded native characterization fixture. It passed on November 3,
2026 in `/tmp/valdi-sheets-20261103/caller-native-fifth`, with a strict executable
link and real JSC execution. Three operation-specific negative controls failed
their expected behavioral assertions. The original source-only receipt remains
historical; the native attempts have separate receipts. The work adds only
`sheet-caller*` files.

The fixture loads the current production `navigation/index.ts` (`router` and
`Router`), `NavigationHost.ts`, `navigation/config.ts`, `data.ts`, and `options.ts`
into the official macOS Valdi JSC adapter. Only `routes.ts` is replaced with a
small route declaration created through production `defineRoutes`/`nativePage`.
The real upstream `Device.ts` and installed `valibot` CommonJS implementation
are loaded too. The platform `DeviceBridge` is an explicit collaborator supplying
`harmony` and inert observation handles; no device services run. The bridge's
real declaration and all real JS input files are hashed. The production router
and validation behavior are unchanged.

The native extractor takes the current production `HarmonyNavigator::Result`,
payload helpers, `makeNavigationHost`, `complete`, `enqueue`,
`captureResultCaller`, `cancelCallerResults`, and `retirePage` bodies unchanged.
Each chunk and original file gets a SHA256. In particular, no `Context` type,
`Context::currentRef`, `getParent`, weak reference, or function wrapper is
rewritten to the earlier `ContextBoundary` model. The actual
`JSFunctionWithValueFunction` and `ValueFunctionWithJSValue` objects are checked
by native casts. The private weak `_creationContext` is checked through the real
public `ownerIsTearingDown()` behavior after destroying a child whose root lives.

The scheduler is explicitly a small **adapter** over production
`DispatchQueue::createThreaded`, `RetainedContext`,
`JavaScriptContextEntry`, and `JavaScriptEntryParameters`. It uses a real
dedicated serial JS thread and verifies that native JS observations occur off
the driver/UI thread. `setDisableSyncCallsInCallingThread(true)` is essential:
the default upstream threaded-queue `sync()` can otherwise execute its barrier
on the calling thread and falsely present it as current JS.

This adapter is not an instance of `JavaScriptRuntime`. Rendering, destination
attachment, the UI dispatcher, and Runtime's JS-to-UI destruction hop are named
collaborators. A `CallerTreeBoundary` returns a supplied **real Context**; it
does not build a `ViewNodeTree`. All output keys say `suppliedPageTreeContext`
and `suppliedPageRoot`. Passing rows do not prove that a renderer-created page
or nested component has the supplied topology.

The source cases are:

- A page callback invoking production `Router.pushForResult`.
- A child callback invoked directly in JS under its child Context, then invoked
  from native through the real `ValueFunctionWithJSValue`. Creation Context,
  holder root, emitted Context and supplied page tree Context are distinct
  observations. The child-to-page ancestor chain must be retained exactly.
- The same lexical callback called directly under another page, plus a native
  callback created by that other page. A page handle alone carries no native
  current-Context override.
- The actual owner-propagating native-wrapper branch, installed under the app
  root, compared with ordinary native methods which preserve current Context.
- A Promise microtask continuation and a native-result continuation opening a
  second sheet through production `Router`, including the root → sheet result
  → new-sheet chain.
- A supplied page parented to app root. Native callback dispatch can emit under
  its holder root instead of the supplied page's Context; equality is not
  assumed.
- An attached pending result and a child-origin result admitted outside the
  current UI batch. Page retirement must cancel both exactly once and prevent
  the queued destination from attaching.
- A retiring caller reentering after the JS fence called `destroyContext`, but
  before its deferred UI `onDestroy`. The gate must persist through this gap.
  A distinct live page must still admit and attach its own result.
- A native-picker page with null tree, and an explicitly unowned native result.
  Retirement cannot cancel an unrelated page's pending result or infer an owner
  for the explicitly unowned result.

The execution emitted JSON lines with actual wrapper-root/creation/current/
lineage observations and freshly compiled ABI sizes. It must exit nonzero
for an assertion, JS exception, sanitizer failure or unresolved native symbol.

Observed rows distinguish direct child emission `903 → [903,901]` from the
same native-invoked callback's emission `901 → [901]`, despite creation Context
903 in both cases. Calling a lexical page-901 callback under page 902 emitted
902. The owner-propagating branch emitted app root 900; a page parented to that
root also emitted 900 from native. The result continuation kept root 900 across
root → sheet → next sheet. None of these observations establishes renderer
topology beyond the supplied real Contexts.

The resumed execution in `caller-resumed-current` also runs the unchanged
production parent resolver against real generated PageViewModel, PageContext
and TabBarContext marshallers and native callbacks: none resolves a parent.
A real JS callback nested in a map/array does resolve its holder root, and the
production route-data detachment path rejects that unsupported callback value.
The supplied parented-904 counterexample remains explicit: its native callback
emits under global 900, and retirement of 904 leaves that global request alive.
`page-root-source-trace.json` records matching staged/fork source pairs for the
native creation path, ContextManager, component handler and wrapper behavior.
This establishes the native-payload premise within the stated boundaries,
not execution of the full renderer or production scheduler.

The controls in `caller-red-child-lineage`, `caller-red-retirement-gate`, and
`caller-red-global-null-caller` each exited with assertion failure (`-6`).
They respectively remove ancestor capture, bypass the still-retiring gate, and
sweep explicitly unowned requests. The test body, real wrappers and JS business
modules are identical; only the named extracted production expression changes.
These are behavior failures, distinct from the earlier fixture compilation and
loader setup failures.

Source preparation and compile recipe:

```sh
# Safe now: extract/check source and print commands; neither command compiles.
python3 scripts/harmony/tests/sheet-caller-extract.py
python3 scripts/harmony/tests/sheet-caller-probe.py /tmp/sheet-caller-20261103

# Parent ONLY, once the single native slot is returned:
python3 scripts/harmony/tests/sheet-caller-probe.py \
  /tmp/sheet-caller-20261103 --execute --native-slot-held
```

The default probe path prints a plan and writes nothing. Execution requires a
new output directory, transpiles only the bounded TS module set with the local
TypeScript package, then compiles serially with ASAN/UBSAN. Source lists and
include flags are read from the current
`harmony/business-build/.artifacts/host/compile_commands.json` and the adapter
inventory in `platform/tests/engine_boundary.py`. Their existing objects are
never reused. The plan is capped at 180 translation units (currently 166:
130 host/core + 27 adapter + 6 support, including JS Context entry, + generated
app models + BoringSSL Base64 + this fixture). The plan's computed source count
is authoritative if its deduplication changes the arithmetic.

Only existing non-Valdi `fmt` and `jsoncpp` archives are linked; every
ABI-bearing Valdi object, including `Context.cpp`, `Runtime.cpp`, the adapter,
and generated app models, is built fresh against the same include set. No old
616-byte Context-support archive or restored `.cxx` object is used. The link is
an executable with strict symbol resolution; it deliberately has no
`-undefined,dynamic_lookup` escape. Each compile has dependency output; all
consumed non-system headers, commands, exit status, and output hashes go into
the fresh receipt. A changed consumed input aborts the proof. Compilers are
strictly serial, with a process scan before each invocation. The parent's
coordination still provides the actual native-slot lock.

`--support-from` can reuse only this probe's fresh support objects after checking
every dependency and exact compile flags against their origin receipt. Changed
flags force recompilation. The fixture TU always recompiles. The passing attempt
uses hash-verified support from `caller-native-first`; it freshly rebuilds
`ValueFunctionWithJSValue.cpp` with `-fno-sanitize=vla-bound`. That upstream wrapper
uses Clang's zero-length VLA extension for zero-argument JS calls; the first
executed attempt preserved the UBSan diagnostic. The same targeted exclusion
already covers the two official JSC adapter TUs. ASan and all other UBSan checks
remain enabled. No upstream source was changed.

The first attempt's fixture used a hidden base overload; the corrected fixture
upcasts to official `ValueFunction` for its convenience call. The next attempt
exposed a fixture return-type error, followed by a loader import failure and
the zero-length-VLA diagnostic. These failures and the initial 165 fresh support
compilations remain immutable in their separate output directories. The passing
attempt added no ABI stubs or full-runtime initialization.

The remaining full-production seam is specific: `JavaScriptRuntime` construction
requires `IJavaScriptBridge`, `ResourceManager`, `ContextManager`,
`MainThreadManager`, `AttributeIds`, and its module/component bootstrap.
Its constructor creates a global Context and queues `doInitialize`;
`postInit` installs `JavaScriptComponentContextHandler`. Host page creation uses
the actual runtime/renderer path. Nested JS `runtimeCreateContext` can take
the actual current Context as parent; its special root Context ID `1` is
excluded, and destroyed roots are handled separately. The bounded host inventory has no
standalone bootstrapped runtime fixture that provides these services and real
page trees.

The OHOS Hermes artifacts are target binaries and cannot execute on macOS.
Fresh macOS Hermes plus its adapter/dependencies, or a target runtime harness,
is required for Hermes-specific Promise checkpoints and exact renderer-created
page/child topology evidence. Neither is built here. Therefore this fixture can
characterize real Valdi wrappers and a real JS queue within its declared host
boundary; it cannot close the parent's requested full production
Hermes/JavaScriptRuntime/ViewNodeTree proof by itself.

The inspected `.tools/harmony/runtime-x86_64/compile_commands.json` has 1,483
compile rows: 251 in `valdi_ohos_hermes` and 361 in `valdi_runtime_ohos`, plus
dependencies. Its `HermesJavaScriptContext.cpp` command explicitly targets
`x86_64-linux-ohos`. The full-development r2 checkpoint has 1,667 rows, including
311 Hermes VM, 31 Hermes API, 8 Hermes adapter, 223 runtime, and 126 core rows.
That checkpoint consumes the separate Harmony fork source path; its artifacts
are not ABI support for the `.tools/harmony/upstream` source fixture. These
counts describe existing command inventories, not a proposed new build or
executed validation. They explain why replacing this 166-source host probe with
the already-configured full target runtime would exceed the bounded scope.
