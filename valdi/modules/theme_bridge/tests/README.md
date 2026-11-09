# Typed native theme tests

Prepare the real generated Android models and run the JVM integration check:

```sh
node scripts/node-modules.mjs android
python3 valdi/modules/theme_bridge/tests/run_theme_tokens_tests.py --evidence /tmp/valdi-theme-tests
```

The runner compiles the production store and factory, executes them against the
real generated model JAR and runtime classes, and checks that native reads and
the bridge share the same token tree. It also verifies that an invalid Kotlin
consumer fails compilation. Only Android Log is substituted; no token model or
store is replaced. There is no JSON parser or asset fixture.

The runner uses cached Kotlin compiler dependencies without downloading them.
It records input hashes, compiler output, runtime output and a summary under the
evidence directory. JVM execution does not prove Android packaging or JNI behavior.

For Swift, prepare `node scripts/node-modules.mjs ios`, then run
`ios/Tests/run-theme-tokens-access-tests.sh`. This compiles and links an independent
consumer against the actual generated module and checks a type error. It does
not launch an iOS executable.
