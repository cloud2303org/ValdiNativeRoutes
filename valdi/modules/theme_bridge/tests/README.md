Run the offline source regressions from the repository root:

```sh
python3 valdi/modules/theme_bridge/tests/run_theme_tokens_tests.py \
  --evidence /tmp/valdi-json-all-20261107/theme/green
```

The runner compiles the actual `ThemeBridgeModuleFactory.kt` and tests against
`module-build/out/android/theme_bridge/theme_bridge_android.jar` plus the real
`classes.jar` extracted from `android/app/libs/valdi_runtime.aar`. The generated
model is never replaced. Compiled source precedes the generated JAR on the JVM
classpath because that JAR also contains the store implementation.

Each scenario runs in a fresh JVM. Only Android `Context`, `AssetManager` and
`Log` are substituted to supply asset bytes and inspect access order. These are
JVM source/model integration tests; they do not exercise Android asset packaging,
JNI marshalling, Bazel, an Android build or a device. The tests exercise the fixed
token structure: string-valued light/dark palettes
and numeric shared-token groups. Missing assets, malformed JSON and wrong types
fail directly; only a missing namespaced asset uses the root asset path.

The runner uses cached Kotlin 2.2.10 and kotlinx.serialization 1.9.0 without
downloads or dependency resolution. Compilation requires no serialization
compiler plugin because the production parser uses the JsonElement API.
`inputs-sha256.json`, `compile.log`, per-scenario logs and `summary.json` are
written to the requested evidence directory.

The production code uses the library's typed map decoders; there is no custom
recursive token converter or additional source wiring.
