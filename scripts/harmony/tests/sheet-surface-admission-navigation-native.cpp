// SAME fixture with current explicit-intent helper and selected old/fixed host
// showSheet + six unchanged production bodies. No surface/visibility model.
#include "sheet-surface-admission-navigation-boundary.hpp"
#include <iostream>

namespace {
using Nav = ValdiHarmony::HarmonyNavigator;
using TestValue = ValdiHarmony::Value;

int32_t integerAttribute(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute) {
    return node->attributes.at(attribute).at(0).i32;
}

struct Fixture {
    ArkUI_NodeContent content;
    ArkUI_Context context;
    std::shared_ptr<Nav> nav = std::make_shared<Nav>();
    Nav::PagePtr page = std::make_shared<Nav::Page>();
    Fixture() {
        assert(liveNodes == 0 && liveOptions == 0 && animators.empty() && deferred.empty());
        nav->content = nav->_sheetContent = &content;
        nav->_uiContext = &context;
        page->root = nodeAPI.createNode(ARKUI_NODE_STACK);
    }
    void admit(float viewport, float keyboard) {
        nav->_sheetViewportHeight = viewport;
        nav->_keyboardOverlap = keyboard;
        nav->showSheet(page); // Actual admission method, never manual mounting.
        assert(nav->_sheet == page && nav->_sheetMounted == page && page->mounted);
        assert(page->mountedContent == &content && content.root && nav->_sheetSurface);
        assert(page->mountParent == nav->_sheetSurface->viewport());
        assert(page->mountParent->children.size() == 1 && page->mountParent->children.front() == page->root);
        assert(integerAttribute(content.root, NODE_VISIBILITY) == ARKUI_VISIBILITY_VISIBLE);
        assert(nav->unmounts == 0 && nav->resultScheduled == 0 && nav->resultDelivered == 0);
    }
    void restore() {
        nav->_sheetViewportHeight = 800;
        nav->_keyboardOverlap = 0;
        nav->layoutSheet();
    }
    ~Fixture() {
        if (nav->_sheet) nav->finishSheet(nav->_sheetGeneration, true);
        nav->drainJS();
        drain();
        assert(!content.root && liveNodes == 0 && liveOptions == 0 && animators.empty());
    }
};

void collapsedShowSheetOpensAfterRestore() {
    Fixture f;
    f.admit(180, 620);
    assert(f.nav->_fullWindowHeight == 800 && f.nav->sheetGeometry().panelHeight == 0);
    auto s = f.nav->_sheetSurface;
    auto panel = s->interactionNode();
    assert(f(panel, NODE_HEIGHT) == 0);
    assert(animators.size() == 1);
    auto admitted = animators.back();
    sample(admitted, 0.2f);
    f.restore(); // Restore positive geometry BEFORE the admitted animation ends.
    auto restored = animators.back();
    assert(restored != admitted && f.nav->sheetGeometry().panelHeight == 600);
    finish(admitted);
    assert(f.nav->_sheet == f.page && !f.nav->_sheetClosing);
    sample(restored, 0.5f);
    finish(restored);
    // Old three-argument showSheet completes at numeric closed=600 while still
    // logically owning this page. This assertion is the expected baseline RED.
    assert(f.nav->_sheet == f.page && !f.nav->_sheetClosing && f.page->mounted);
    assert(f.nav->unmounts == 0 && f.nav->resultScheduled == 0 && f.nav->resultDelivered == 0);
    assert(s->currentOffset() == 0 &&
           "Zero-height showSheet admission must restore the whole native panel OPEN at offset zero");
    assert(::f(panel, NODE_TRANSLATE, 1) == 0);
    assert(integerAttribute(f.content.root, NODE_VISIBILITY) == ARKUI_VISIBILITY_VISIBLE);
    assert(integerAttribute(f.content.root, NODE_ENABLED) == 1);
    assert(::f(f.page->root, NODE_HEIGHT) == 576);
    finish(restored);
    finish(admitted);
    assert(f.nav->_sheet == f.page && f.nav->resultScheduled == 0);

    // Closing remains explicit and the earlier positive-zero-positive repair
    // remains effective through the same unchanged Navigator/layout bodies.
    f.nav->closeSheet(TestValue{42}, false);
    auto closing = animators.back();
    sample(closing, 0.2f);
    f.nav->_sheetViewportHeight = 180;
    f.nav->_keyboardOverlap = 620;
    f.nav->layoutSheet();
    auto collapsedClose = animators.back();
    f.restore();
    auto restoredClose = animators.back();
    finish(closing);
    finish(collapsedClose);
    assert(f.nav->_sheetClosing && f.nav->unmounts == 0);
    finish(restoredClose);
    assert(::f(panel, NODE_TRANSLATE, 1) == 600);
    assert(!f.content.root && !f.nav->_sheet && f.nav->unmounts == 1);
    assert(f.nav->resultScheduled == 1 && f.nav->resultDelivered == 0);
    finish(restoredClose);
    f.nav->drainJS();
    assert(f.nav->resultDelivered == 1 && f.nav->contextRetirements == 1);
}

void positiveShowSheetSurvivesCollapse() {
    Fixture f;
    f.admit(800, 0);
    auto s = f.nav->_sheetSurface;
    auto admitted = animators.back();
    sample(admitted, 0.2f);
    f.nav->_sheetViewportHeight = 180;
    f.nav->_keyboardOverlap = 620;
    f.nav->layoutSheet();
    auto collapsed = animators.back();
    f.restore();
    auto restored = animators.back();
    finish(admitted);
    finish(collapsed);
    finish(restored);
    assert(s->currentOffset() == 0 && ::f(s->interactionNode(), NODE_TRANSLATE, 1) == 0);
    assert(f.nav->_sheet == f.page && f.nav->unmounts == 0 && f.nav->resultScheduled == 0);
}
} // namespace

int main() {
    configure();
    collapsedShowSheetOpensAfterRestore();
    positiveShowSheetSurvivesCollapse();
    std::cout << "PASS actual helper + unchanged showSheet admission: coherent800/180/620, restore OPEN0, "
                 "no premature result/unmount, explicit close and positive-zero-positive\n";
}
