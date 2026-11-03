# Fonts shared by native text rendering and measurement

`ArkUIConfiguration::loadFontData(module, name)` optionally resolves owning
font bytes on UI. The host installs it before runtime bootstrap and maps a
logical name to its bundle resource (for example `res/roboto_mono_regular.ttf`).
No backend resource-manager or network access is introduced.

`font="app_pages:roboto_mono_regular 20"` resolves through that callback.
Both native Text's StyledString run family and typography measurement use the exact
same registered family alias and the borrowed
`OH_Drawing_GetFontCollectionGlobalInstance()`. The borrowed collection is
never destroyed. Missing callbacks/resources, empty data and failed native
registration produce explicit attribute/measurement errors.

Registrations use a process-lifetime cache of qualified name and exact byte
content. Each distinct name/content pair receives a new opaque family alias;
equal names with changed files and multiple hosts cannot overwrite an existing
registration. The cache owns copied mutable bytes for the entire registration
lifetime because the SDK does not document copying the supplied buffer.
Entries are intentionally retained until process exit; backend shutdown does
not unregister fonts still usable by other hosts. Repeated identical requests
reuse the registration. Font native operations run on UI; cache access and
registration are additionally serialized across hosts. Host changes to font
resources must trigger text reapplication and layout invalidation.

System shorthand accepts `system SIZE` and `system-WEIGHT SIZE`, including
thin, ultralight/extralight, light, normal/regular, medium, semibold/demibold,
bold, extrabold/ultrabold, and black/heavy (100 through 900). Positive finite
decimal point sizes are supported. `fontFamily` can name an installed family
or `module:name`. Explicit fontSize/fontWeight/fontFamily override their
shorthand fields regardless of application order and reset to shorthand.

Labels now use real StyledString parts for per-run fonts, colors and
decorations, sharing the same paragraph builder with measurement. Label
system shorthand also supports italic forms; editor shorthand is unchanged.
Per-paragraph resolution loads each family once and checks the application
generation after every unique lookup to discard stale reentrant work.
See `LABEL_API.md` for letter/line spacing, line-height priority, native glyph
baselines, unsupported spans, and the pinned Yoga baseline/inset limitations.
Font variation axes, dynamic-type shorthand and exact cross-platform
fallback/line-break parity are not implemented. Object compilation and host
helper tests do not establish device font registration or pixel/metric parity;
parent live QA owns that.
