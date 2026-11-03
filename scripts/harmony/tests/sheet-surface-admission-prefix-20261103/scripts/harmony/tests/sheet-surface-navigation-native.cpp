// SOURCE ONLY in the implementation child. The parent's serial controller
// compiles actual HarmonySheetSurface.cpp with these unchanged host bodies.
#include "sheet-surface-navigation-boundary.hpp"
#include <iostream>

namespace {
using Nav = ValdiHarmony::HarmonyNavigator;
using TestValue = ValdiHarmony::Value;
using SetAttribute = int32_t (*)(ArkUI_NodeHandle, ArkUI_NodeAttributeType, const ArkUI_AttributeItem*);
SetAttribute sdkSetAttribute = nullptr;
std::function<void(ArkUI_NodeHandle, ArkUI_NodeAttributeType, const ArkUI_AttributeItem*)> attributeObserver;

int32_t integerAttribute(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute) {
    return node->attributes.at(attribute).at(0).i32;
}

struct SavedScrim {
    void (*receiver)(ArkUI_NodeEvent*);
    void* data;
    explicit SavedScrim(ArkUI_NodeHandle scrim) : receiver(scrim->receiver), data(scrim->userdata) {}
    void invoke() const {
        CallbackScope scope;
        ArkUI_NodeEvent event{data};
        receiver(&event);
    }
};

struct Fixture {
    ArkUI_NodeContent content;
    ArkUI_Context context;
    std::shared_ptr<Nav> nav = std::make_shared<Nav>();
    std::shared_ptr<HarmonySheetSurface> carrier;
    Nav::PagePtr page;
    ArkUI_NodeHandle root = nullptr, panel = nullptr, scrim = nullptr;
    int deliveredPayload = -1;
    bool deliveredCanceled = false;

    Fixture() {
        assert(liveNodes == 0 && liveOptions == 0 && animators.empty() && deferred.empty());
        nav->content = &content;
        page = std::make_shared<Nav::Page>();
        nav->_sheet = nav->_sheetMounted = page;
        auto weak = std::weak_ptr<Nav>(nav);
        carrier = HarmonySheetSurface::create(&content, &context,
            [](std::function<void()> work) { deferred.push_back(std::move(work)); },
            [weak] {
                if (auto nav = weak.lock()) {
                    ++nav->scrimRequests;
                    nav->closeSheet();
                }
            });
        nav->_sheetSurface = carrier;
        root = content.root;
        panel = carrier->interactionNode();
        scrim = root->children.at(0);
        carrier->layout(nav->sheetGeometry(), 0);
        // Explicit root-mount collaborator: native add/remove is real at the
        // fake SDK boundary. A real Valdi backend/runtime is not linked here.
        page->root = nodeAPI.createNode(ARKUI_NODE_STACK);
        page->mountParent = carrier->viewport();
        assert(nodeAPI.addChild(page->mountParent, page->root) == 0);
        page->mounted = true;
        nav->sizePage(page);
        carrier->setActive(true);
        nav->reconcileSheet("navigation");
        nav->resultObserver = [this](const TestValue& value, bool canceled) {
            assert(!content.root && !page->mounted && page->contextAlive);
            deliveredPayload = value.payload;
            deliveredCanceled = canceled;
        };
        attributeObserver = [weak, watchedRoot = root](ArkUI_NodeHandle node, ArkUI_NodeAttributeType type,
                                                     const ArkUI_AttributeItem* item) {
            auto nav = weak.lock();
            if (!nav || node != watchedRoot || !nav->_sheetClosing) return;
            if (type == NODE_ENABLED && item->value[0].i32 == 0) {
                assert(!nav->inputBound && !nav->inputTokenLive);
            }
            // This is an assertion on an actual SDK visibility write. The old
            // host fails here when setActive(false) tries to hide its close.
            if (type == NODE_VISIBILITY && nav->_active && !nav->_closed) {
                assert(item->value[0].i32 == ARKUI_VISIBILITY_VISIBLE &&
                       "Foreground closing carrier must remain natively VISIBLE");
            }
        };
    }

    void assertVisibleInputDisabled() const {
        assert(content.root == root && page->mounted && page->visible);
        assert(integerAttribute(root, NODE_VISIBILITY) == ARKUI_VISIBILITY_VISIBLE);
        assert(integerAttribute(root, NODE_ENABLED) == 0);
        assert(integerAttribute(root, NODE_HIT_TEST_BEHAVIOR) == ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS);
        // The complete carrier remains attached and fills the current viewport,
        // even while its controls are disabled.
        assert(f(root, NODE_WIDTH) == nav->_size.width);
        assert(f(root, NODE_HEIGHT) == nav->_sheetViewportHeight);
        assert(carrier->interactionNode() == panel && carrier->viewport() == page->mountParent);
    }

    void assertDetachThenResult() {
        assert(!content.root && !page->mounted && page->removed);
        assert(nav->unmounts == 1 && nav->resultScheduled == 1 && nav->resultDelivered == 0);
        assert(page->contextAlive);
        nav->drainJS();
        assert(nav->resultDelivered == 1 && nav->contextRetirements == 1 && !page->contextAlive);
        const auto find = [&](const char* value) {
            auto position = std::find(nav->trace.begin(), nav->trace.end(), value);
            assert(position != nav->trace.end());
            return position;
        };
        assert(find("page-unmount") < find("carrier-observed-detached"));
        assert(find("carrier-observed-detached") < find("result-scheduled"));
        assert(find("result-scheduled") < find("result"));
        assert(find("result") < find("context-retired"));
    }

    ~Fixture() {
        if (nav->_sheet) nav->finishSheet(nav->_sheetGeneration, true);
        nav->drainJS();
        drain();
        attributeObserver = {};
        assert(!content.root && liveNodes == 0 && liveOptions == 0 && animators.empty());
    }
};

void closingReconcileResizeAndTerminalOnce() {
    Fixture fixture;
    auto nav = fixture.nav;
    SavedScrim stale(fixture.scrim);
    nav->trace.clear();
    nav->closeSheet(TestValue{77}, false, 700);
    const auto terminalGeneration = nav->_sheetGeneration;
    assert(nav->_sheetClosing && nav->_sheet == fixture.page);
    fixture.assertVisibleInputDisabled();
    assert(nav->resultScheduled == 0 && nav->resultDelivered == 0);
    assert(animators.size() == 1);
    auto initial = animators.back();
    sample(initial, 0.2f);
    const float first = fixture.carrier->currentOffset();
    assert(first > 0 && first < 600);
    assert(f(fixture.panel, NODE_TRANSLATE, 1) == first);
    assert(std::abs(f(fixture.scrim, NODE_OPACITY) - (1 - first / 600)) < 0.0001f);

    nav->reconcileSheet("navigation");
    fixture.assertVisibleInputDisabled();
    assert(animators.size() == 1 && animators.back() == initial);
    sample(initial, 0.35f);
    assert(fixture.carrier->currentOffset() > first);
    const float fraction = fixture.carrier->currentOffset() / 600;
    // The unchanged layoutSheet reads actual production sheetGeometry, then
    // the actual surface performs its existing native animation retarget.
    nav->_sheetViewportHeight = 600;
    nav->_keyboardOverlap = 200;
    nav->layoutSheet();
    auto resized = animators.back();
    assert(resized != initial && animators.size() == 2);
    assert(std::abs(fixture.carrier->currentOffset() / 400 - fraction) < 0.0001f);
    assert(f(fixture.page->root, NODE_HEIGHT) == 376);
    fixture.assertVisibleInputDisabled();
    nav->reconcileSheet("resize");
    fixture.assertVisibleInputDisabled();
    assert(animators.size() == 2 && animators.back() == resized);
    stale.invoke();
    assert(nav->scrimRequests == 0 && nav->_sheetGeneration == terminalGeneration);
    nav->closeSheet(TestValue{99}, true, -700);
    assert(nav->_sheetGeneration == terminalGeneration && animators.back() == resized);
    finish(initial);
    assert(nav->resultScheduled == 0);
    const float previous = fixture.carrier->currentOffset();
    sample(resized, 0.6f);
    assert(fixture.carrier->currentOffset() > previous && fixture.carrier->currentOffset() <= 400);
    finish(resized);
    assert(f(fixture.panel, NODE_TRANSLATE, 1) == 400);
    assert(f(fixture.scrim, NODE_OPACITY) == 0);
    assert(!nav->_sheet && fixture.carrier->interactionNode() == nullptr);
    finish(resized);
    nav->finishSheet(terminalGeneration);
    nav->closeSheet(TestValue{100}, true);
    stale.invoke(); // Still within the deferred SDK userdata lifetime.
    assert(nav->scrimRequests == 0);
    fixture.assertDetachThenResult();
    assert(fixture.deliveredPayload == 77 && !fixture.deliveredCanceled);
}

void backgroundCommitsClosingOnce() {
    Fixture fixture;
    auto nav = fixture.nav;
    SavedScrim stale(fixture.scrim);
    nav->closeSheet(TestValue{81}, false);
    auto closing = animators.back();
    sample(closing, 0.1f);
    const auto generation = nav->_sheetGeneration;
    nav->setActive(false);
    // Existing host policy: background synchronously finishes an admitted
    // close; it does not wait for another hidden native animation frame.
    assert(!nav->_active && !nav->_sheet && !fixture.content.root);
    finish(closing);
    nav->finishSheet(generation);
    stale.invoke();
    fixture.assertDetachThenResult();
    assert(fixture.deliveredPayload == 81 && !fixture.deliveredCanceled);
    nav->setActive(true);
    assert(!nav->_sheet && nav->resultDelivered == 1);
}

void backgroundOpenHidesAndCancelsThenResumes() {
    Fixture fixture;
    auto nav = fixture.nav;
    fixture.carrier->layout(nav->sheetGeometry(), 120);
    int canceledCompletions = 0;
    fixture.carrier->animateTo(0, 0, [&](bool) { ++canceledCompletions; });
    auto opening = animators.back();
    sample(opening, 0.2f);
    nav->setActive(false);
    assert(nav->_sheet == fixture.page && !fixture.page->visible && fixture.content.root == fixture.root);
    assert(integerAttribute(fixture.root, NODE_VISIBILITY) == ARKUI_VISIBILITY_HIDDEN);
    assert(integerAttribute(fixture.root, NODE_ENABLED) == 0);
    assert(fixture.carrier->currentOffset() == 0);
    finish(opening);
    assert(canceledCompletions == 0 && nav->resultScheduled == 0);
    SavedScrim stale(fixture.scrim);
    stale.invoke();
    assert(nav->scrimRequests == 0);
    nav->setActive(true);
    assert(fixture.page->visible && nav->inputBound && nav->inputTokenLive);
    assert(integerAttribute(fixture.root, NODE_VISIBILITY) == ARKUI_VISIBILITY_VISIBLE);
    assert(integerAttribute(fixture.root, NODE_ENABLED) == 1);
    nav->closeSheet();
    fixture.assertVisibleInputDisabled();
    auto closing = animators.back();
    finish(closing);
    fixture.assertDetachThenResult();
    assert(fixture.deliveredCanceled);
}
} // namespace

int main() {
    configure();
    sdkSetAttribute = nodeAPI.setAttribute;
    nodeAPI.setAttribute = [](ArkUI_NodeHandle node, ArkUI_NodeAttributeType type,
                              const ArkUI_AttributeItem* item) -> int32_t {
        if (attributeObserver) attributeObserver(node, type, item);
        return sdkSetAttribute(node, type, item);
    };
    closingReconcileResizeAndTerminalOnce();
    backgroundCommitsClosingOnce();
    backgroundOpenHidesAndCancelsThenResumes();
    std::cout << "PASS actual surface + unchanged Navigator bodies: native visibility/input, panel/scrim frames, "
                 "reconcile/resize, background, stale events, terminal once and result after detach\n";
}
