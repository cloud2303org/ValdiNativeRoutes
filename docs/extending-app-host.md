# Extending the application host

`app_foundation/src/host/AppContext` owns the shared `AppContextHost` and its
`getHost(): AppContextHost` getter. Navigation remains a shared native capability.
Application-specific native capabilities belong to an application module, with
their own exported contract, generated getter, native implementation, and factory
registration. Removing the throwaway TokenStore contract does not require a
replacement native state API.

## Declare an application-owned contract

Declare the application proxy's full native surface explicitly, and reference the
real shared navigation type:

```ts
// Example application module my_application/src/AppHost.d.ts.
import type { NavigationHost } from 'app_foundation/src/navigation/NavigationHost';

/** @ExportModule({ios: 'MyAppHostModule', android: 'com.example.app.AppHostModule'}) */
export declare function getHost(): AppHost;

/** @ExportProxy({ios: 'MyAppHost', android: 'com.example.app.AppHost'}) */
export interface AppHost {
  getNavigationHost(): NavigationHost;
  getBuildLabel(): string;
}
```

Use a complete interface without `extends`. Exported native interface inheritance
is unsupported by the current generator and is outside this change.
`getBuildLabel` is an example, not a capability added to the application.

Both annotations are required for this pattern: the proxy describes the object
crossing the native boundary, and the module export generates its native getter
and module factory. These are JSDoc codegen annotations, not runtime TS decorators.
Place the module annotation on the first declaration, before the proxy interface,
as shown; the current parser requires it at the top of the declaration file.
The module must declare its foundation dependency and use the real module paths
and native type metadata. The factory's module ID is the application declaration's
path, such as `my_application/src/AppHost`; it does not replace
`app_foundation/src/host/AppContext`.

The explicit declaration is a separate native contract. With a navigation-only
base it is structurally assignable to `AppContextHost` in TS, but that does not
establish native protocol/class inheritance or add capabilities to the base getter.
If the base contract changes, maintain the application surface explicitly.

The application must implement every generated member on Android and iOS, return
that implementation from its generated application module getter, and register
the generated application module factory in native application composition
before JS requests it. Follow the composition points in
`android/app/src/main/java/io/valdiroutes/app/AppNativeModules.kt` and
`ios/ValdiRoutes/AppNativeModules.swift`: Android uses
`ModuleFactoryRegistry.registerModuleFactory`, and iOS uses
`runtime.registerNativeModuleFactory`. Native implementations can delegate
navigation to the existing navigation host. A shared implementation may need to
conform to both generated protocols/interfaces explicitly.

Generated C++ bindings describe the same application-owned surface; a C++ native
implementation, if used, also implements that surface and registers its generated
factory through `Valdi::RegisterModuleFactory`. Generation is not evidence of
native compilation, linking, registration, or runtime execution. Adding a native
capability requires compatible native binaries, not just an OTA type declaration.

## Keep the base getter honest

Import the application's getter when calling application-only capabilities.
The shared getter continues to return only its declared base contract:

```ts
import { getHost as getBaseHost } from 'app_foundation/src/host/AppContext';
import { getHost as getAppHost } from 'my_application/src/AppHost';

getAppHost().getBuildLabel(); // Only after native implementation and registration.
getBaseHost().getNavigationHost();
// getBaseHost().getBuildLabel(); // TS error: not part of AppContextHost.
// getBaseHost<AppHost>();        // TS error: the getter is not generic.
```

Do not declaration-merge application methods into foundation. That would advertise
methods its generated schema and existing native implementations do not provide,
and reverse the dependency boundary. A helper such as
`as<T>()`, `getHost() as AppHost`, or a generic getter implemented with a cast
cannot install runtime fields, generate proxy methods, or register native
implementations. Such casts are not extension support.

## JavaScript state has a different owner

Ordinary application state can remain a module-owned Zustand singleton, for
example a `createStore<AppState>(...)` export under the application's services.
Its values and actions are JS state; they do not need a native Host contract.
Import that singleton from its application module. It is shared within that JS
module/runtime instance, not automatically across native objects or independent
runtimes, and persistence requires an explicit storage design.

Keep JS authentication/session/UI state separate from typed native capabilities.
A TS interface or cast does not move a Zustand store into native storage or make
its actions callable through the generated Host schema.

## Bounded proof

Run only the focused regression:

```sh
cd tools/valdi-rolldown
node --import tsx --test host-extension.test.ts
```

`host-extension.test.ts` creates temporary application declarations, reuses the
real foundation program's paths and compiler settings, enables strict TS checks,
and calls the actual `generateNativeCode` dependency-registration pipeline.
It checks:

- TS accepts the application-owned explicit interface and its custom member.
  The base getter resolves to the real foundation declaration, stays non-generic,
  and rejects custom-member access and assignment to the extended type.
- The explicitly declared application proxy emits navigation and custom
  method signatures, proxy support, schemas, and its own module factory path in
  Kotlin, Objective-C, and C++. Navigation uses the real foundation native type.
- Generating foundation with the business fixtures present produces byte-identical
  output to the foundation-only program, without application methods or dependencies.

Generated native sources remain in memory. Fixtures are deleted after the test;
no standalone native output, native build, or device validation is involved.

