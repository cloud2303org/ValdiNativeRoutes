#include "ArkUIViewManager.hpp"
#include "AnimationMath.hpp"
#include "gesture.hpp"
#include "NativeDeadline.hpp"
#include "ScrollState.hpp"
#include "RefreshState.hpp"
#include "FontResolver.hpp"
#include "LabelText.hpp"
#include "OverlayHitTest.hpp"
#include "ImageGeometry.hpp"
#include "ImageDecodedState.hpp"
#include "DirectImageFilter.hpp"
#include "InputState.hpp"
#include "WheelState.hpp"
#include "SnapshotState.hpp"
#include "SheetInteraction.hpp"
#include "SheetInteractionState.hpp"
#include "NativeShape.inc"
#include "../assets/HarmonyImageAsset.hpp"

#include "valdi/runtime/Attributes/AttributesBindingContext.hpp"
#include "valdi/runtime/Attributes/AttributesApplier.hpp"
#include "valdi/runtime/Attributes/Animator.hpp"
#include "valdi/runtime/Attributes/BorderRadius.hpp"
#include "valdi/runtime/Attributes/BoundAttributes.hpp"
#include "valdi/runtime/Attributes/ValueConverters.hpp"
#include "valdi/runtime/Interfaces/IViewTransaction.hpp"
#include "valdi/runtime/Utils/MainThreadManager.hpp"
#include "valdi/runtime/Views/DefaultMeasureDelegate.hpp"
#include "valdi/runtime/Views/DeferredViewTransaction.hpp"
#include "valdi/runtime/Views/ViewAttributeHandlerDelegate.hpp"
#include "valdi/runtime/Views/ViewFactory.hpp"
#include "valdi/runtime/Context/ViewNode.hpp"
#include "valdi_core/cpp/Events/TouchEvents.hpp"
#include "valdi_core/cpp/Interfaces/IBitmapFactory.hpp"
#include "valdi_core/cpp/Utils/TrackedLock.hpp"
#include "valdi_core/cpp/Utils/ValueArray.hpp"
#include "valdi_core/cpp/Utils/ValueFunction.hpp"
#include "valdi_core/cpp/Utils/ValueMap.hpp"
#include "valdi_core/cpp/Utils/ValueUtils.hpp"
#include "valdi_core/cpp/Resources/Asset.hpp"
#include "valdi_core/cpp/Attributes/TextAttributeValue.hpp"

#include <arkui/native_interface.h>
#include <arkui/node_attributes/picker.h>
#include <arkui/native_animate.h>
#include <arkui/native_gesture.h>
#include <arkui/native_key_event.h>
#include <arkui/ui_input_event.h>
#include <arkui/drawable_descriptor.h>
#include <arkui/native_interface_focus.h>
#include <arkui/styled_string.h>
#include <native_drawing/drawing_font_collection.h>
#include <native_drawing/drawing_register_font.h>
#include <native_drawing/drawing_text_typography.h>
#include <multimedia/image_framework/image/image_packer_native.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <deque>
#include <functional>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <utility>

namespace Valdi::Harmony {
namespace detail {

class NativeAnimation;
static void cancelSubtreeGestures(Node& node);
struct NativeScroll;
struct SheetInteraction;
static void cancelSheetInteractions(Node& node, bool retire = false);
static void sheetScrollProperties(NativeScroll& scroll);
static bool sheetScrollFrame(const std::shared_ptr<NativeScroll>& scroll, ArkUI_NodeEvent* event);
static bool sheetScrollStart(const std::shared_ptr<NativeScroll>& scroll);
static bool sheetScrollEnd(const std::shared_ptr<NativeScroll>& scroll, float velocity, bool canceled);
static void sheetScrollAdmission(Node& node, ArkUI_GestureInterruptInfo* info);
static std::function<bool()> takeSheetScrollPublication(NativeScroll& scroll);
static bool hasSheetScrollSession(NativeScroll& scroll);
struct NativeRefresh;
static bool refreshAttribute(Node& node, const StringBox& name, const Value& value);
static bool resetRefreshAttribute(Node& node, const StringBox& name);
static void bindRefreshAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate);
struct SnapshotJob;
static void cancelSubtreeSnapshots(Node& node);
static void cancelBackendSnapshots(Backend& backend);
static void cancelSubtreeScroll(Node& node);
static void reconcileSubtreeScrollProperties(Node& node, const std::function<bool()>& current);
static void stopSubtreeWheels(Node& node);
static bool scrollAttribute(Node& node, const StringBox& name, const Value& value);
static bool resetScrollAttribute(Node& node, const StringBox& name);
static void bindScrollAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate);
struct NativeTextInput;
static void cancelSubtreeInput(Node& node);
static bool textInputAttribute(Node& node, const StringBox& name, const Value& value);
static bool resetTextInputAttribute(Node& node, const StringBox& name);
static void bindTextInputAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate);
static void updateOverlayHitTesting(Node& node);
enum class Property : size_t { Frame, Opacity, Background, Radius, Transform, RootTransform, RootOpacity, Count };
using Numbers = AnimationNumbers;
static void cancelAnimations(Backend& backend, Node* node = nullptr,
                             NativeAnimation* except = nullptr, const Property* property = nullptr);

[[noreturn]] static void fail(const std::string& message) {
    throw std::runtime_error("Valdi ArkUI: " + message);
}

static void check(int32_t code, const char* operation) {
    if (code != ARKUI_ERROR_CODE_NO_ERROR) {
        fail(std::string(operation) + " failed, ArkUI code " + std::to_string(code));
    }
}

struct Backend : GesturePlatform {
    ArkUI_NativeAnimateAPI_1* animate = nullptr;
    // SDK context handles are wrapper allocations, not context identities.
    // Cache a fallback once, bound to the host's exact mounting surface.
    ArkUI_ContextHandle fallbackAnimationContext = nullptr;
    ArkUI_NodeContentHandle fallbackContent = nullptr;
    ArkUI_NodeHandle fallbackParent = nullptr;
    std::vector<std::weak_ptr<NativeAnimation>> animations;
    uint64_t nextAnimationId = 1;
    uint64_t nextSheetSession = 1;
    // UI-only registry includes nodes awaiting an asynchronously dispatched deleter.
    std::vector<Node*> nodes;
    std::vector<std::weak_ptr<SnapshotJob>> snapshots;

    explicit Backend(ArkUIConfiguration config) : GesturePlatform(std::move(config)) {}

    void requireUI() const {
        if (!configuration.isUIThread()) {
            fail("native node access outside the UI thread");
        }
    }

    void runUI(DispatchFunction fn) const {
        if (configuration.isUIThread()) {
            fn();
        } else {
            // Yoga/attribute callers may hold tracked Valdi locks.
            DropAllTrackedLocks dropLocks;
            configuration.dispatchUI(std::move(fn), true);
        }
    }

    void live() const {
        requireUI();
        if (stopped || shuttingDown) {
            fail("backend is shut down");
        }
    }

    void report(const std::string& message) const noexcept {
        try {
            configuration.reportError("Valdi ArkUI: " + message);
        } catch (...) {
            std::terminate();
        }
    }
};

static int fontWeight(const Value& value) {
    if (value.isNumber()) {
        const auto number = value.toDouble();
        if (std::isfinite(number) && number >= 100 && number <= 900 &&
            std::fmod(number, 100) == 0) {
            return static_cast<int>(number);
        }
    } else if (value.isString()) {
        return namedFontWeight(value.toStringBox().toStringView());
    }
    fail("fontWeight supports 100..900 in steps of 100, normal, regular, medium, semibold, bold");
}

static void positiveSize(double size) {
    if (!std::isfinite(size) || size <= 0 || size > 100000) {
        fail("fontSize must be finite and positive");
    }
}

static void applyFont(TextStyle& style, const Value& value) {
    if (!value.isString()) fail("font must be a plain string");
    const auto font = parseFont(value.toStringBox().toStringView());
    style.family = font.family;
    style.weight = font.weight;
    style.size = font.size;
}

static OH_Drawing_FontCollection* globalFonts() {
    auto* fonts = OH_Drawing_GetFontCollectionGlobalInstance();
    if (!fonts) fail("global font collection is unavailable");
    return fonts; // Borrowed: explicitly forbidden to destroy by SDK.
}

static std::string resolveFontFamily(Backend& backend, std::string family) {
    backend.live();
    const auto colon = family.find(':');
    if (colon == std::string::npos) return family;
    if (colon == 0 || colon + 1 == family.size() || family.find(':', colon + 1) != std::string::npos) {
        fail("module font family requires module:name");
    }
    if (!backend.configuration.loadFontData) fail("module fonts require loadFontData: " + family);
    auto data = backend.configuration.loadFontData(StringBox::fromCString(family.substr(0, colon).c_str()),
                                                  StringBox::fromCString(family.substr(colon + 1).c_str()));
    if (!data) fail("cannot load font " + family + ": " + data.error().toString());
    return fontRegistry().resolve(family, data.value().data(), data.value().size(), [](FontRegistry::Entry& entry) {
        const auto code = OH_Drawing_RegisterFontBuffer(globalFonts(), entry.alias.c_str(),
                                                       entry.bytes.data(), entry.bytes.size());
        if (code != 0) fail("register module font failed, Drawing code " + std::to_string(code));
    });
}

static ArkUI_TextAlignment textAlignment(const Value& value) {
    const auto text = value.toStringBox().toStringView();
    if (text == "left") return ARKUI_TEXT_ALIGNMENT_START;
    if (text == "right") return ARKUI_TEXT_ALIGNMENT_END;
    if (text == "center") return ARKUI_TEXT_ALIGNMENT_CENTER;
    fail("textAlign supports left, right, center");
}

static uint32_t argb(const Value& value) {
    if (!value.isNumber()) fail("expected a processed Valdi RGBA color");
    const auto rgba = static_cast<uint32_t>(value.toLong());
    return (rgba >> 8) | (rgba << 24);
}

#include "NativeLabel.inc"

static int32_t pixels(float points, float scale) {
    const double result = std::round(static_cast<double>(points) * scale);
    if (!std::isfinite(result) || std::abs(result) > std::numeric_limits<int32_t>::max() / 2) {
        fail("invalid or overflowing layout coordinate");
    }
    return static_cast<int32_t>(result);
}

struct Constraint {
    ArkUI_LayoutConstraint* value = OH_ArkUI_LayoutConstraint_Create();
    Constraint(int32_t width, int32_t height) {
        if (!value) fail("cannot allocate layout constraint");
        OH_ArkUI_LayoutConstraint_SetMinWidth(value, width);
        OH_ArkUI_LayoutConstraint_SetMaxWidth(value, width);
        OH_ArkUI_LayoutConstraint_SetMinHeight(value, height);
        OH_ArkUI_LayoutConstraint_SetMaxHeight(value, height);
        OH_ArkUI_LayoutConstraint_SetPercentReferenceWidth(value, width);
        OH_ArkUI_LayoutConstraint_SetPercentReferenceHeight(value, height);
    }
    ~Constraint() { OH_ArkUI_LayoutConstraint_Dispose(value); }
    Constraint(const Constraint&) = delete;
    Constraint& operator=(const Constraint&) = delete;
};

struct NativeScroll : std::enable_shared_from_this<NativeScroll> {
    using NoticeType = ScrollNoticeType;
    std::weak_ptr<Node> node;
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr, content = nullptr;
    bool attached = false, contentAttached = false, receiver = false;
    bool customReceiver = false, measureRegistered = false, layoutRegistered = false;
    std::vector<ArkUI_NodeEventType> registered;
    ScrollGeometry geometry;
    ScrollState<Point> sequence;
    // Exact queued notice identities, not SDK event IDs. A manual sheet
    // publication owns only its own post-runtime correction permission.
    std::vector<std::pair<const ScrollState<Point>::Notice*, std::function<bool()>>> sheetPublications;
    Point offset, rawOffset, velocity, requestedOffset;
    bool pending = false, pendingAnimated = false, commandQueued = false, silentPending = false;
    bool suppress = false, retired = false, draining = false, retryQueued = false, dragTargetQueued = false;
    bool enabled = true, paging = false, verticalIndicator = true, horizontalIndicator = true;
    bool bounces = true, bounceStart = true, bounceEnd = true;
    bool smallVertical = false, smallHorizontal = false, cancelsTouches = true, stopOnTouch = false;
    bool dismissKeyboardOnDrag = false;
    uint64_t geometryRevision = 0, laidOutRevision = 0;
    ScrollMotion motion;

    explicit NativeScroll(const std::shared_ptr<Node>& owner);
    void initialize();
    void retire(ArkUI_NodeHandle parent);
    void properties();
    void specs(const Point& offset, const Size& size, bool animated);
    void didLayout();
    void queueCommand();
    void queueDragTarget();
    void writeOffset(const Point& point, bool animated);
    void sample(bool movement = false);
    void enqueue(NoticeType type);
    void enqueue(std::initializer_list<NoticeType> types);
    void drain();
    void cancel(bool notify = true);
    void touchDown();
    void post(DispatchFunction work);
    static void event(ArkUI_NodeEvent* event) noexcept;
    static void customEvent(ArkUI_NodeCustomEvent* event) noexcept;
};

struct NativeRefresh : std::enable_shared_from_this<NativeRefresh> {
    std::weak_ptr<Node> node;
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr;
    bool attached = false, receiver = false, retired = false, writing = false;
    std::vector<ArkUI_NodeEventType> registered;
    RefreshState state;
    Ref<ValueFunction> onRefresh;
    explicit NativeRefresh(const std::shared_ptr<Node>& owner);
    bool active() const;
    void initialize();
    void properties();
    void cancel(bool clear = false);
    void reconcile(uint64_t generation);
    void retire(ArkUI_NodeHandle parent);
    static void event(ArkUI_NodeEvent* event) noexcept;
};

#include "NativeWheel.hpp"

struct NativeTextInput : std::enable_shared_from_this<NativeTextInput> {
    std::weak_ptr<Node> node;
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle handle = nullptr;
    bool area = false, receiver = false, retired = false;
    bool enabled = true, selectOnFocus = false;
    bool focused = false, requestedFocus = false, pendingFocus = false, closes = true;
    bool composing = false, pasted = false;
    int32_t limit = -1, endReason = 0;
    int32_t enterKey = ARKUI_ENTER_KEY_TYPE_DONE;
    int32_t keyboard = ARKUI_TEXTINPUT_TYPE_NORMAL;
    std::string autocapitalization = "sentences", autocorrection = "default";
    InputEdit committed;
    InputSelection notifiedSelection;
    InputEpoch epoch;
    InputSetterEchoes setterEchoes;
    uint64_t focusGeneration = 0;
    InputActions<Ref<ValueFunction>, 7> actions;
    std::vector<ArkUI_NodeEventType> registered;
    explicit NativeTextInput(const std::shared_ptr<Node>& owner, bool multiline);
    ArkUI_NodeAttributeType attr(ArkUI_NodeAttributeType field, ArkUI_NodeAttributeType multi) const {
        return area ? multi : field;
    }
    bool valid() const;
    void initialize();
    void activate();
    void stop(bool clear = false);
    void retire();
    void focus(bool value);
    void requestPendingFocus();
    void style();
    void configuration();
    void write(const InputEdit& edit, bool text, bool selection);
    InputSelection selection(const std::string& text) const;
    void store(const char* key, const Value& value);
    bool storeEdit(uint64_t generation);
    Value eventValue(const InputEdit& edit, bool reason = false) const;
    void deliver(const Ref<ValueFunction>& callback, const Value& event);
    void emit(const Ref<ValueFunction>& callback, const InputEdit& edit, bool reason = false);
    void emit(size_t action, const InputEdit& edit, bool reason = false);
    void change(ArkUI_TextChangeEvent& event);
    void submit();
    static void event(ArkUI_NodeEvent* event) noexcept;
};

struct Node : GestureNode, std::enable_shared_from_this<Node> {
    std::shared_ptr<Backend> backend;
    ArkUI_NodeHandle textHandle = nullptr;
    ArkUI_NodeHandle imageHandle = nullptr;
    bool imageAttached = false;
    bool imageAttachmentEnabled = true;
    ArkUI_DrawableDescriptor* imageDescriptor = nullptr;
    Ref<ValdiHarmony::HarmonyImageAsset> imageAsset;
    Ref<ValueFunction> onImageDecoded;
    ImageDecodedState imageDecoded;
    bool imageFlip = false;
    float contentScaleX = 1, contentScaleY = 1, contentRotation = 0;
    std::shared_ptr<NativeScroll> scroll;
    std::shared_ptr<NativeRefresh> refresh;
    std::shared_ptr<NativeTextInput> input;
    std::shared_ptr<NativeWheel> wheel;
    std::shared_ptr<SheetInteraction> sheetInteraction;
    uint64_t sheetMountEpoch = 0, touchEnabledRevision = 0;
    uint64_t sheetBindingGeneration = 0;
    // Only installed around a scroll-initiated focus(false). Stopping editing
    // may reenter JS before its page-wide NODE_FOCUS_STATUS=0 write.
    std::function<bool()> scrollBlurCurrent;
    std::unique_ptr<NativeShape> shape;
    bool shapeDrawRegistered = false;
    std::weak_ptr<Node> parent;
    std::vector<std::shared_ptr<Node>> children;
    ArkUI_NodeContentHandle content = nullptr;
    ArkUI_NodeHandle hostParent = nullptr;
    bool hasFrame = false;
    bool touchRegistered = false;
    bool interceptRegistered = false;
    bool measureRegistered = false;
    bool layoutRegistered = false;
    bool receiverRegistered = false;
    bool clickReceiverRegistered = false;
    bool textAttached = false;
    bool drawRegistered = false;
    TextStyle textStyle;
    std::unique_ptr<NativeLabel> label;
    TextStyle fontBase;
    FontApplicationEpoch fontEpoch;
    bool explicitFontSize = false;
    bool explicitFontWeight = false;
    bool explicitFontFamily = false;
    Weak<ViewNode> viewNode;
    Weak<ViewNodeTree> viewNodeTree;
    bool rootHitTestPassthrough = false;
    bool overlayHitTestManaged = false;
    OverlayHitMode overlayHitTestMode = OverlayHitMode::Default;
    bool gestureRefreshQueued = false;
    std::shared_ptr<GestureNode> retainGestureNode() noexcept override { return weak_from_this().lock(); }
    std::shared_ptr<GestureNode> gestureParent() const override;
    uint64_t gestureMountEpoch() const noexcept override { return sheetMountEpoch; }
    std::shared_ptr<GesturePlatform> gesturePlatform() const override { return backend; }
    bool gestureInputEnabled() const override;
    GestureLocation convertGestureLocation(GesturePoint physical) const override;
    bool gestureWheelOwns(const ArkUI_GestureInterruptInfo* info) override;
    void gestureIntercept(const ArkUI_UIInputEvent* input, bool admitted) override;
    void gestureTouchDown() override;
    void setGestureTouchEnabled(bool enabled) override;
    void unregisterGestureInput() override;
    static void inputEvent(ArkUI_NodeEvent* event) noexcept;
    std::vector<DispatchFunction> afterDraw;
    std::vector<std::weak_ptr<SnapshotJob>> snapshots;
    std::array<Numbers, static_cast<size_t>(Property::Count)> presented {};
    std::array<Numbers, static_cast<size_t>(Property::Count)> targets {};

    explicit Node(std::shared_ptr<Backend> backend) : backend(std::move(backend)) {
        presented[static_cast<size_t>(Property::Opacity)][0] = 1;
        presented[static_cast<size_t>(Property::RootOpacity)][0] = 1;
        for (auto property : {Property::Transform, Property::RootTransform}) {
            presented[static_cast<size_t>(property)][2] = 1;
            presented[static_cast<size_t>(property)][3] = 1;
        }
        targets = presented;
    }
    ~Node() {
        dispose();
        auto& registry = backend->nodes;
        registry.erase(std::remove(registry.begin(), registry.end(), this), registry.end());
    }

    void live() const {
        backend->live();
        if (!handle || disposing) fail("view has been disposed");
    }

    void set(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, const ArkUI_AttributeItem& item) {
        live();
        check(backend->api->setAttribute(node, attribute, &item), "setAttribute");
    }

    void number(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, float value) {
        ArkUI_NumberValue number {};
        number.f32 = value;
        ArkUI_AttributeItem item {&number, 1, nullptr, nullptr};
        set(node, attribute, item);
    }

    void integer(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, int32_t value) {
        if (attribute == NODE_FOCUS_STATUS && value == 0 && input && node == input->handle &&
            scrollBlurCurrent && !scrollBlurCurrent()) return;
        ArkUI_NumberValue number {};
        number.i32 = value;
        ArkUI_AttributeItem item {&number, 1, nullptr, nullptr};
        set(node, attribute, item);
    }

    void color(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, uint32_t value) {
        ArkUI_NumberValue number {};
        number.u32 = value;
        ArkUI_AttributeItem item {&number, 1, nullptr, nullptr};
        set(node, attribute, item);
    }

    void string(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute, const std::string& value) {
        ArkUI_AttributeItem item {nullptr, 0, value.c_str(), nullptr};
        set(node, attribute, item);
    }

    void invalidate() {
        live();
        if (shape) backend->api->markDirty(handle, NODE_NEED_RENDER);
        if (scroll && scroll->content) {
            backend->api->markDirty(scroll->content, NODE_NEED_MEASURE);
            backend->api->markDirty(scroll->handle, NODE_NEED_MEASURE);
        }
        if (refresh && refresh->handle) backend->api->markDirty(refresh->handle, NODE_NEED_MEASURE);
        backend->api->markDirty(handle, NODE_NEED_MEASURE);
        if (auto owner = parent.lock()) {
            owner->backend->api->markDirty(owner->handle, NODE_NEED_MEASURE);
        }
    }

    ArkUI_NodeHandle childContainer() const {
        return scroll ? scroll->content : refresh ? refresh->handle : handle;
    }

    void numbers(ArkUI_NodeAttributeType attribute, std::initializer_list<float> values) {
        std::array<ArkUI_NumberValue, 5> numbers {};
        size_t i = 0;
        for (auto value : values) numbers[i++].f32 = value;
        ArkUI_AttributeItem item {numbers.data(), static_cast<int32_t>(i), nullptr, nullptr};
        set(handle, attribute, item);
    }

    void apply(Property property, const Numbers& values) {
        live();
        presented[static_cast<size_t>(property)] = values;
        const auto scale = backend->configuration.displayScale;
        switch (property) {
            case Property::Frame:
                frame = Frame(values[0], values[1], std::max(0.0, values[2]), std::max(0.0, values[3]));
                hasFrame = true;
                if (label) updateLabelInk(pixels(frame.width, scale), pixels(frame.height, scale));
                if (scroll) ++scroll->geometryRevision;
                updateTouchRegion(*this);
                invalidate();
                break;
            case Property::Opacity:
            case Property::RootOpacity:
                number(handle, NODE_OPACITY, std::clamp(
                    presented[static_cast<size_t>(Property::Opacity)][0] *
                    presented[static_cast<size_t>(Property::RootOpacity)][0], 0.0, 1.0));
                break;
            case Property::Background: {
                uint32_t colorValue = 0;
                for (size_t i = 0; i < 4; i++) {
                    colorValue = (colorValue << 8) | static_cast<uint32_t>(
                        std::round(std::clamp(values[i], 0.0, 255.0)));
                }
                color(handle, NODE_BACKGROUND_COLOR, colorValue);
                break;
            }
            case Property::Radius:
                numbers(NODE_BORDER_RADIUS, {
                    static_cast<float>(std::max(0.0, values[0]) * scale),
                    static_cast<float>(std::max(0.0, values[1]) * scale),
                    static_cast<float>(std::max(0.0, values[2]) * scale),
                    static_cast<float>(std::max(0.0, values[3]) * scale)});
                break;
            case Property::Transform:
            case Property::RootTransform: {
                const auto& base = presented[static_cast<size_t>(Property::Transform)];
                const auto& root = presented[static_cast<size_t>(Property::RootTransform)];
                numbers(NODE_TRANSLATE, {static_cast<float>((base[0] + root[0]) * scale),
                                        static_cast<float>((base[1] + root[1]) * scale), 0});
                numbers(NODE_SCALE, {static_cast<float>(base[2] * root[2]),
                                    static_cast<float>(base[3] * root[3])});
                constexpr double radiansToDegrees = 180.0 / 3.14159265358979323846;
                numbers(NODE_ROTATE, {0, 0, 1, static_cast<float>((base[4] + root[4]) * radiansToDegrees), 0});
                break;
            }
            case Property::Count: fail("invalid animation property");
        }
    }

    void applyTextStyle() {
        if (!textHandle) fail("text attributes require ArkUILabel");
        auto keepAlive = shared_from_this();
        std::lock_guard fontLock(fontRegistry().mutex);
        applyResolvedLabel(fontEpoch, textStyle,
            [&](const std::string& family) { return resolveFontFamily(*backend, family); },
            [&] { return handle && !disposing && !backend->stopped && !backend->shuttingDown; },
            [&](const TextStyle& style, const std::vector<LabelRun>& runs) {
                auto next = std::make_unique<NativeLabel>(style, runs, rtl, backend->configuration.displayScale);
                if (hasFrame) next->layout(pixels(frame.width, backend->configuration.displayScale));
                ArkUI_AttributeItem item{nullptr, 0, nullptr, next->styled.get()};
                // Reset also clears Text's cached paragraph manager. Replacing
                // only the external pointer can leave that cache borrowing the
                // previous paragraph until the next native measure.
                if (label) check(backend->api->resetAttribute(textHandle, NODE_TEXT_CONTENT_WITH_STYLED_STRING),
                                 "clear previous label paragraph");
                set(textHandle, NODE_TEXT_CONTENT_WITH_STYLED_STRING, item);
                label = std::move(next);
                invalidate();
            });
    }

    void updateLabelInk(int32_t width, int32_t height) {
        // TypographyLayout needs a positive shaping width even when Yoga gives
        // this leaf zero area. Suppress the actual inner Text's ink; wrapper
        // dimensions alone do not clip it (clipToBounds may remain false).
        if (label && textHandle) number(textHandle, NODE_OPACITY, labelHasPaintArea(width, height) ? 1 : 0);
    }

    // Must precede descriptor disposal and release of its backing pixelmap.
    void resetImageSource() {
        if (!imageDescriptor) return;
        check(backend->api->resetAttribute(imageHandle, NODE_IMAGE_SRC), "reset image source");
        OH_ArkUI_DrawableDescriptor_Dispose(std::exchange(imageDescriptor, nullptr));
    }

    void restoreImageSource() {
        if (!imageHandle || imageDescriptor || imageAsset == nullptr || !imageAttachmentEnabled) return;
        auto* descriptor = OH_ArkUI_DrawableDescriptor_CreateFromPixelMap(imageAsset->getPixelmap());
        if (!descriptor) fail("create image pixelmap descriptor failed");
        // Keep ownership even if setting the attribute reports a native error:
        // disposal will reset the potentially observed source before release.
        imageDescriptor = descriptor;
        ArkUI_AttributeItem item {nullptr, 0, nullptr, descriptor};
        set(imageHandle, NODE_IMAGE_SRC, item);
    }

    void setImageAttachmentEnabled(bool enabled) {
        imageAttachmentEnabled = enabled;
        if (wheel) {
            if (enabled) wheel->activate();
            else wheel->stop();
        }
        if (refresh) {
            if (!enabled) refresh->cancel();
            else refresh->properties();
        }
        if (input) {
            if (enabled) input->activate();
            else input->stop();
        }
        if (imageHandle) {
            if (enabled) {
                restoreImageSource();
                queueImageDecoded();
            } else {
                imageDecoded.detach();
                resetImageSource();
            }
        }
        for (auto& child : children) child->setImageAttachmentEnabled(enabled);
    }

    void applyImageTransform() {
        if (!imageHandle) fail("image attributes require ArkUIImageView");
        ArkUI_NumberValue scale[2] {};
        scale[0].f32 = contentScaleX * (imageFlip ? -1 : 1);
        scale[1].f32 = contentScaleY;
        ArkUI_AttributeItem item {scale, 2, nullptr, nullptr};
        set(imageHandle, NODE_SCALE, item);
        ArkUI_NumberValue rotation[5] {};
        rotation[2].f32 = 1;
        rotation[3].f32 = contentRotation * (180.0 / 3.14159265358979323846);
        item = {rotation, 5, nullptr, nullptr};
        set(imageHandle, NODE_ROTATE, item);
    }

    void setImageAsset(const Ref<LoadedAsset>& asset, bool flip) {
        auto keepAlive = shared_from_this();
        if (!imageHandle) fail("loaded image requires ArkUIImageView");
        auto typed = castOrNull<ValdiHarmony::HarmonyImageAsset>(asset);
        if (asset != nullptr && typed == nullptr) fail("loaded image must be a HarmonyImageAsset");
        if (typed != imageAsset) {
            resetImageSource();
            imageAsset = std::move(typed);
            imageDecoded.setAsset(imageAsset != nullptr);
        }
        imageFlip = flip;
        applyImageTransform();
        restoreImageSource();
        invalidate();
        queueImageDecoded();
    }

    void queueImageDecoded() {
        if (!imageHandle || !imageAttachmentEnabled || disposing || !imageCallbacksActive()) return;
        const auto ticket = imageDecoded.schedule();
        if (!ticket) return;
        auto weak = weak_from_this();
        backend->configuration.dispatchUI([weak, ticket = *ticket] {
            auto owner = weak.lock();
            if (!owner) return;
            try {
                owner->backend->requireUI();
                if (!owner->imageCallbacksActive() || owner->imageAsset == nullptr ||
                    !owner->imageDecoded.consume(ticket)) return;
                auto callback = owner->onImageDecoded;
                auto asset = owner->imageAsset; // Retain the decoded pixelmap through reentrant JS.
                if (callback == nullptr || callback->ownerIsTearingDown()) return;
                auto result = callback->call(ValueFunctionFlagsNone,
                    {Value(double(asset->getWidth())), Value(double(asset->getHeight()))});
                if (!result) owner->backend->report(result.error().toString());
                // No native access after JS. It may have removed/rebound us.
            } catch (const std::exception& error) {
                owner->backend->report(error.what());
            }
        }, false);
    }

    bool imageCallbacksActive() const {
        if (!handle || disposing || backend->stopped || backend->suspended || backend->shuttingDown) return false;
        const Node* root = this;
        auto ancestor = parent.lock();
        while (ancestor) {
            if (ancestor->disposing) return false;
            root = ancestor.get();
            ancestor = ancestor->parent.lock();
        }
        return root->content || root->hostParent;
    }

    void detach() {
        live();
        const auto sheetEpoch = ++sheetMountEpoch;
        cancelSheetInteractions(*this, true);
        if (sheetMountEpoch != sheetEpoch || !handle || disposing || backend->stopped || backend->shuttingDown) return;
        fontEpoch.invalidate();
        stopSubtreeWheels(*this);
        cancelSubtreeInput(*this);
        cancelSubtreeScroll(*this);
        if (!handle || disposing || backend->stopped || backend->shuttingDown) return;
        cancelSubtreeGestures(*this);
        if (!handle || disposing || backend->stopped || backend->shuttingDown) return;
        setImageAttachmentEnabled(false);
        if (auto owner = parent.lock()) {
            check(backend->api->removeChild(owner->childContainer(), handle), "remove child");
            auto& siblings = owner->children;
            siblings.erase(std::remove_if(siblings.begin(), siblings.end(),
                                         [this](const auto& child) { return child.get() == this; }),
                           siblings.end());
            parent.reset();
            updateOverlayHitTesting(*this);
            if (scroll) scroll->properties(); // Restore ordinary nesting after leaving Refresh.
            if (owner->refresh) owner->refresh->cancel();
            owner->invalidate();
        }
        if (content) {
            check(OH_ArkUI_NodeContent_RemoveNode(content, handle), "remove root from NodeContent");
            content = nullptr;
        }
        if (hostParent) {
            check(backend->api->removeChild(hostParent, handle), "remove root from native parent");
            hostParent = nullptr;
        }
        // All native detachment is complete before snapshot error callbacks
        // may reenter. No native access follows those callbacks.
        cancelSubtreeSnapshots(*this);
    }

    void dispose() noexcept {
        if (!handle || disposing) return;
        try {
            backend->requireUI();
            disposing = true;
            ++sheetMountEpoch;
            cancelSheetInteractions(*this, true);
            cancelSubtreeSnapshots(*this);
            imageDecoded.setCallback(false);
            onImageDecoded = nullptr;
            fontEpoch.invalidate();
            if (input) input->retire();
            if (wheel) wheel->retire();
            cancelAnimations(*backend, this);
            if (scroll) scroll->cancel();
            cancelGestures(*this, true);
            setImageAttachmentEnabled(false);
            viewNode.reset();
            viewNodeTree.reset();
            afterDraw.clear();
            if (drawRegistered) {
                check(OH_ArkUI_UnregisterDrawCallbackOnNodeHandle(handle), "unregister draw callback");
                drawRegistered = false;
            }
            if (shapeDrawRegistered) {
                backend->api->unregisterNodeCustomEvent(handle, ARKUI_NODE_CUSTOM_EVENT_ON_DRAW);
                shapeDrawRegistered = false;
            }
            shape.reset(); // Unregister userdata before destroying owned Drawing objects.
            // Native relationships do not own C handles; unlink before disposal.
            if (auto owner = parent.lock()) {
                check(backend->api->removeChild(owner->childContainer(), handle), "dispose: remove child");
                auto& siblings = owner->children;
                siblings.erase(std::remove_if(siblings.begin(), siblings.end(),
                                             [this](const auto& child) { return child.get() == this; }),
                               siblings.end());
                parent.reset();
                if (owner->refresh) owner->refresh->cancel();
            }
            if (content) {
                check(OH_ArkUI_NodeContent_RemoveNode(content, handle), "dispose: remove root");
                content = nullptr;
            }
            if (hostParent) {
                check(backend->api->removeChild(hostParent, handle), "dispose: remove host child");
                hostParent = nullptr;
            }
            for (auto& child : children) {
                check(backend->api->removeChild(childContainer(), child->handle), "dispose: unlink child");
                child->parent.reset();
                if (!backend->stopped && !backend->shuttingDown) {
                    if (refresh && child->scroll && !child->disposing) child->scroll->properties();
                    updateOverlayHitTesting(*child);
                }
            }
            children.clear();
            if (scroll) {
                scroll->retire(handle);
                scroll.reset();
            }
            if (refresh) {
                refresh->retire(handle);
                refresh.reset();
            }
            if (imageHandle) {
                resetImageSource();
                imageAsset = nullptr;
                if (imageAttached) check(backend->api->removeChild(handle, imageHandle), "dispose: unlink image");
                backend->api->disposeNode(imageHandle);
                imageHandle = nullptr;
            }
            if (textHandle) {
                // Native disposal can release only the public node reference;
                // a queued FrameNode/layout wrapper may still hold TextPattern.
                // Clear its external paragraph and paragraph manager while
                // all borrowed StyledString/typography storage is still live.
                if (label) check(backend->api->resetAttribute(textHandle, NODE_TEXT_CONTENT_WITH_STYLED_STRING),
                                 "dispose: clear borrowed label paragraph");
                if (textAttached) {
                    check(backend->api->removeChild(handle, textHandle), "dispose: unlink text");
                }
                backend->api->disposeNode(textHandle);
                textHandle = nullptr;
                label.reset();
            }
            if (measureRegistered) {
                backend->api->unregisterNodeCustomEvent(handle, ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE);
            }
            if (layoutRegistered) {
                backend->api->unregisterNodeCustomEvent(handle, ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT);
            }
            if (receiverRegistered) {
                check(backend->api->removeNodeCustomEventReceiver(handle, customEvent), "remove custom receiver");
            }
            if (clickReceiverRegistered) {
                check(backend->api->removeNodeEventReceiver(handle, inputEvent), "remove input receiver");
            }
            backend->api->disposeNode(handle);
            gestureNativeSourceDisposed(*backend, handle);
            handle = nullptr;
        } catch (const std::exception& error) {
            // Keeping callbacks attached to a freed userData pointer is unsafe.
            backend->report(error.what());
            std::terminate();
        }
    }

    static void drawCompleted(void* data) noexcept {
        auto* node = static_cast<Node*>(data);
        try {
            auto keepAlive = node->shared_from_this();
            node->live();
            auto callbacks = std::move(node->afterDraw);
            node->afterDraw.clear();
            for (auto& callback : callbacks) callback();
        } catch (const std::exception& error) {
            node->backend->report(error.what());
        }
    }

    static void customEvent(ArkUI_NodeCustomEvent* event) noexcept {
        auto* node = static_cast<Node*>(OH_ArkUI_NodeCustomEvent_GetUserData(event));
        if (!node) return;
        try {
            auto keepAlive = node->shared_from_this();
            node->live();
            auto* api = node->backend->api;
            const auto scale = node->backend->configuration.displayScale;
            const auto type = OH_ArkUI_NodeCustomEvent_GetEventType(event);
            if (type == ARKUI_NODE_CUSTOM_EVENT_ON_DRAW) {
                if (node->shape && !node->backend->suspended) {
                    auto* context = OH_ArkUI_NodeCustomEvent_GetDrawContextInDraw(event);
                    if (!context) fail("shape draw callback has no context");
                    auto* canvas = static_cast<OH_Drawing_Canvas*>(OH_ArkUI_DrawContext_GetCanvas(context));
                    node->shape->draw(canvas, node->frame.width, node->frame.height, scale);
                }
            } else if (type == ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE) {
                auto* incoming = OH_ArkUI_NodeCustomEvent_GetLayoutConstraintInMeasure(event);
                if (!incoming) fail("measure callback has no constraints");
                int32_t width = pixels(node->frame.width, scale);
                int32_t height = pixels(node->frame.height, scale);
                // Before Valdi's first frame, a host root follows the host constraint.
                if (!node->hasFrame) {
                    width = OH_ArkUI_LayoutConstraint_GetMaxWidth(incoming);
                    height = OH_ArkUI_LayoutConstraint_GetMaxHeight(incoming);
                    if (node->imageHandle) {
                        const auto intrinsic = imageIntrinsicSize(
                            node->imageAsset != nullptr ? float(node->imageAsset->getWidth()) : 0,
                            node->imageAsset != nullptr ? float(node->imageAsset->getHeight()) : 0,
                            width == std::numeric_limits<int32_t>::max() ? -1 : float(width), false,
                            height == std::numeric_limits<int32_t>::max() ? -1 : float(height), false);
                        width = std::clamp(static_cast<int32_t>(std::round(intrinsic[0])),
                            OH_ArkUI_LayoutConstraint_GetMinWidth(incoming), width);
                        height = std::clamp(static_cast<int32_t>(std::round(intrinsic[1])),
                            OH_ArkUI_LayoutConstraint_GetMinHeight(incoming), height);
                    }
                    if (width == std::numeric_limits<int32_t>::max() ||
                        height == std::numeric_limits<int32_t>::max()) {
                        fail("host root requires finite constraints or a Valdi frame");
                    }
                }
                if (node->textHandle) {
                    node->updateLabelInk(width, height);
                    if (node->label) node->label->layout(width);
                    Constraint constraint(width, height);
                    check(api->measureNode(node->textHandle, constraint.value), "measure native text");
                }
                if (node->imageHandle) {
                    Constraint constraint(width, height);
                    check(api->measureNode(node->imageHandle, constraint.value), "measure native image");
                }
                if (node->wheel) node->wheel->measure(width, height);
                if (node->refresh) {
                    Constraint constraint(width, height);
                    check(api->measureNode(node->refresh->handle, constraint.value), "measure native Refresh");
                } else if (node->scroll) {
                    node->scroll->geometry.viewportWidth = node->frame.width;
                    node->scroll->geometry.viewportHeight = node->frame.height;
                    Constraint constraint(width, height);
                    check(api->measureNode(node->scroll->handle, constraint.value), "measure native Scroll");
                } else {
                    for (const auto& child : node->children) {
                        Constraint constraint(pixels(child->frame.width, scale), pixels(child->frame.height, scale));
                        check(api->measureNode(child->handle, constraint.value), "measure child");
                    }
                }
                check(api->setMeasuredSize(node->handle, width, height), "set custom measured size");
            } else if (type == ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT) {
                const auto position = OH_ArkUI_NodeCustomEvent_GetPositionInLayout(event);
                check(api->setLayoutPosition(node->handle, position.x, position.y), "set custom layout position");
                if (node->textHandle) {
                    check(api->layoutNode(node->textHandle, 0, 0), "layout native text");
                    if (node->input) node->input->requestPendingFocus();
                }
                if (node->imageHandle) check(api->layoutNode(node->imageHandle, 0, 0), "layout native image");
                if (node->wheel) node->wheel->layout();
                if (node->refresh) {
                    check(api->layoutNode(node->refresh->handle, 0, 0), "layout native Refresh");
                } else if (node->scroll) {
                    check(api->layoutNode(node->scroll->handle, 0, 0), "layout native Scroll");
                    node->scroll->didLayout();
                } else {
                    for (const auto& child : node->children) {
                        // Frames are already physically resolved by Valdi/Yoga, including RTL.
                        check(api->layoutNode(child->handle, pixels(child->frame.x, scale),
                                              pixels(child->frame.y, scale)), "layout child");
                    }
                }
            }
        } catch (const std::exception& error) {
            node->backend->report(error.what());
        }
    }


};

static void validateNativeScrollAxis(const Node& node, bool horizontal) {
    if (auto parent = node.parent.lock(); parent && parent->refresh && horizontal)
        fail("ArkUIRefreshView child must remain a vertical scroll");
}

static int32_t nativeScrollNestedMode(const Node& node) {
    auto parent = node.parent.lock();
    return parent && parent->refresh ? ARKUI_SCROLL_NESTED_MODE_SELF_ONLY : ARKUI_SCROLL_NESTED_MODE_SELF_FIRST;
}

#include "SheetInteractionInput.inc"
#include "WheelArbitration.inc"
#include "SheetInteractionMount.inc"

static void applyInterceptPolicy(const Node& node, const ArkUI_UIInputEvent* input,
                                 bool admitted, const char* operation) {
    // The SDK installs the returned mode on the FrameNode. A previous false
    // predicate must not leave an unscoped view stuck in BLOCK_DESCENDANTS.
    const auto mode = overlayInterceptMode(node.overlayHitTestManaged, node.overlayHitTestMode, admitted)
        .value_or(OverlayHitMode::Default);
    check(OH_ArkUI_PointerEvent_SetInterceptHitTestMode(input,
        mode == OverlayHitMode::None ? HTM_NONE :
        mode == OverlayHitMode::BlockHierarchy ? HTM_BLOCK_HIERARCHY :
        mode == OverlayHitMode::BlockDescendants ? HTM_BLOCK_DESCENDANTS : HTM_DEFAULT), operation);
}

static void cancelSubtreeGestures(Node& node) {
    cancelSheetInteractions(node);
    if (!node.handle || node.disposing || node.backend->stopped || node.backend->shuttingDown) return;
    std::vector<std::shared_ptr<Node>> nodes {node.shared_from_this()};
    for (size_t i = 0; i < nodes.size(); ++i) {
        auto children = nodes[i]->children;
        nodes.insert(nodes.end(), children.begin(), children.end());
    }
    for (auto& value : nodes) {
        cancelGestures(*value);
        refreshGestures(*value);
    }
}

bool Node::gestureInputEnabled() const { return inputEnabled(*this); }
std::shared_ptr<GestureNode> Node::gestureParent() const { return interactionParent(*this); }
bool Node::gestureWheelOwns(const ArkUI_GestureInterruptInfo* info) { return wheelOwnsMountedTouch(*this, info); }
void Node::gestureIntercept(const ArkUI_UIInputEvent* input, bool admitted) {
    applyInterceptPolicy(*this, input, admitted, "apply gesture hit test policy");
}
void Node::gestureTouchDown() { if (scroll) scroll->touchDown(); }
void Node::unregisterGestureInput() {
    if (touchRegistered) backend->api->unregisterNodeEvent(handle, NODE_TOUCH_EVENT);
    if (interceptRegistered) backend->api->unregisterNodeEvent(handle, NODE_ON_TOUCH_INTERCEPT);
    touchRegistered = interceptRegistered = false;
}
void Node::inputEvent(ArkUI_NodeEvent* event) noexcept {
    gestureInputEvent(event);
}
void Node::setGestureTouchEnabled(bool enabled) {
    auto& node = *this;
    if (node.touchEnabled != enabled) {
        auto owner = node.shared_from_this();
        const auto backend = node.backend;
        const auto handle = node.handle;
        const auto parent = node.parent.lock();
        const auto content = node.content;
        const auto hostParent = node.hostParent;
        const auto context = backend->configuration.uiContext;
        const auto mount = node.sheetMountEpoch;
        const auto revision = ++node.touchEnabledRevision;
        node.touchEnabled = enabled;
        auto current = [&] {
            return !owner->disposing && owner->backend == backend && owner->handle == handle &&
                owner->sheetMountEpoch == mount && owner->touchEnabledRevision == revision &&
                owner->touchEnabled == enabled && owner->parent.lock() == parent &&
                owner->content == content && owner->hostParent == hostParent &&
                backend->configuration.uiContext == context && !backend->stopped && !backend->shuttingDown;
        };
        if (!current()) return;
        node.integer(node.handle, NODE_ENABLED, enabled ? 1 : 0);
        if (!current()) return;
        node.integer(node.handle, NODE_HIT_TEST_BEHAVIOR,
                     enabled ? ARKUI_HIT_TEST_MODE_DEFAULT : ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS);
        if (!current()) return;
        cancelSubtreeScroll(node);
        if (!current()) return;
        cancelSubtreeGestures(node);
        if (!current()) return;
        reconcileSubtreeWheels(node);
        if (!current()) return;
        // Cancellation restores selected scroll modes under the current
        // ancestor flag. Re-enable must also reconcile descendants after
        // that old sheet chain has gone, preserving each control's flags.
        reconcileSubtreeScrollProperties(node, current);
        if (!current()) return;
        if (node.refresh) node.refresh->properties();
    }
}
GestureLocation Node::convertGestureLocation(GesturePoint point) const {
    const auto& node = *this;
    Point physical(point.x, point.y);
    Point local(node.rtl ? node.frame.width - physical.x : physical.x, physical.y);
    Point absolute = local;
    auto current = const_cast<Node&>(node).shared_from_this();
    while (auto owner = current->parent.lock()) {
        auto point = addLogicalFrame({absolute.x, absolute.y}, current->frame.x, current->frame.y,
                                     current->frame.width,
                                     owner->scroll ? owner->scroll->geometry.contentWidth : owner->frame.width,
                                     owner->rtl);
        absolute = Point(point.x, point.y);
        current = std::move(owner);
    }
    // ViewNode adds every frame, including the root's logical layout frame.
    absolute.x += current->frame.x;
    absolute.y += current->frame.y;
    // This is exactly the pinned logical conversion, including flattened Yoga
    // nodes. Never wait for a worker which may be waiting for native UI measure.
    if (auto tree = node.viewNodeTree.lock()) {
        if (auto viewNode = node.viewNode.lock()) {
            tree->tryWithLock([&] {
                if (viewNode->getViewNodeTree() == tree.get()) {
                    local = viewNode->convertPointToRelativeDirectionAgnostic(physical);
                    absolute = viewNode->convertPointToAbsoluteDirectionAgnostic(physical);
                }
            }, std::chrono::steady_clock::now());
        }
    }
    return {{local.x, local.y}, {absolute.x, absolute.y}};
}

#include "NativeScroll.inc"
#include "NativeRefresh.inc"
#include "NativeTextInput.inc"
#include "NativeWheel.inc"
#include "SheetInteraction.inc"

static void updateOverlayHitTesting(Node& node) {
    auto root = node.shared_from_this();
    while (auto parent = root->parent.lock()) root = std::move(parent);
    std::vector<std::pair<std::shared_ptr<Node>, bool>> pending{{root, false}};
    while (!pending.empty()) {
        auto [current, inherited] = std::move(pending.back());
        pending.pop_back();
        if (!current->handle || current->disposing) continue;
        const bool scope = inherited || current->rootHitTestPassthrough;
        // hitTest is a filter, not a consumer. A root predicate restricting the
        // bottom bar must not turn the full-viewport root into a target.
        bool interactive = current->wheel != nullptr || current->input != nullptr || current->scroll != nullptr || current->refresh != nullptr ||
            current->onTouch != nullptr || current->onTouchStart != nullptr || current->onTouchEnd != nullptr ||
            bool(current->rootDragObserver.admit) || bool(current->rootDragObserver.onEvent);
        for (const auto& gesture : current->gestureConfig)
            interactive |= gesture.action != nullptr && !gesture.disabled;
        const auto policy = overlayHitPolicy(scope, current->touchEnabled, interactive);
        const auto mode = policy.mode == OverlayHitMode::None ? ARKUI_HIT_TEST_MODE_NONE :
            policy.mode == OverlayHitMode::BlockHierarchy ? ARKUI_HIT_TEST_MODE_BLOCK_HIERARCHY :
            policy.mode == OverlayHitMode::BlockDescendants ? ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS :
            ARKUI_HIT_TEST_MODE_DEFAULT;
        if (scope || current->overlayHitTestManaged) {
            current->integer(current->handle, NODE_HIT_TEST_BEHAVIOR, mode);
            current->overlayHitTestMode = policy.mode;
        }
        current->overlayHitTestManaged = scope;
        for (const auto& child : current->children) pending.emplace_back(child, policy.passToChildren);
    }
}

static std::shared_ptr<Node> newNode(const std::shared_ptr<Backend>& backend, bool label, bool scroll = false,
                                     bool image = false, int input = 0, bool shape = false, bool refresh = false) {
    backend->live();
    auto node = std::shared_ptr<Node>(new Node(backend), [backend](Node* value) {
        // Valdi can release its last View reference on its worker thread.
        if (backend->configuration.isUIThread()) {
            delete value;
        } else {
            backend->configuration.dispatchUI([value]() { delete value; }, false);
        }
    });
    node->handle = backend->api->createNode(ARKUI_NODE_CUSTOM);
    if (!node->handle) fail("create custom native node failed");
    check(backend->api->setLengthMetricUnit(node->handle, ARKUI_LENGTH_METRIC_UNIT_PX), "set pixel units");
    check(backend->api->addNodeEventReceiver(node->handle, Node::inputEvent), "add input receiver");
    node->clickReceiverRegistered = true;
    auto* gestureData = gestureInputUserData(*node);
    check(backend->api->registerNodeEvent(node->handle, NODE_TOUCH_EVENT, 0, gestureData), "register raw touch");
    node->touchRegistered = true;
    check(backend->api->registerNodeEvent(node->handle, NODE_ON_TOUCH_INTERCEPT, 0, gestureData), "register touch intercept");
    node->interceptRegistered = true;
    check(backend->api->addNodeCustomEventReceiver(node->handle, Node::customEvent), "add custom receiver");
    node->receiverRegistered = true;
    check(backend->api->registerNodeCustomEvent(node->handle, ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE, 0, node.get()),
          "register measure callback");
    node->measureRegistered = true;
    check(backend->api->registerNodeCustomEvent(node->handle, ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT, 0, node.get()),
          "register layout callback");
    node->layoutRegistered = true;
    if (shape) {
        node->shape = std::make_unique<NativeShape>();
        check(backend->api->registerNodeCustomEvent(node->handle, ARKUI_NODE_CUSTOM_EVENT_ON_DRAW, 0, node.get()),
              "register shape drawing callback");
        node->shapeDrawRegistered = true;
    }
    if (scroll) {
        node->scroll = std::make_shared<NativeScroll>(node);
        node->scroll->initialize();
    }
    if (refresh) {
        node->refresh = std::make_shared<NativeRefresh>(node);
        node->refresh->initialize();
    }
    if (label) {
        node->textHandle = backend->api->createNode(ARKUI_NODE_TEXT);
        if (!node->textHandle) fail("create native Text node failed");
        check(backend->api->setLengthMetricUnit(node->textHandle, ARKUI_LENGTH_METRIC_UNIT_PX), "set text pixel units");
        check(backend->api->addChild(node->handle, node->textHandle), "add Text content");
        node->textAttached = true;
        // The wrapper owns tap delivery and the text contributes no padding/layout of its own.
        node->integer(node->textHandle, NODE_HIT_TEST_BEHAVIOR, ARKUI_HIT_TEST_MODE_NONE);
        node->integer(node->textHandle, NODE_CLIP, 1);
        node->number(node->textHandle, NODE_OPACITY, 0); // No ink before native geometry is known.
        node->color(node->textHandle, NODE_FONT_COLOR, 0xff000000);
        node->applyTextStyle();
    }
    if (image) {
        node->imageHandle = backend->api->createNode(ARKUI_NODE_IMAGE);
        if (!node->imageHandle) fail("create native Image node failed");
        check(backend->api->setLengthMetricUnit(node->imageHandle, ARKUI_LENGTH_METRIC_UNIT_PX), "set image pixel units");
        check(backend->api->addChild(node->handle, node->imageHandle), "add Image content");
        node->imageAttached = true;
        node->integer(node->imageHandle, NODE_HIT_TEST_BEHAVIOR, ARKUI_HIT_TEST_MODE_NONE);
        node->integer(node->imageHandle, NODE_IMAGE_DRAGGABLE, 0);
        node->integer(node->imageHandle, NODE_IMAGE_OBJECT_FIT, ARKUI_OBJECT_FIT_FILL);
    }
    if (input) {
        node->input = std::make_shared<NativeTextInput>(node, input == 2);
        node->input->initialize();
    }
    backend->nodes.emplace_back(node.get());
    return node;
}

static std::shared_ptr<Node> unwrap(const Ref<View>& view) {
    auto* native = dynamic_cast<ArkUIView*>(view.get());
    if (!native) fail("foreign/null Valdi View passed to ArkUI backend");
    return native->backendNode();
}

#include "NativeSnapshot.inc"

class NativeAnimation final : public snap::valdi_core::Animator,
                              public std::enable_shared_from_this<NativeAnimation> {
public:
    struct Track {
        std::weak_ptr<Node> node;
        Node* identity; // comparison only; also matches a node whose last owner is disposing it
        Property property;
        Numbers from;
        Numbers to;
    };

    std::weak_ptr<Backend> backend;
    NativeTweenOptions options;
    bool beginFromCurrentState;
    double stiffness;
    double damping;
    std::vector<Track> tracks;

    NativeAnimation(const std::shared_ptr<Backend>& owner, NativeTweenOptions options,
                    bool current = true, double stiffness = 0, double damping = 0)
        : backend(owner), options(std::move(options)), beginFromCurrentState(current),
          stiffness(stiffness), damping(damping) {
        owner->live();
        diagnostics.id = owner->nextAnimationId++;
        animationMilliseconds(this->options.duration, this->options.speed);
        animationMilliseconds(this->options.delay, this->options.speed);
        if (this->options.iterations != -1 && this->options.iterations < 1) fail("iterations must be -1 or >= 1");
        if (this->options.duration == 0 && this->options.iterations == -1) fail("zero-duration infinite animation");
        const auto& points = this->options.controlPoints;
        if (!points.empty() && points.size() != 4) fail("cubic animation requires four control points");
        for (double point : points) {
            if (!std::isfinite(point) || std::abs(point) > 1e6) fail("invalid cubic control point");
        }
        if (!points.empty() && (points[0] < 0 || points[0] > 1 || points[2] < 0 || points[2] > 1)) {
            fail("cubic control point x must be in [0,1]");
        }
        switch (this->options.type) {
            case snap::valdi_core::AnimationType::Linear:
            case snap::valdi_core::AnimationType::EaseIn:
            case snap::valdi_core::AnimationType::EaseOut:
            case snap::valdi_core::AnimationType::EaseInOut: break;
            default: fail("unknown Valdi animation type");
        }
        if (!std::isfinite(stiffness) || !std::isfinite(damping) || stiffness < 0 || damping < 0 ||
            stiffness > 1e6 || damping > 1e6 || ((stiffness == 0) != (damping == 0))) {
            fail("spring requires finite stiffness and damping in (0,1000000], or both zero");
        }
        if (stiffness != 0 && !points.empty()) {
            fail("spring does not combine with cubic control points");
        }
        if (stiffness != 0 && this->options.duration == 0) {
            // SpringAnimationOptions has no duration in the pinned JS API.
            // Conservative displacement/velocity envelope: twelve time constants,
            // with extra headroom for the critical damping polynomial.
            this->options.duration = springSettlingDuration(stiffness, damping);
            if (this->options.duration > 60) fail("spring settling duration exceeds 60 seconds");
        }
    }

    ~NativeAnimation() override {
        // Active native callbacks hold self until disposal, always on UI.
        if (handle || option || curve) std::terminate();
    }

    void add(const std::shared_ptr<Node>& node, Property property, const Numbers& to,
             const Numbers* explicitFrom = nullptr) {
        auto owner = backend.lock();
        if (!owner || node->backend != owner) fail("animator belongs to a different ArkUI manager");
        owner->live();
        if (flushed || terminal) fail("cannot append to a flushed/cancelled animator");
        // Capture before cancelling an older group: current-state transitions
        // start at its presentation, ordinary transitions at its logical target.
        const auto index = static_cast<size_t>(property);
        const Numbers from = explicitFrom ? *explicitFrom :
            (beginFromCurrentState ? node->presented[index] : node->targets[index]);
        cancelAnimations(*owner, node.get(), this, &property);
        node->live();
        if (flushed || terminal) fail("animator was cancelled while replacing a previous animation");
        auto found = std::find_if(tracks.begin(), tracks.end(), [&](const Track& track) {
            return track.node.lock() == node && track.property == property;
        });
        if (found == tracks.end()) tracks.push_back({node, node.get(), property, from, to});
        else found->to = to; // repeated writes within one transaction retain initial start
        node->targets[index] = to;
    }

    bool involves(Node* node, const Property* property) const {
        return std::any_of(tracks.begin(), tracks.end(), [&](const Track& track) {
            return (!node || track.identity == node) && (!property || track.property == *property);
        });
    }

    void flushAnimations(const Value& completion) override {
        auto owner = backend.lock();
        if (!owner) fail("animator manager no longer exists");
        owner->runUI([self = shared_from_this(), completion, owner] {
            owner->live();
            if (self->flushed) fail("animator can only be flushed once");
            self->flushed = true;
            self->completion = completion;
            if (self->terminal) {
                self->deliverCompletion();
                return;
            }
            try {
                self->start();
            } catch (...) {
                self->end(true);
                throw;
            }
        });
    }

    void cancel() override {
        auto owner = backend.lock();
        if (!owner) return;
        owner->runUI([self = shared_from_this()] { self->end(true); });
    }

    void setHostCompletion(std::function<void(bool)> callback) { hostCompletion = std::move(callback); }

private:
    ArkUI_AnimatorHandle handle = nullptr;
    ArkUI_AnimatorOption* option = nullptr;
    ArkUI_CurveHandle curve = nullptr;
    std::shared_ptr<NativeAnimation> nativeLifetime;
    // Keeps the API table/dispatcher alive through deferred disposal, even if
    // the host releases its manager from a terminal callback.
    std::shared_ptr<Backend> nativeBackend;
    Value completion;
    std::function<void(bool)> hostCompletion;
    AnimationDiagnostics diagnostics;
    bool flushed = false;
    bool terminal = false;
    bool completionDelivered = false;
    bool cleanupQueued = false;
    int nativeDepth = 0;

    void deliverCompletion() {
        if (!flushed || completionDelivered) return;
        completionDelivered = true;
        auto owner = backend.lock();
        // Move both callbacks out before invocation so reentrant cancellation
        // cannot deliver twice and the animator retains no owning JS context.
        auto value = std::move(completion);
        completion = Value();
        auto host = std::move(hostCompletion);
        if (owner->configuration.animationDiagnostics) {
            try { owner->configuration.animationDiagnostics(diagnostics); }
            catch (...) { owner->report("animationDiagnostics must not throw"); }
        }
        if (value.isFunction()) {
            auto result = value.getFunction()->call(ValueFunctionFlagsNeverCallSync, {Value(diagnostics.cancelled)});
            if (!result) owner->report(result.error().toString());
        }
        if (host) {
            try { host(diagnostics.cancelled); }
            catch (const std::exception& error) { owner->report(error.what()); }
            catch (...) { owner->report("route animation completion threw"); }
        }
    }

    void disposeNative() {
        if (!handle && !option && !curve) return;
        auto owner = backend.lock();
        owner->requireUI();
        if (handle) owner->animate->disposeAnimator(std::exchange(handle, nullptr));
        if (option) OH_ArkUI_AnimatorOption_Dispose(std::exchange(option, nullptr));
        if (curve) OH_ArkUI_Curve_DisposeCurve(std::exchange(curve, nullptr));
        nativeLifetime.reset();
        nativeBackend.reset();
    }

    void cleanup() {
        if (!handle && !option && !curve) return;
        if (nativeDepth == 0) {
            disposeNative();
        } else if (!cleanupQueued) {
            cleanupQueued = true;
            auto owner = backend.lock();
            owner->configuration.dispatchUI([self = shared_from_this()] {
                self->disposeNative();
            }, false);
        }
    }

    void apply(double progress) {
        // No user code runs in this loop; weak references never keep disposed
        // nodes alive. All node teardown cancels first.
        for (const auto& track : tracks) {
            auto node = track.node.lock();
            if (!node || !node->handle) fail("animation target was disposed");
            node->apply(track.property, interpolate(track.from, track.to, progress));
        }
    }

    void end(bool cancelled) {
        auto keepAlive = shared_from_this();
        auto owner = backend.lock();
        if (!owner) return;
        owner->requireUI();
        if (terminal) { cleanup(); return; }
        terminal = true; // Cancel can synchronously invoke the SDK onCancel.
        diagnostics.cancelled = cancelled;
        if (cancelled && handle) {
            ++nativeDepth;
            const auto code = OH_ArkUI_Animator_Cancel(handle);
            --nativeDepth;
            if (code != ARKUI_ERROR_CODE_NO_ERROR) {
                owner->report("OH_ArkUI_Animator_Cancel failed: " + std::to_string(code));
            }
        }
        if (!cancelled && !tracks.empty()) {
            const bool reverseEnd = options.autoreverses && options.iterations % 2 == 0;
            try { apply(reverseEnd ? 0 : 1); }
            catch (const std::exception& error) {
                diagnostics.cancelled = true;
                owner->report(error.what());
            }
        }
        tracks.clear();
        cleanup();
        deliverCompletion();
    }

    static void onFrame(ArkUI_AnimatorOnFrameEvent* event) noexcept {
        auto* raw = static_cast<NativeAnimation*>(OH_ArkUI_AnimatorOnFrameEvent_GetUserData(event));
        auto self = raw->shared_from_this();
        ++self->nativeDepth;
        try {
            auto owner = self->backend.lock();
            owner->requireUI();
            if (!self->terminal) {
                double progress = OH_ArkUI_AnimatorOnFrameEvent_GetValue(event);
                if (self->stiffness != 0) {
                    progress = springProgress(progress * self->options.duration, self->stiffness, self->damping);
                }
                if (!std::isfinite(progress)) fail("native animation returned invalid progress");
                ++self->diagnostics.frameCount;
                // First sample, then bounded milestones, retaining final native
                // progress in slot 8. Never invent an onFrame sample on finish.
                auto& samples = self->diagnostics.progressSamples;
                if (samples.empty() || (samples.size() < 8 &&
                    std::abs(progress - samples.back()) >= 0.125)) samples.push_back(progress);
                else if (samples.size() == 8) samples.back() = progress;
                self->apply(progress);
            }
        } catch (const std::exception& error) {
            if (auto owner = self->backend.lock()) owner->report(error.what());
            self->end(true);
        } catch (...) {
            if (auto owner = self->backend.lock()) owner->report("unknown animation frame exception");
            self->end(true);
        }
        --self->nativeDepth;
    }

    static void onFinish(ArkUI_AnimatorEvent* event) noexcept {
        auto* raw = static_cast<NativeAnimation*>(OH_ArkUI_AnimatorEvent_GetUserData(event));
        auto self = raw->shared_from_this();
        ++self->nativeDepth;
        try { self->end(false); }
        catch (const std::exception& error) {
            if (auto owner = self->backend.lock()) owner->report(error.what());
        }
        --self->nativeDepth;
    }

    static void onCancel(ArkUI_AnimatorEvent* event) noexcept {
        auto* raw = static_cast<NativeAnimation*>(OH_ArkUI_AnimatorEvent_GetUserData(event));
        auto self = raw->shared_from_this();
        ++self->nativeDepth;
        try { self->end(true); }
        catch (const std::exception& error) {
            if (auto owner = self->backend.lock()) owner->report(error.what());
        }
        --self->nativeDepth;
    }

    void start() {
        auto owner = backend.lock();
        if (owner->suspended) fail("cannot start animation while backend is suspended");
        if (tracks.empty()) { end(false); return; }
        // The explicit host UIContext is authoritative for this manager.
        // Without it, establish one common host attachment before obtaining
        // a single context. GetContextByNode allocates wrappers, so comparing
        // its returned pointer addresses never compares instance identity.
        ArkUI_ContextHandle context = owner->configuration.uiContext;
        std::shared_ptr<Node> contextRoot;
        for (const auto& track : tracks) {
            auto node = track.node.lock();
            if (!node || !node->handle) fail("animation target no longer exists");
            node->live();
            auto root = node;
            while (auto parent = root->parent.lock()) root = std::move(parent);
            if (!root->content && !root->hostParent) fail("animation target is not mounted");
            if (!context && contextRoot &&
                (contextRoot->content != root->content || contextRoot->hostParent != root->hostParent)) {
                fail("animation across different mount surfaces requires configuration.uiContext");
            }
            contextRoot = std::move(root);
        }
        if (!context) {
            if (owner->fallbackAnimationContext &&
                (owner->fallbackContent != contextRoot->content || owner->fallbackParent != contextRoot->hostParent)) {
                fail("changing animation mount surface requires configuration.uiContext");
            }
            if (!owner->fallbackAnimationContext) {
                owner->fallbackAnimationContext = OH_ArkUI_GetContextByNode(contextRoot->handle);
                owner->fallbackContent = contextRoot->content;
                owner->fallbackParent = contextRoot->hostParent;
            }
            context = owner->fallbackAnimationContext;
            if (!context) fail("mounted root has no ArkUI context");
        }
        apply(0);
        const auto duration = animationMilliseconds(options.duration, options.speed);
        const auto delay = animationMilliseconds(options.delay, options.speed);
        if (duration == 0 && delay == 0) { end(false); return; }
        nativeBackend = owner;
        option = OH_ArkUI_AnimatorOption_Create(0);
        if (!option) fail("cannot allocate native animator options");
        check(OH_ArkUI_AnimatorOption_SetDuration(option, duration), "animator duration");
        check(OH_ArkUI_AnimatorOption_SetDelay(option, delay), "animator delay");
        check(OH_ArkUI_AnimatorOption_SetIterations(option, options.iterations), "animator iterations");
        check(OH_ArkUI_AnimatorOption_SetDirection(option, options.autoreverses ?
            ARKUI_ANIMATION_DIRECTION_ALTERNATE : ARKUI_ANIMATION_DIRECTION_NORMAL), "animator direction");
        check(OH_ArkUI_AnimatorOption_SetFill(option, ARKUI_ANIMATION_FILL_MODE_FORWARDS), "animator fill");
        check(OH_ArkUI_AnimatorOption_SetBegin(option, 0), "animator begin");
        check(OH_ArkUI_AnimatorOption_SetEnd(option, 1), "animator end");
        if (!options.controlPoints.empty()) {
            const auto& p = options.controlPoints;
            curve = OH_ArkUI_Curve_CreateCubicBezierCurve(p[0], p[1], p[2], p[3]);
        } else {
            ArkUI_AnimationCurve type = ARKUI_CURVE_LINEAR;
            if (stiffness == 0) {
                switch (options.type) {
                    case snap::valdi_core::AnimationType::Linear: break;
                    case snap::valdi_core::AnimationType::EaseIn: type = ARKUI_CURVE_EASE_IN; break;
                    case snap::valdi_core::AnimationType::EaseOut: type = ARKUI_CURVE_EASE_OUT; break;
                    case snap::valdi_core::AnimationType::EaseInOut: type = ARKUI_CURVE_EASE_IN_OUT; break;
                }
            }
            curve = OH_ArkUI_Curve_CreateCurveByType(type);
        }
        if (!curve) fail("cannot allocate native animation curve");
        check(OH_ArkUI_AnimatorOption_SetCurve(option, curve), "animator curve");
        check(OH_ArkUI_AnimatorOption_RegisterOnFrameCallback(option, this, onFrame), "animator onFrame");
        check(OH_ArkUI_AnimatorOption_RegisterOnFinishCallback(option, this, onFinish), "animator onFinish");
        check(OH_ArkUI_AnimatorOption_RegisterOnCancelCallback(option, this, onCancel), "animator onCancel");
        handle = owner->animate->createAnimator(context, option);
        if (!handle) fail("ArkUI createAnimator failed");
        nativeLifetime = shared_from_this();
        ++nativeDepth;
        const auto code = OH_ArkUI_Animator_Play(handle);
        --nativeDepth;
        check(code, "animator play");
    }
};

static void cancelAnimations(Backend& backend, Node* node, NativeAnimation* except, const Property* property) {
    backend.requireUI();
    std::vector<std::shared_ptr<NativeAnimation>> animations;
    auto& registry = backend.animations;
    registry.erase(std::remove_if(registry.begin(), registry.end(), [](const auto& weak) { return weak.expired(); }),
                   registry.end());
    for (auto& weak : registry) {
        if (auto animation = weak.lock(); animation && animation.get() != except &&
            (!node || animation->involves(node, property))) animations.emplace_back(std::move(animation));
    }
    // Completion may reenter the manager and modify its registry.
    for (const auto& animation : animations) animation->cancel();
}

static std::shared_ptr<NativeAnimation> nativeAnimation(const Ref<Animator>& animator, Backend& backend) {
    if (animator == nullptr) return nullptr;
    auto native = std::dynamic_pointer_cast<NativeAnimation>(animator->getNativeAnimator());
    if (!native || native->backend.lock().get() != &backend) fail("foreign/null native animator");
    return native;
}

static void mutate(const std::shared_ptr<Node>& node, Property property, const Numbers& to,
                   const Ref<Animator>& animator) {
    node->live();
    if (auto animation = nativeAnimation(animator, *node->backend)) animation->add(node, property, to);
    else {
        cancelAnimations(*node->backend, node.get(), nullptr, &property);
        node->targets[static_cast<size_t>(property)] = to;
        node->apply(property, to);
    }
}

class Factory final : public ViewFactory {
public:
    Factory(const StringBox& name, IViewManager& manager, const Ref<BoundAttributes>& attributes,
            std::shared_ptr<Backend> backend, bool label, bool scroll, bool image, int input, bool shape, bool refresh, bool wheel, WheelKind wheelType)
        : ViewFactory(name, manager, attributes), _backend(std::move(backend)), _label(label), _scroll(scroll), _image(image), _input(input), _shape(shape), _refresh(refresh), _wheel(wheel), _wheelType(wheelType) {}

    Ref<View> doCreateView(ViewNodeTree* viewNodeTree, ViewNode* viewNode) override {
        Ref<View> result;
        _backend->runUI([&]() {
            auto node = newNode(_backend, _label, _scroll, _image, _input, _shape, _refresh);
            if (_wheel) node->wheel = std::make_shared<NativeWheel>(node, _wheelType);
            node->viewNode = weakRef(viewNode);
            node->viewNodeTree = weakRef(viewNodeTree);
            result = makeShared<ArkUIView>(std::move(node));
        });
        return result;
    }

private:
    std::shared_ptr<Backend> _backend;
    bool _label;
    bool _scroll;
    bool _image;
    int _input;
    bool _shape;
    bool _refresh;
    bool _wheel;
    WheelKind _wheelType;
};

static void setAttribute(Node& node, const StringBox& name, const Value& value,
                         const Ref<Animator>& animator = nullptr) {
    node.live();
    const auto key = name.toStringView();
    if (key == "accessibilityId" || key == "accessibilityLabel") {
        node.string(node.input ? node.input->handle : node.handle,
                    key == "accessibilityId" ? NODE_ID : NODE_ACCESSIBILITY_TEXT,
                    value.toStringBox().slowToString());
    } else if (key == "accessibilityCategory") {
        const auto category = value.toStringBox().toStringView();
        const auto target = node.input ? node.input->handle : node.handle;
        if (category == "auto" || category == "view") {
            check(node.backend->api->resetAttribute(target, NODE_ACCESSIBILITY_ROLE), "reset accessibility role");
        } else {
            uint32_t role;
            if (category == "button" || category == "image-button") role = ARKUI_NODE_BUTTON;
            else if (category == "text" || category == "header") role = ARKUI_NODE_TEXT;
            else if (category == "image") role = ARKUI_NODE_IMAGE;
            else if (category == "input") role = ARKUI_NODE_TEXT_INPUT;
            else fail("unsupported accessibilityCategory");
            node.color(target, NODE_ACCESSIBILITY_ROLE, role);
        }
    } else if (key == "backgroundColor") {
        const auto color = argb(value);
        Numbers channels {};
        for (size_t i = 0; i < 4; i++) channels[i] = (color >> (24 - i * 8)) & 255;
        mutate(node.shared_from_this(), Property::Background, channels, animator);
    } else if (key == "opacity") {
        const double opacity = value.toDouble();
        if (!std::isfinite(opacity) || opacity < 0 || opacity > 1) fail("opacity must be in [0, 1]");
        mutate(node.shared_from_this(), Property::Opacity, {opacity, 0, 0, 0, 0}, animator);
    } else if (key == "borderRadius") {
        auto radius = ValueConverter::toBorderValues(value);
        if (!radius) fail(radius.error().toString());
        std::array<PercentValue, 4> corners {radius.value()->getTopLeft(), radius.value()->getTopRight(),
                                           radius.value()->getBottomLeft(), radius.value()->getBottomRight()};
        Numbers numbers {};
        for (size_t i = 0; i < corners.size(); i++) {
            if (corners[i].isPercent) fail("percentage borderRadius is unsupported; use point values");
            if (!std::isfinite(corners[i].value) || corners[i].value < 0) fail("invalid borderRadius");
            pixels(corners[i].value, node.backend->configuration.displayScale);
            numbers[i] = corners[i].value;
        }
        mutate(node.shared_from_this(), Property::Radius, numbers, animator);
    } else if (key == "transformComposite") {
        const auto* array = value.getArray();
        if (!array || array->size() != 5) fail("expected five postprocessed Valdi transform components");
        Numbers transform {};
        for (size_t i = 0; i < 5; i++) {
            if (!(*array)[i].isNumber()) fail("transform component must be numeric");
            transform[i] = (*array)[i].toDouble();
            if (!std::isfinite(transform[i]) || std::abs(transform[i]) > 1e6) fail("invalid transform component");
        }
        pixels(transform[0], node.backend->configuration.displayScale);
        pixels(transform[1], node.backend->configuration.displayScale);
        mutate(node.shared_from_this(), Property::Transform, transform, animator);
    } else if (key == "clipToBounds") {
        node.integer(node.handle, NODE_CLIP, value.toBool() ? 1 : 0);
    } else if (gestureAttribute(node, name, value)) {
        // Native input attributes are discrete, including inside animations.
        updateOverlayHitTesting(node);
    } else if (scrollAttribute(node, name, value)) {
        // Native Scroll configuration is discrete; offsets use runtime specs.
    } else if (refreshAttribute(node, name, value)) {
        // Refresh is a controlled custom-view contract, not a ScrollView prop.
    } else if (textInputAttribute(node, name, value)) {
        // Editors own committed text, selection and synchronous processing.
    } else if (node.shape && shapeAttribute(*node.shape, name, value)) {
        node.backend->api->markDirty(node.handle, NODE_NEED_RENDER);
    } else if (node.imageHandle) {
        if (key == "onImageDecoded") {
            if (!value.isNullOrUndefined() && !value.isFunction()) fail("onImageDecoded must be a function");
            node.onImageDecoded = value.isFunction() ? value.getFunctionRef() : nullptr;
            node.imageDecoded.setCallback(node.onImageDecoded != nullptr);
            node.queueImageDecoded();
        } else if (key == "objectFit") {
            const auto fit = value.toStringBox().toStringView();
            int native;
            if (fit == "fill") native = ARKUI_OBJECT_FIT_FILL;
            else if (fit == "contain") native = ARKUI_OBJECT_FIT_CONTAIN;
            else if (fit == "cover") native = ARKUI_OBJECT_FIT_COVER;
            else if (fit == "none") native = ARKUI_OBJECT_FIT_NONE;
            else if (fit == "scale-down") native = ARKUI_OBJECT_FIT_SCALE_DOWN;
            else fail("objectFit supports fill, contain, cover, none, scale-down");
            node.integer(node.imageHandle, NODE_IMAGE_OBJECT_FIT, native);
        } else if (key == "tint") {
            const auto matrix = imageTintMatrix(argb(value));
            std::array<ArkUI_NumberValue, 20> values {};
            for (size_t i = 0; i < matrix.size(); ++i) values[i].f32 = matrix[i];
            ArkUI_AttributeItem item {values.data(), 20, nullptr, nullptr};
            node.set(node.imageHandle, NODE_IMAGE_COLOR_FILTER, item);
        } else if (key == "contentScaleX" || key == "contentScaleY" || key == "contentRotation") {
            const double number = value.toDouble();
            if (!std::isfinite(number) || std::abs(number) > 1e6) fail("invalid image content transform");
            if (key == "contentScaleX") node.contentScaleX = static_cast<float>(number);
            else if (key == "contentScaleY") node.contentScaleY = static_cast<float>(number);
            else node.contentRotation = static_cast<float>(number);
            node.applyImageTransform();
        } else {
            fail("unsupported ArkUIImageView attribute: " + name.slowToString());
        }
        node.invalidate();
    } else {
        if (!node.textHandle) fail("unsupported ArkUIView attribute: " + name.slowToString());
        auto style = node.textStyle;
        if (key == "font") {
            auto font = TextStyle();
            applyLabelFont(font, value);
            node.fontBase = font;
            if (!node.explicitFontSize) style.size = font.size;
            if (!node.explicitFontWeight) style.weight = font.weight;
            if (!node.explicitFontFamily) style.family = font.family;
            style.italic = font.italic;
        } else if (key == "fontSize") {
            labelStyleAttribute(style, key, value);
            node.explicitFontSize = true;
        } else if (key == "fontWeight") {
            labelStyleAttribute(style, key, value);
            node.explicitFontWeight = true;
        } else if (key == "fontFamily") {
            labelStyleAttribute(style, key, value);
            node.explicitFontFamily = true;
        } else if (!labelStyleAttribute(style, key, value)) {
            fail("unsupported ArkUILabel attribute: " + name.slowToString());
        }
        node.textStyle = std::move(style);
        node.applyTextStyle();
    }
}

class AttributeDelegate final : public ViewAttributeHandlerDelegate {
    Result<Void> onViewApply(const Ref<View>& view, const StringBox& name, const Value& value,
                             const Ref<Animator>& animator) override {
        try {
            setAttribute(*unwrap(view), name, value, animator);
            return Void();
        } catch (const std::exception& error) {
            return Error(error.what());
        }
    }

    void onViewReset(const Ref<View>& view, const StringBox& name, const Ref<Animator>& animator) override {
        auto node = unwrap(view);
        try {
            const auto key = name.toStringView();
            if (key == "accessibilityId" || key == "accessibilityLabel" || key == "accessibilityCategory") {
                check(node->backend->api->resetAttribute(node->input ? node->input->handle : node->handle,
                    key == "accessibilityId" ? NODE_ID :
                    key == "accessibilityLabel" ? NODE_ACCESSIBILITY_TEXT : NODE_ACCESSIBILITY_ROLE),
                    "reset accessibility attribute");
            }
            else if (key == "backgroundColor") setAttribute(*node, name, Value(int64_t(0)), animator);
            else if (key == "opacity") setAttribute(*node, name, Value(1.0), animator);
            else if (key == "borderRadius") setAttribute(*node, name, Value(0.0), animator);
            else if (key == "transformComposite") {
                mutate(node, Property::Transform, {0, 0, 1, 1, 0}, animator);
            }
            else if (key == "clipToBounds") setAttribute(*node, name, Value(false));
            else if (resetGestureAttribute(*node, name)) { updateOverlayHitTesting(*node); }
            else if (resetScrollAttribute(*node, name)) {}
            else if (resetRefreshAttribute(*node, name)) {}
            else if (resetTextInputAttribute(*node, name)) {}
            else if (node->shape && resetShapeAttribute(*node->shape, name)) {
                node->backend->api->markDirty(node->handle, NODE_NEED_RENDER);
            }
            else if (key == "onImageDecoded" && node->imageHandle) setAttribute(*node, name, Value());
            else if (key == "objectFit") setAttribute(*node, name, Value(STRING_LITERAL("fill")));
            else if (key == "tint" && node->imageHandle) {
                check(node->backend->api->resetAttribute(node->imageHandle, NODE_IMAGE_COLOR_FILTER), "reset image tint");
                node->invalidate();
            }
            else if (key == "contentScaleX" || key == "contentScaleY") setAttribute(*node, name, Value(1.0));
            else if (key == "contentRotation") setAttribute(*node, name, Value(0.0));
            else if (key == "value" || key == "text") setAttribute(*node, name, Value(STRING_LITERAL("")));
            else if (key == "color") setAttribute(*node, name, Value(int64_t(0x000000ff)));
            else if (key == "font") setAttribute(*node, name, Value(STRING_LITERAL("system 16")));
            else if (key == "fontSize") {
                node->explicitFontSize = false;
                node->textStyle.size = node->fontBase.size;
                node->applyTextStyle();
            } else if (key == "fontWeight") {
                node->explicitFontWeight = false;
                node->textStyle.weight = node->fontBase.weight;
                node->applyTextStyle();
            } else if (key == "fontFamily") {
                node->explicitFontFamily = false;
                node->textStyle.family = node->fontBase.family;
                node->applyTextStyle();
            }
            else if (key == "textAlign") setAttribute(*node, name, Value(STRING_LITERAL("left")));
            else if (key == "numberOfLines") setAttribute(*node, name, Value(int32_t(1)));
            else if (key == "textDecoration") setAttribute(*node, name, Value(STRING_LITERAL("none")));
            else if (key == "textOverflow") setAttribute(*node, name, Value(STRING_LITERAL("ellipsis")));
            else if (key == "letterSpacing") setAttribute(*node, name, Value(0.0));
            else if (key == "lineHeight") setAttribute(*node, name, Value(1.0));
            else if (key == "lineHeightAbsolute") {
                node->textStyle.lineHeightAbsolute.reset();
                node->applyTextStyle();
            }
            else fail("cannot reset unsupported attribute: " + name.slowToString());
        } catch (const std::exception& error) {
            node->backend->report(error.what());
        }
    }
};

// AttributesManager resolves hierarchy and binds inside a noexcept function.
// Use the official Result-returning delegate path for unsupported attributes;
// factory creation separately reports the missing class and returns no view.
class UnsupportedClassDelegate final : public AttributeHandlerDelegate {
public:
    explicit UnsupportedClassDelegate(StringBox name) : name(std::move(name)) {}
    Result<Void> onApply(ViewTransactionScope&, ViewNode&, const Ref<View>&, const StringBox&,
                         const Value&, const Ref<Animator>&) override {
        return Error("Valdi ArkUI: unsupported native class: " + name.slowToString());
    }
    void onReset(ViewTransactionScope&, ViewNode&, const Ref<View>&, const StringBox&,
                 const Ref<Animator>&) override {}
private:
    StringBox name;
};

static const Value* attribute(const Ref<ValueMap>& attributes, const StringBox& key) {
    auto it = attributes->find(key);
    return it == attributes->end() ? nullptr : &it->second;
}

class TextMeasure final : public DefaultMeasureDelegate {
public:
    explicit TextMeasure(std::shared_ptr<Backend> backend) : _backend(std::move(backend)) {}

    Size onMeasure(const Ref<ValueMap>& attributes, float width, MeasureMode widthMode,
                   float height, MeasureMode heightMode, bool rtl) override {
        TextStyle style;
        for (const auto* name : {"font", "fontSize", "fontWeight", "fontFamily", "color", "textAlign",
                                "textDecoration", "numberOfLines", "letterSpacing", "lineHeight",
                                "lineHeightAbsolute", "textOverflow"}) {
            if (const auto* value = attribute(attributes, StringBox::fromCString(name)))
                labelStyleAttribute(style, name, *value);
        }
        auto* text = attribute(attributes, STRING_LITERAL("value"));
        if (!text) text = attribute(attributes, STRING_LITERAL("text"));
        if (text) {
            labelContent(style, *text);
        }
        Size result;
        _backend->runUI([&]() {
            _backend->live();
            std::lock_guard fontLock(fontRegistry().mutex);
            const auto scale = _backend->configuration.displayScale;
            FontApplicationEpoch epoch;
            applyResolvedLabel(epoch, style,
                [&](const std::string& family) { return resolveFontFamily(*_backend, family); },
                [&] { return !_backend->stopped && !_backend->shuttingDown; },
                [&](const TextStyle& resolved, const std::vector<LabelRun>& runs) {
                    NativeLabel label(resolved, runs, rtl, scale);
                    // Custom native child constraints are integer pixels too;
                    // use the same rounding before shaping at a bounded width.
                    const auto maxWidth = widthMode == MeasureModeUnspecified ?
                        1.0e9 : double(pixels(std::max(0.0f, width), scale));
                    label.layout(maxWidth);
                    const auto measuredWidth = static_cast<float>(
                        std::ceil(OH_Drawing_TypographyGetLongestLine(label.typography.get())) / scale);
                    const auto measuredHeight = static_cast<float>(
                        std::ceil(OH_Drawing_TypographyGetHeight(label.typography.get())) / scale);
                    result = Size(sanitizeMeasurement(width, measuredWidth, scale, widthMode),
                                  sanitizeMeasurement(height, measuredHeight, scale, heightMode));
                });
        });
        return result;
    }

private:
    std::shared_ptr<Backend> _backend;
};

class ImageMeasure final : public DefaultMeasureDelegate {
public:
    explicit ImageMeasure(float scale) : _scale(scale) {}
    Size onMeasure(const Ref<ValueMap>& attributes, float width, MeasureMode widthMode,
                   float height, MeasureMode heightMode, bool rtl) override {
        const auto* source = attribute(attributes, STRING_LITERAL("srcOnLoad"));
        const auto* composite = source ? source->getArray() : nullptr;
        if (!composite || composite->empty()) return {};
        auto object = (*composite)[0].getValdiObject();
        float naturalWidth = 0, naturalHeight = 0;
        if (auto loaded = castOrNull<ValdiHarmony::HarmonyImageAsset>(object); loaded != nullptr) {
            naturalWidth = loaded->getWidth() / _scale;
            naturalHeight = loaded->getHeight() / _scale;
        } else if (auto asset = castOrNull<Asset>(object); asset != nullptr) {
            // Preserve the pinned binder's directional resource selection.
            asset = asset->withConfiguration(AssetConfiguration(nullptr, std::nullopt, rtl));
            if (asset != nullptr && asset->canBeMeasured()) {
                naturalWidth = asset->getWidth();
                naturalHeight = asset->getHeight();
            }
        }
        const auto measured = imageIntrinsicSize(naturalWidth, naturalHeight,
            widthMode == MeasureModeUnspecified ? -1 : std::max(0.0f, width), widthMode == MeasureModeExactly,
            heightMode == MeasureModeUnspecified ? -1 : std::max(0.0f, height), heightMode == MeasureModeExactly);
        return Size(sanitizeMeasurement(width, measured[0], _scale, widthMode),
                    sanitizeMeasurement(height, measured[1], _scale, heightMode));
    }
private:
    float _scale;
};

class Transaction final : public IViewTransaction {
public:
    explicit Transaction(std::shared_ptr<Backend> backend) : _backend(std::move(backend)) {}
    void flush(bool) override { _backend->live(); }
    void willUpdateRootView(const Ref<View>& view) override { node(view); }
    void didUpdateRootView(const Ref<View>& view, bool) override { node(view)->invalidate(); }
    void moveViewToTree(const Ref<View>& view, ViewNodeTree* viewNodeTree, ViewNode* viewNode) override {
        // Nodes deliberately hold no strong ViewNode/tree ref: no context/callback cycle.
        auto value = node(view);
        const auto sheetEpoch = ++value->sheetMountEpoch;
        cancelSheetInteractions(*value, true);
        if (value->sheetMountEpoch != sheetEpoch || value->disposing ||
            _backend->stopped || _backend->shuttingDown) return;
        // Invalidate requests belonging to the previous logical node before a
        // recycled/moved backing view can publish their result.
        auto retiredSnapshots = std::move(value->snapshots);
        value->fontEpoch.invalidate();
        value->imageDecoded.setCallback(false);
        value->onImageDecoded = nullptr;
        if (value->wheel) value->wheel->stop(true);
        if (value->scroll) value->scroll->cancel();
        if (value->input) value->input->stop(true);
        if (value->refresh) value->refresh->cancel(true);
        value->viewNode = weakRef(viewNode);
        value->viewNodeTree = weakRef(viewNodeTree);
        if (value->input) value->input->activate();
        if (value->wheel) value->wheel->activate();
        finishSnapshots(retiredSnapshots, "Valdi ArkUI: snapshot logical node changed");
    }
    void insertChildView(const Ref<View>& view, const Ref<View>& childView, int index,
                         const Ref<Animator>& animator) override {
        nativeAnimation(animator, *_backend); // hierarchy changes are discrete, as on native Valdi
        auto owner = node(view);
        auto child = node(childView);
        if (owner->textHandle || owner->imageHandle || owner->wheel) fail("native leaf views cannot contain Valdi child views");
        for (auto ancestor = owner; ancestor; ancestor = ancestor->parent.lock()) {
            if (ancestor == child) fail("insertion would create a native view cycle");
        }
        const auto count = owner->children.size() - (child->parent.lock() == owner ? 1 : 0);
        if (index < 0 || static_cast<size_t>(index) > count) fail("invalid child index");
        validateRefreshChild(*owner, *child, count);
        child->detach();
        // Scroll terminal callbacks can flush native mutations synchronously.
        owner->live();
        child->live();
        for (auto ancestor = owner; ancestor; ancestor = ancestor->parent.lock()) {
            if (ancestor == child) fail("reentrant insertion would create a native view cycle");
        }
        if (static_cast<size_t>(index) > owner->children.size()) fail("child index changed during detach callback");
        validateRefreshChild(*owner, *child, owner->children.size());
        check(_backend->api->insertChildAt(owner->childContainer(), child->handle, index), "insert child");
        owner->children.insert(owner->children.begin() + index, child);
        child->parent = owner;
        if (child->scroll) child->scroll->properties();
        if (owner->refresh) owner->refresh->cancel();
        updateOverlayHitTesting(*owner);
        child->setImageAttachmentEnabled(owner->imageAttachmentEnabled);
        owner->invalidate();
    }
    void removeViewFromParent(const Ref<View>& view, const Ref<Animator>& animator, bool clear) override {
        nativeAnimation(animator, *_backend);
        auto value = node(view);
        cancelAnimations(*_backend, value.get());
        value->detach();
        if (clear) {
            value->imageDecoded.setCallback(false);
            value->onImageDecoded = nullptr;
            if (value->input) value->input->stop(true);
            if (value->refresh) value->refresh->cancel(true);
            if (value->wheel) value->wheel->stop(true);
            cancelGestures(*value, true);
            value->viewNode.reset();
            value->viewNodeTree.reset();
        }
    }
    void invalidateViewLayout(const Ref<View>& view) override { node(view)->invalidate(); }
    void setViewFrame(const Ref<View>& view, const Frame& frame, bool rtl,
                      const Ref<Animator>& animator) override {
        auto value = node(view);
        if (frame.width < 0 || frame.height < 0) fail("negative view dimensions");
        pixels(frame.x, _backend->configuration.displayScale);
        pixels(frame.y, _backend->configuration.displayScale);
        pixels(frame.width, _backend->configuration.displayScale);
        pixels(frame.height, _backend->configuration.displayScale);
        // Newly created backing views have no prior geometry to interpolate.
        mutate(value, Property::Frame, {frame.x, frame.y, frame.width, frame.height, 0},
               value->hasFrame ? animator : nullptr);
        const bool labelDirectionChanged = value->rtl != rtl;
        value->rtl = rtl;
        updateTouchRegion(*value);
        value->integer(value->handle, NODE_DIRECTION, rtl ? ARKUI_DIRECTION_RTL : ARKUI_DIRECTION_LTR);
        if (value->textHandle) {
            value->integer(value->textHandle, NODE_DIRECTION, rtl ? ARKUI_DIRECTION_RTL : ARKUI_DIRECTION_LTR);
            if (labelDirectionChanged && value->label) value->applyTextStyle();
        }
        value->invalidate();
    }
    void setViewScrollSpecs(const Ref<View>& view, const Point& offset, const Size& contentSize, bool animated) override {
        auto value = node(view);
        if (!value->scroll) fail("scroll specifications require a native Scroll view");
        value->scroll->specs(offset, contentSize, animated);
    }
    void setViewLoadedAsset(const Ref<View>& view, const Ref<LoadedAsset>& asset, bool flip) override {
        node(view)->setImageAsset(asset, flip);
    }
    void layoutView(const Ref<View>& view) override {
        node(view);
        fail("immediate layoutView is unsupported; ArkUI layout runs in custom measure/layout callbacks");
    }
    void cancelAllViewAnimations(const Ref<View>& view) override {
        cancelAnimations(*_backend, node(view).get());
    }
    void willEnqueueViewToPool(const Ref<View>& view, Function<void(View&)> onEnqueue) override {
        auto value = node(view);
        cancelAnimations(*_backend, value.get());
        cancelGestures(*value, true);
        value->imageDecoded.setCallback(false);
        value->onImageDecoded = nullptr;
        if (value->input) value->input->stop(true);
        if (value->refresh) value->refresh->cancel(true);
        value->afterDraw.clear();
        // Every ArkUIView has canBeReused=false. Runtime therefore never pools it.
        onEnqueue(*view);
    }
    void snapshotView(const Ref<View>& view, Function<void(Result<BytesView>)> cb) override {
        takeSnapshot(_backend, view, std::move(cb));
    }
    void flushAnimator(const Ref<Animator>& animator, const Value& completion) override {
        _backend->live();
        if (auto native = nativeAnimation(animator, *_backend)) native->flushAnimations(completion);
        else fail("cannot flush null animator");
    }
    void cancelAnimator(const Ref<Animator>& animator) override {
        _backend->live();
        if (auto native = nativeAnimation(animator, *_backend)) native->cancel();
    }
    void scheduleOnNextDraw(const Ref<View>& root, DispatchFunction callback) override {
        auto value = node(root);
        if (!value->drawRegistered) {
            check(OH_ArkUI_RegisterDrawCallbackOnNodeHandle(value->handle, value.get(), Node::drawCompleted),
                  "register draw completion");
            value->drawRegistered = true;
        }
        value->afterDraw.emplace_back(std::move(callback));
        _backend->api->markDirty(value->handle, NODE_NEED_RENDER);
    }
    void executeInTransactionThread(DispatchFunction callback) override {
        _backend->live();
        callback();
    }

private:
    std::shared_ptr<Backend> _backend;
    std::shared_ptr<Node> node(const Ref<View>& view) {
        _backend->live();
        auto value = unwrap(view);
        if (value->backend != _backend) fail("view belongs to a different ArkUI manager");
        value->live();
        return value;
    }
};

} // namespace detail

ArkUIView::ArkUIView(std::shared_ptr<detail::Node> node) : _node(std::move(node)) {
    setCanBeReused(false);
}
ArkUIView::~ArkUIView() = default;
VALDI_CLASS_IMPL(ArkUIView)

snap::valdi_core::Platform ArkUIView::getPlatform() const {
    return snap::valdi_core::Platform::Harmony;
}

ArkUI_NodeHandle ArkUIView::nativeNode() const {
    _node->live();
    return _node->handle;
}

const std::shared_ptr<detail::Node>& ArkUIView::backendNode() const { return _node; }

ArkUIViewNodeRef::ArkUIViewNodeRef(const Ref<ViewNode>& node, std::weak_ptr<detail::Backend> backend,
                                 bool inPlatformReference)
    : _viewNode(node), _tree(weakRef(node->getViewNodeTree())), _backend(std::move(backend)),
      _inPlatformReference(inPlatformReference) {}
ArkUIViewNodeRef::~ArkUIViewNodeRef() = default;
VALDI_CLASS_IMPL(ArkUIViewNodeRef)

Result<Ref<View>> ArkUIViewNodeRef::getView() const {
    auto backend = _backend.lock();
    if (!backend) return Ref<View>();
    if (!backend->configuration.isUIThread()) return Error("Valdi ArkUI: native ref access requires UI");
    if (backend->stopped || backend->shuttingDown) return Ref<View>();
    auto tree = _tree.lock();
    if (!tree) return Ref<View>();
    Ref<View> result;
    bool foreign = false;
    bool locked = tree->tryWithLock([&] {
        if (_viewNode->getViewNodeTree() != tree.get()) return;
        auto view = _viewNode->getView();
        if (view == nullptr) return;
        auto native = dynamic_cast<ArkUIView*>(view.get());
        if (!native || native->backendNode()->backend != backend) {
            foreign = true;
            return;
        }
        if (!native->backendNode()->handle || native->backendNode()->disposing) return;
        // Public native consumers may retain the returned View. Match the
        // official native accessor rather than exporting a recyclable handle.
        result = _viewNode->getViewAndDisablePooling();
    }, std::chrono::steady_clock::now());
    if (!locked) return Error("Valdi ArkUI: native ref tree is busy");
    if (foreign) return Error("Valdi ArkUI: native ref belongs to another backend");
    return result;
}

ArkUIViewManager::ArkUIViewManager(ArkUIConfiguration configuration)
    : _backend(std::make_shared<detail::Backend>(std::move(configuration))) {
    const auto& config = _backend->configuration;
    if (!std::isfinite(config.displayScale) || config.displayScale <= 0 ||
        !config.isUIThread || !config.dispatchUI || !config.reportError) {
        detail::fail("displayScale, isUIThread, dispatchUI, reportError are required");
    }
    _backend->runUI([&]() {
        _backend->api = static_cast<ArkUI_NativeNodeAPI_1*>(
            OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
        if (!_backend->api) detail::fail("ArkUI_NativeNodeAPI_1 is unavailable");
        _backend->animate = static_cast<ArkUI_NativeAnimateAPI_1*>(
            OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_ANIMATE, "ArkUI_NativeAnimateAPI_1"));
        if (!_backend->animate) detail::fail("ArkUI_NativeAnimateAPI_1 is unavailable");
        _backend->gestures2 = static_cast<ArkUI_NativeGestureAPI_2*>(
            OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_GESTURE, "ArkUI_NativeGestureAPI_2"));
        if (!_backend->gestures2 || !_backend->gestures2->gestureApi1) detail::fail("ArkUI_NativeGestureAPI_2 is unavailable");
        _backend->gestures = _backend->gestures2->gestureApi1;
    });
}

ArkUIViewManager::~ArkUIViewManager() {
    try {
        shutdown();
    } catch (const std::exception& error) {
        _backend->report(error.what());
        std::terminate();
    }
}

Ref<View> ArkUIViewManager::createRootView() {
    Ref<View> result;
    _backend->runUI([&]() { result = makeShared<ArkUIView>(detail::newNode(_backend, false)); });
    return result;
}

void ArkUIViewManager::mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content) {
    _backend->runUI([&]() {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend || !content) detail::fail("invalid root manager/NodeContent");
        node->detach();
        node->live(); // Snapshot completion can synchronously shut down this manager.
        detail::check(OH_ArkUI_NodeContent_AddNode(content, node->handle), "mount root in NodeContent");
        node->content = content;
        node->setImageAttachmentEnabled(true);
        node->invalidate();
    });
}

void ArkUIViewManager::mountRootInParent(const Ref<View>& root, ArkUI_NodeHandle parent, int index) {
    _backend->runUI([&]() {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend || !parent || parent == node->handle || index < 0) {
            detail::fail("invalid root manager/native parent/index");
        }
        if (_backend->api->getTotalChildCount(parent) < static_cast<uint32_t>(index)) detail::fail("native parent index is out of range");
        // Retain a backend-owned target across detach callbacks. An external
        // host parent remains borrowed and must stay alive through this call.
        std::shared_ptr<detail::Node> targetParent;
        for (auto* candidate : _backend->nodes) {
            if (candidate->handle == parent) {
                targetParent = candidate->weak_from_this().lock();
                if (!targetParent) detail::fail("native parent is being released");
                break;
            }
        }
        node->detach();
        node->live(); // Snapshot completion can synchronously shut down this manager.
        if (targetParent) targetParent->live();
        if (_backend->api->getTotalChildCount(parent) < static_cast<uint32_t>(index)) detail::fail("native parent index changed during detach");
        detail::check(_backend->api->insertChildAt(parent, node->handle, index), "mount root in native parent");
        node->hostParent = parent;
        node->setImageAttachmentEnabled(true);
        node->invalidate();
    });
}

void ArkUIViewManager::mountRoot(const Ref<View>& root, ArkUI_NodeContentHandle content, int index) {
    _backend->runUI([&]() {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend || !content || index < 0) detail::fail("invalid root manager/NodeContent/index");
        node->detach();
        node->live(); // Snapshot completion can synchronously shut down this manager.
        detail::check(OH_ArkUI_NodeContent_InsertNode(content, node->handle, index), "insert root in NodeContent");
        node->content = content;
        node->setImageAttachmentEnabled(true);
        node->invalidate();
    });
}

void ArkUIViewManager::unmountRoot(const Ref<View>& root) {
    _backend->runUI([&]() {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend) detail::fail("root belongs to another manager");
        std::vector<std::shared_ptr<detail::Node>> subtree {node};
        for (size_t i = 0; i < subtree.size(); i++) {
            const auto children = subtree[i]->children;
            subtree.insert(subtree.end(), children.begin(), children.end());
        }
        for (const auto& child : subtree) detail::cancelAnimations(*_backend, child.get());
        node->detach();
    });
}

void ArkUIViewManager::setRootSize(const Ref<View>& root, Size size, bool rtl) {
    _backend->runUI([&]() {
        detail::Transaction transaction(_backend);
        transaction.setViewFrame(root, Frame(0, 0, size.width, size.height), rtl, nullptr);
    });
}

void ArkUIViewManager::setRootHitTestPassthrough(const Ref<View>& root, bool enabled) {
    _backend->live(); // Intentionally UI-only, matching the public contract.
    auto node = detail::unwrap(root);
    node->live();
    if (node->backend != _backend || !node->parent.expired())
        detail::fail("hit test passthrough requires this manager's root");
    node->rootHitTestPassthrough = enabled;
    detail::updateOverlayHitTesting(*node);
}

static detail::Numbers rootTransform(const RootVisualState& state) {
    detail::Numbers result {state.translationX, state.translationY, state.scaleX, state.scaleY, state.rotation};
    for (double value : result) {
        if (!std::isfinite(value) || std::abs(value) > 1e6) detail::fail("invalid root visual transform");
    }
    if (!std::isfinite(state.opacity) || state.opacity < 0 || state.opacity > 1) {
        detail::fail("root opacity must be in [0,1]");
    }
    return result;
}

NativeAnimator ArkUIViewManager::tweenRoots(const std::vector<RootTween>& tweens,
                                           const NativeTweenOptions& options,
                                           std::function<void(bool)> completion) {
    NativeAnimator result;
    _backend->runUI([&] {
        _backend->live();
        if (tweens.empty()) detail::fail("root tween requires at least one mounted root");
        // Validate the complete request before cancelling or changing any root.
        std::vector<std::shared_ptr<detail::Node>> nodes;
        for (const auto& tween : tweens) {
            auto node = detail::unwrap(tween.root);
            node->live();
            if (node->backend != _backend || (!node->hostParent && !node->content) ||
                !node->hasFrame) {
                detail::fail("root tween requires a mounted, sized root from this manager");
            }
            if (std::find(nodes.begin(), nodes.end(), node) != nodes.end()) detail::fail("duplicate root tween");
            rootTransform(tween.from);
            rootTransform(tween.to);
            nodes.push_back(std::move(node));
        }
        auto animation = std::make_shared<detail::NativeAnimation>(_backend, options);
        _backend->animations.emplace_back(animation);
        for (size_t i = 0; i < tweens.size(); i++) {
            const auto from = rootTransform(tweens[i].from);
            const detail::Numbers fromOpacity {tweens[i].from.opacity, 0, 0, 0, 0};
            animation->add(nodes[i], detail::Property::RootTransform, rootTransform(tweens[i].to), &from);
            animation->add(nodes[i], detail::Property::RootOpacity, {tweens[i].to.opacity, 0, 0, 0, 0}, &fromOpacity);
        }
        animation->setHostCompletion(std::move(completion));
        result = animation;
        animation->flushAnimations(Value());
    });
    return result;
}

void ArkUIViewManager::setRootVisualState(const Ref<View>& root, const RootVisualState& state) {
    _backend->runUI([&] {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend) detail::fail("root belongs to another manager");
        const auto transform = rootTransform(state);
        detail::mutate(node, detail::Property::RootTransform, transform, nullptr);
        detail::mutate(node, detail::Property::RootOpacity, {state.opacity, 0, 0, 0, 0}, nullptr);
    });
}

void ArkUIViewManager::setRootDragObserver(const Ref<View>& root, RootDragObserver observer) {
    _backend->runUI([&]() {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend || !node->parent.expired()) detail::fail("root drag observer requires this manager's root");
        // retire snapshots the previous observer before replacement.
        detail::cancelGestures(*node);
        node->rootDragObserver = std::move(observer);
        detail::refreshGestures(*node);
        detail::updateOverlayHitTesting(*node);
    });
}

void bindSheetInteraction(ArkUIViewManager& manager, const Ref<View>& root,
                          std::shared_ptr<SheetInteractionBinding> binding) {
    auto backend = manager._backend;
    backend->runUI([&] {
        auto node = detail::unwrap(root);
        if (node->backend != backend) detail::fail("sheet root belongs to another manager");
        const auto generation = ++node->sheetBindingGeneration;
        const auto mountEpoch = node->sheetMountEpoch;
        auto previous = std::move(node->sheetInteraction);
        if (previous) previous->retire();
        // end(canceled) can synchronously install another owner or destroy the
        // page. Never overwrite that newer generation, or touch native state.
        if (node->sheetBindingGeneration != generation || node->sheetMountEpoch != mountEpoch || node->disposing ||
            !node->handle || backend->stopped || backend->shuttingDown) {
            if (binding && binding->lifetime) binding->lifetime->revoke();
            return;
        }
        if (!binding) return;
        if (!binding->lifetime || !binding->lifetime->live.load() ||
            !binding->begin || !binding->offer || !binding->end) detail::fail("incomplete sheet binding");
        auto owner = std::make_shared<detail::SheetInteraction>(node, std::move(binding));
        node->sheetInteraction = owner;
        try {
            owner->initialize();
        } catch (...) {
            if (node->sheetInteraction == owner) node->sheetInteraction.reset();
            owner->retire();
            throw;
        }
    });
}

void ArkUIViewManager::cancelRootAnimations(const Ref<View>& root) {
    _backend->runUI([&] {
        auto node = detail::unwrap(root);
        node->live();
        if (node->backend != _backend) detail::fail("root belongs to another manager");
        detail::cancelAnimations(*_backend, node.get());
    });
}

void ArkUIViewManager::setSuspended(bool suspended) {
    _backend->runUI([&]() {
        _backend->live();
        _backend->suspended = suspended;
        if (suspended) detail::cancelBackendSnapshots(*_backend);
        // Every cancellation can run a SyncWithMainThread handler whose batch
        // flush deletes this or a later sibling. Retain the entire registry
        // before invoking any callbacks; raw registry pointers are not owners.
        auto nodes = detail::retainRegistry(_backend->nodes);
        if (suspended) {
            for (const auto& binding : detail::sheetBindings(*_backend)) {
                binding->finish(0, SheetInteractionEndReason::LifecycleCanceled, true);
                if (_backend->stopped || _backend->shuttingDown || !_backend->suspended) return;
            }
            detail::cancelAnimations(*_backend);
            for (const auto& node : nodes) if (node->handle) {
                if (node->scroll) {
                    node->scroll->cancel();
                    node->scroll->properties();
                }
                detail::cancelGestures(*node);
                if (node->input) node->input->stop();
                if (node->wheel) node->wheel->stop();
                if (node->refresh) node->refresh->cancel();
                node->imageDecoded.detach();
            }
        } else {
            for (const auto& node : nodes) if (node->handle) {
                if (node->scroll) node->scroll->properties();
                detail::refreshGestures(*node);
                if (node->input) node->input->activate();
                if (node->wheel) node->wheel->activate();
                if (node->refresh) node->refresh->properties();
                node->queueImageDecoded();
            }
        }
        if (!suspended) {
            for (const auto& node : nodes) {
                if (node->handle) node->invalidate();
            }
        }
    });
}

void ArkUIViewManager::shutdown() {
    _backend->runUI([&]() {
        _backend->requireUI();
        if (_backend->stopped) return;
        if (_backend->shuttingDown) return;
        _backend->shuttingDown = true;
        detail::cancelBackendSnapshots(*_backend);
        detail::cancelAnimations(*_backend);
        _backend->suspended = true;
        // Retain all nodes while unlinking; children may otherwise release each other.
        std::vector<std::shared_ptr<detail::Node>> nodes;
        auto registered = _backend->nodes;
        for (auto* node : registered) {
            if (auto retained = node->weak_from_this().lock()) nodes.emplace_back(std::move(retained));
        }
        for (auto* node : registered) node->dispose();
        _backend->stopped = true;
    });
}

ArkUI_NodeHandle ArkUIViewManager::nativeNode(const Ref<View>& view) {
    auto node = detail::unwrap(view);
    node->live();
    return node->handle;
}

PlatformType ArkUIViewManager::getPlatformType() const { return PlatformTypeHarmony; }
RenderingBackendType ArkUIViewManager::getRenderingBackendType() const { return RenderingBackendTypeNative; }
StringBox ArkUIViewManager::getDefaultViewClass() { return STRING_LITERAL("view"); }
float ArkUIViewManager::getPointScale() const { return _backend->configuration.displayScale; }

bool ArkUIViewManager::supportsClassNameNatively(const StringBox& name) {
    return name == "view" || name == "layout" || name == "label" || name == "scroll" || name == "image" ||
           name == "ArkUIView" || name == "ArkUILabel" || name == "ArkUIScrollView" || name == "ArkUIImageView" ||
           name == "textfield" || name == "textview" || name == "ArkUITextField" || name == "ArkUITextView" ||
           name == "shape" || name == "ArkUIShapeView" || name == "ArkUIRefreshView" || detail::wheelClass(name);
}

Ref<ViewFactory> ArkUIViewManager::createViewFactory(const StringBox& name, const Ref<BoundAttributes>& attributes) {
    if (!supportsClassNameNatively(name)) {
        _backend->runUI([&] { _backend->report("unsupported native class: " + name.slowToString()); });
        return nullptr;
    }
    return makeShared<detail::Factory>(name, *this, attributes, _backend, name == "label" || name == "ArkUILabel",
                                      name == "scroll" || name == "ArkUIScrollView",
                                      name == "image" || name == "ArkUIImageView",
                                      name == "textfield" || name == "ArkUITextField" ? 1 :
                                      name == "textview" || name == "ArkUITextView" ? 2 : 0,
                                      name == "shape" || name == "ArkUIShapeView",
                                      name == "ArkUIRefreshView", detail::wheelClass(name), detail::wheelKind(name));
}

std::vector<StringBox> ArkUIViewManager::getClassHierarchy(const StringBox& name) {
    if (!supportsClassNameNatively(name)) return {name};
    if (name == "view") return {name};
    return {name, STRING_LITERAL("view")};
}

void ArkUIViewManager::bindAttributes(const StringBox& name, AttributesBindingContext& binder) {
    if (!supportsClassNameNatively(name)) {
        binder.setDefaultDelegate(makeShared<detail::UnsupportedClassDelegate>(name));
        return;
    }
    Ref<ViewAttributeHandlerDelegate> delegate = detail::wheelClass(name) ?
        makeShared<detail::WheelAttributeDelegate>() : Ref<ViewAttributeHandlerDelegate>(makeShared<detail::AttributeDelegate>());
    binder.setDefaultDelegate(delegate);
    if (name == "view" || name == "ArkUIView") {
        binder.bindColorAttribute(STRING_LITERAL("backgroundColor"), false, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("opacity"), false, delegate);
        binder.bindBorderAttribute(STRING_LITERAL("borderRadius"), false, delegate);
        binder.bindBooleanAttribute(STRING_LITERAL("clipToBounds"), false, delegate);
        binder.bindStringAttribute(STRING_LITERAL("accessibilityId"), false, delegate);
        binder.bindStringAttribute(STRING_LITERAL("accessibilityLabel"), false, delegate);
        binder.bindStringAttribute(STRING_LITERAL("accessibilityCategory"), false, delegate);
        detail::bindGestureAttributes(binder, delegate);
        binder.bindTransformAttributes(delegate);
    } else if (name == "label" || name == "ArkUILabel") {
        binder.bindTextAttribute(STRING_LITERAL("value"), true, delegate);
        binder.bindTextAttribute(STRING_LITERAL("text"), true, delegate);
        binder.bindStringAttribute(STRING_LITERAL("font"), true, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("fontSize"), true, delegate);
        binder.bindUntypedAttribute(STRING_LITERAL("fontWeight"), true, delegate);
        binder.bindStringAttribute(STRING_LITERAL("fontFamily"), true, delegate);
        binder.bindColorAttribute(STRING_LITERAL("color"), true, delegate);
        binder.bindStringAttribute(STRING_LITERAL("textAlign"), true, delegate);
        binder.bindIntAttribute(STRING_LITERAL("numberOfLines"), true, delegate);
        binder.bindStringAttribute(STRING_LITERAL("textDecoration"), true, delegate);
        binder.bindStringAttribute(STRING_LITERAL("textOverflow"), true, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("letterSpacing"), true, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("lineHeight"), true, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("lineHeightAbsolute"), true, delegate);
        binder.setMeasureDelegate(makeShared<detail::TextMeasure>(_backend));
    } else if (name == "textfield" || name == "textview" || name == "ArkUITextField" || name == "ArkUITextView") {
        detail::bindTextInputAttributes(binder, delegate);
    } else if (name == "shape" || name == "ArkUIShapeView") {
        detail::bindShapeAttributes(binder, delegate);
    } else if (name == "scroll" || name == "ArkUIScrollView") {
        detail::bindScrollAttributes(binder, delegate);
    } else if (detail::wheelClass(name)) {
        detail::bindWheelAttributes(binder, delegate);
    } else if (name == "ArkUIRefreshView") {
        detail::bindRefreshAttributes(binder, delegate);
    } else if (name == "image" || name == "ArkUIImageView") {
        binder.bindAssetAttributes(snap::valdi_core::AssetOutputType::ImageHarmony);
        binder.registerPreprocessor(STRING_LITERAL("srcOnLoad"), false, detail::preprocessDirectImageFilter);
        binder.bindUntypedAttribute(STRING_LITERAL("onImageDecoded"), false, delegate);
        binder.bindStringAttribute(STRING_LITERAL("objectFit"), false, delegate);
        binder.bindColorAttribute(STRING_LITERAL("tint"), false, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("contentScaleX"), false, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("contentScaleY"), false, delegate);
        binder.bindDoubleAttribute(STRING_LITERAL("contentRotation"), false, delegate);
        binder.setMeasureDelegate(makeShared<detail::ImageMeasure>(_backend->configuration.displayScale));
    }
}

void ArkUIViewManager::callAction(ViewNodeTree*, const StringBox& action, const Ref<ValueArray>&) {
    detail::fail("native action is unsupported: " + action.slowToString());
}

NativeAnimator ArkUIViewManager::createAnimator(snap::valdi_core::AnimationType type,
                                                const std::vector<double>& controlPoints, double duration,
                                                bool beginFromCurrentState, bool crossfade,
                                                double stiffness, double damping) {
    if (crossfade) detail::fail("crossfade snapshots are unsupported; animate opacity explicitly");
    NativeAnimator result;
    _backend->runUI([&] {
        NativeTweenOptions options;
        options.type = type;
        options.controlPoints = controlPoints;
        options.duration = duration;
        auto animation = std::make_shared<detail::NativeAnimation>(
            _backend, std::move(options), beginFromCurrentState, stiffness, damping);
        _backend->animations.emplace_back(animation);
        result = std::move(animation);
    });
    return result;
}

Value ArkUIViewManager::createViewNodeWrapper(const Ref<ViewNode>& node, bool inPlatformReference) {
    // Called under the runtime's tree lock, potentially on JS. No native-node
    // access or synchronous UI dispatch here. Both official paths are opaque.
    if (node == nullptr) return Value::undefined();
    return Value(makeShared<ArkUIViewNodeRef>(node, _backend, inPlatformReference));
}

Ref<IViewTransaction> ArkUIViewManager::createViewTransaction(const Ref<MainThreadManager>& main, bool) {
    if (_backend->configuration.isUIThread()) return makeShared<detail::Transaction>(_backend);
    if (main == nullptr) detail::fail("off-UI transaction requires MainThreadManager");
    return makeShared<DeferredViewTransaction>(*this, *main);
}

Ref<IBitmapFactory> ArkUIViewManager::getViewRasterBitmapFactory() const { return nullptr; }

} // namespace Valdi::Harmony
