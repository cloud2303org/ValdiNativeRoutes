# Valdi module resources

For the native bindings (Kotlin, Objective-C and C++, checked against Valdi's compiler goldens with
`npx tsx codegen/goldens.ts`), see the repository README's “构建” and “C++ 绑定” sections.

The build and dev server generate `app_pages/res` from the files directly inside
`valdi/modules/app_pages/res/`. Images keep their existing platform resource pipeline.

## Custom fonts

Place a `.ttf` file in that directory, for example `brand_regular.ttf`:

```tsx
import res from 'app_pages/res';

// Inside a Valdi component's onRender():
<label value="Hello" font={res.brandRegular(18)} />;
```

Font filenames may contain ASCII letters, digits, underscores and hyphens. Names
are normalized using Valdi's snake-case convention (`Brand-Regular.ttf` becomes
`brand_regular.ttf`), then exposed in camelCase (`brandRegular`). Fonts and images
must have distinct generated property names; conflicting names fail the build.
Only `.ttf` is supported, matching the current native runtime's module font loaders.

The generated `res.ts` declares a `(size: number) => string` method per font.
`res.assetcatalog` contains font entries with type 2 and zero width/height. The
font bytes are stored as `res/<normalized_name>.ttf` inside `app_pages.valdimodule`,
where both Android and iOS read them. No extra native font registration is needed.
Release compilation preserves the font bytes; module-based OTA packages include
them with the module.

The dev server watches `res/`, regenerates the catalog and TypeScript references,
and sends changed font files. Restart the app after replacing an already-used
font: platform font caches are not explicitly invalidated by this tooling.

Each weight should be supplied as its own font file, referenced through its own
generated method. The font must contain the glyphs needed by the UI; for example,
a Latin-only font does not supply Chinese glyphs.
