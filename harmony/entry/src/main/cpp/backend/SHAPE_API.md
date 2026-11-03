# Native Shape

`shape` and `ArkUIShapeView` create an actual ArkUI custom node whose
`ARKUI_NODE_CUSTOM_EVENT_ON_DRAW` callback draws a native
`OH_Drawing_Path` on the borrowed `OH_Drawing_Canvas`. There is no icon,
SVG conversion, raster image, business-code replacement, or fallback view.

## Baseline attributes

| Attribute | Input | Reset |
| --- | --- | --- |
| `path` | `Float64Array` from the pinned `valdi_core/src/utils/GeometricPathBuilder` | Empty path |
| `fillColor` | Standard Valdi processed RGBA, converted to Drawing ARGB | Transparent |
| `strokeColor` | Standard Valdi processed RGBA, converted to Drawing ARGB | Transparent |
| `strokeWidth` | Finite nonnegative logical points | 1 point |
| `strokeCap` | `butt`, `round`, `square` | `butt` |
| `strokeJoin` | `miter`, `round`, `bevel` | `miter` |

Fill draws before stroke, with antialiasing and nonzero winding. Zero stroke
width disables the stroke. Miter limit is 10. Inherited view attributes,
transforms, opacity, clipping, accessibility and gestures retain their existing
backend implementation. Shape attributes are discrete even inside animations.
Gradient fill, partial stroke ranges and path morphing are outside this baseline;
they are not bound as if supported.

## Exact pinned path contract

The source is `.tools/harmony/upstream`, the source tree selected by the current
runtime compile database. Relevant files:

- `src/valdi_modules/src/valdi/valdi_core/src/utils/GeometricPathBuilder.ts`
- `valdi_core/src/valdi_core/cpp/Utils/GeometricPath.hpp`
- `valdi_core/src/valdi_core/cpp/Utils/GeometricPath.cpp`
- `valdi_core/src/valdi_core/ios/valdi_core/SCValdiGeometricPath.mm`
- `valdi/src/java/com/snap/valdi/utils/GeometricPath.kt`

The buffer consists of native Float64 words, starting with
`[extentWidth, extentHeight, scaleMode]`. The actual business NavigationBar
imports the `utils/GeometricPathBuilder` above and emits:

```
24, 24, 2, 1, 15, 6, 2, 9, 12, 2, 15, 18
```

Opcodes and operands:

```
1 Move       x y
2 Line       x y
3 Quad       endX endY controlX controlY
4 Cubic      endX endY control1X control1Y control2X control2Y
5 RoundRect  x y width height radiusX radiusY
6 Arc        centerX centerY radius startRadians sweepRadians
7 Close
```

The pinned standalone `valdi_core/src/GeometricPath.ts` has a newer,
control-first builder signature. Its binary payload has no version marker and
cannot be distinguished from the endpoint-first business builder. This backend
uses the exact contract imported by the business and declared in the native
visitor header; Drawing calls reorder those curve operands to controls-first.
The pinned iOS visitor's parameter names and Android quadratic visitor differ
from that header in this revision. Neither is used as a substitute parser.

`ShapePath` validates the entire input before committing an owned, double-aligned
snapshot. It rejects partial Float64 words, truncated instructions, fractional or
unknown opcodes, nonfinite values, nonpositive extents, invalid scale modes,
negative round-rect dimensions/radii and negative arc radii. To bound arc
subdivision work, an individual sweep greater than 64 full turns is rejected.
Rejected assignments preserve the previously accepted path. Drawing rejects
transformed coordinates outside float range without publishing a partial cached
path. Attribute exceptions become `Result<Error>` through the existing
`AttributeDelegate`; C draw callbacks contain exceptions and report them.

The implementation calls the actual upstream `GeometricPath::visit` for all
extent and path instructions. It implements the native visitor directly rather
than recreating a second parser. No separately named `GeometricPathParser` or
reusable contour abstraction was found in this pinned runtime source; the public
visitor is the available reuse boundary. Move and Close preserve separate
contours; rounded rectangles add closed clockwise contours. Arc uses an ellipse
after nonuniform scaling, converts radians to clockwise degrees, and splits
at 180 degrees so native modulo-360 handling cannot erase full turns.
`PathArcTo` connects from the current point when a contour exists.

## Coordinates, invalidation and ownership

`GeometricPath::visit` receives the logical `Node::frame.width/height`. Its
Fill/Contain/Cover/None modes retain upstream centering and scaling behavior.
The draw callback then applies `displayScale` once to the canvas, scaling
both path geometry and logical stroke width. In particular, None remains
unscaled in logical points and still receives display density. The canvas is
already node-local: frame x/y are not added again.

Yoga has already physically resolved node positions for RTL. The path receives
no additional RTL mirror. An inherited explicit transform can mirror it. Frame
updates mark rendering dirty as well as requesting measure/layout; shape
attribute updates and resets mark `NODE_NEED_RENDER`.

`NativeShape` owns its cached Drawing path; transient brushes, pens, rectangles
and rounded rectangles use RAII. The canvas and draw context are borrowed only
within the callback. Canvas transforms are saved/restored, and brushes/pens
are explicitly detached before leaving the callback. Shape state remains
UI-thread-owned alongside Node. The callback retains Node during drawing and
skips painting when suspended. Disposal unregisters ON_DRAW before releasing
the shape's Drawing objects and before removing the custom event receiver or
disposing the ArkUI handle. Detached pooled views can retain their path cache;
attribute resets clear their state before reuse.

## Unsupported-class crash containment

The reported crash is recorded in
`.ci/harmony/2026-11-02-elements/business-input-check-cppcrash.log`.
`AttributesManager::getAttributesForClass` and
`lockFreeGetAttributesForClass` are `noexcept`; their hierarchy/binding callbacks
must not throw an unsupported-class exception.

The manager now returns an unknown class's own hierarchy without throwing.
Binding installs `UnsupportedClassDelegate`, whose official `onApply` contract
returns a Valdi `Error`. Factory resolution reports the unsupported class on UI
and returns `nullptr`, which the runtime's factory lookup and ViewNode creation
paths already accept. `supportsClassNameNatively` remains false. No native
placeholder is created, and the error identifies the requested class.
The pinned `AttributesBindingContext` has no class-level `setError` API.
This contains the explicit unsupported-class throws; it does not claim arbitrary
allocation or dispatcher failure recovery inside the upstream noexcept methods.

## Integration and validation

`ArkUIViewManager.cpp` includes `NativeShape.inc` at file scope. Node owns an
optional `NativeShape` and separate ON_DRAW registration flag; `newNode` and
Factory propagate shape identity. The manager advertises/binds both aliases.
The normal attribute delegate and reset path call the shape helpers. No change
to the public manager header is needed. CMake lists the shape helper files;
the existing `native_drawing` dependency already provides all Drawing APIs.
The runtime's existing core-source glob includes the real `GeometricPath.cpp`.

Run:

```
python3 harmony/entry/src/main/cpp/backend/verify-objects.py --output /tmp/valdi-shape-objects
```

The verifier runs existing host tests plus `tests/shape-state.cpp` under
ASan/UBSan, linking the real pinned `GeometricPath.cpp`. It imports the actual
pinned TypeScript builder through the local `tsx` executable to generate a
chevron byte fixture and passes that fixture to the host executable. Tests cover
chevron coordinates, all scale modes, curves, rounded rectangles, elliptical
arc operands, multiple contours, ownership of unaligned input, malformed input
and transactional rejection, style defaults and validation, and path clearing.

For x86_64-linux-ohos and aarch64-linux-ohos, verification compiles actual backend,
image asset and upstream parser objects; relocatably links them to close asset
and parser references; checks imported ArkUI/Drawing/pixelmap C symbols against
SDK exports; and builds a `--no-undefined` shared SDK symbol probe. Evidence is
`/tmp/valdi-shape-objects/verification.json`.

These checks establish host parser behavior and target compile/link readiness.
They do not execute Drawing, ArkUI callbacks or business navigation on a device.
Parent HAP/device validation must exercise the actual InputCheck chevron,
fill/stroke/curves/arc/contours, density and RTL, frame updates, pooling and
teardown, and an unsupported-class negative control.
