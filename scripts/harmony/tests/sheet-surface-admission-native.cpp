// Actual helper regression source. Compile/execute only in the parent's serial
// controller; this child never invokes a native compiler or executable.
#include "sheet-surface-p2-boundary.hpp"
#include <iostream>

namespace {
using Intent = HarmonySheetSurface::AnimationIntent;

void newCollapsedAdmission(Intent intent) {
    ArkUI_NodeContent content;
    ArkUI_Context context;
    auto s = surface(content, context);
    const auto collapsed = geometry(180, 620);
    const auto positive = geometry();
    assert(collapsed.panelHeight == 0 && collapsed.rootHeight == 180);
    s->layout(collapsed, 0);
    s->setActive(true);
    auto panel = s->interactionNode();
    int completed = 0;
    const float finalOffset = intent == Intent::Opening ? 0 : positive.panelHeight;
    s->animateTo(0, 0, [&](bool settled) {
        assert(settled);
        ++completed;
        assert(s->currentOffset() == finalOffset);
        assert(f(panel, NODE_TRANSLATE, 1) == finalOffset);
    }, intent);
    auto admitted = animators.back();
    sample(admitted, 0.2f);
    s->layout(collapsed, 0);
    auto repeated = animators.back();
    s->layout(positive, 0);
    auto restored = animators.back();
    finish(admitted);
    finish(repeated);
    assert(completed == 0);
    sample(restored, 0.5f);
    if (intent == Intent::Opening) assert(s->currentOffset() == 0);
    else assert(s->currentOffset() > 0 && s->currentOffset() < positive.panelHeight);
    finish(restored);
    finish(restored);
    finish(admitted);
    assert(completed == 1 && s->currentOffset() == finalOffset);
    s->retire();
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}

void existingPositiveCollapse(Intent intent) {
    ArkUI_NodeContent content;
    ArkUI_Context context;
    auto s = surface(content, context);
    const auto positive = geometry();
    const auto collapsed = geometry(180, 620);
    const bool closing = intent == Intent::Closing;
    const float target = closing ? positive.panelHeight : 0;
    s->layout(positive, closing ? 0 : positive.panelHeight);
    s->setActive(true);
    int completed = 0;
    s->animateTo(target, 0, [&](bool settled) {
        assert(settled);
        ++completed;
        assert(s->currentOffset() == target);
    }, intent);
    auto initial = animators.back();
    sample(initial, 0.2f);
    s->layout(collapsed, 0);
    auto first = animators.back();
    s->layout(collapsed, 0);
    auto second = animators.back();
    s->layout(positive, 0);
    auto restored = animators.back();
    finish(initial);
    finish(first);
    finish(second);
    finish(restored);
    finish(restored);
    assert(completed == 1 && s->currentOffset() == target);
    s->retire();
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}
} // namespace

int main() {
    configure();
    for (auto intent : {Intent::Opening, Intent::Closing}) {
        newCollapsedAdmission(intent);
        existingPositiveCollapse(intent);
    }
    std::cout << "PASS actual helper explicit admission intent: new collapsed open/close, "
                 "positive-zero-positive, duplicate terminals and exact native panel endpoint\n";
}
