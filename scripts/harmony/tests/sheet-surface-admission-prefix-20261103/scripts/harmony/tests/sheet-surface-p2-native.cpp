// SOURCE ONLY in the implementation child. Parent runs this IDENTICAL P2 body
// with its immutable pre-fix cpp/hpp pair and then the fixed cpp/hpp pair.
#include "sheet-surface-p2-boundary.hpp"

// The historical header predates this separately authorized accessor.
// Parent's baseline driver sets this to 0; all P2 regression tests stay enabled.
#ifndef SHEET_SURFACE_TEST_INTERACTION_NODE
#define SHEET_SURFACE_TEST_INTERACTION_NODE 1
#endif

namespace {
void restoreBeforeFinish(bool closing, unsigned collapsedLayouts) {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    auto s = surface(content, context);
    const auto positive = geometry();
    const auto collapsed = geometry(0);
    const float terminal = closing ? positive.panelHeight : 0;
    s->layout(positive, closing ? 0 : positive.panelHeight);
    s->setActive(true);
    auto panel = content.root->children.at(1);
    auto scrim = content.root->children.at(0);
    int completions = 0;
    s->animateTo(terminal, closing ? 700 : -700, [&](bool settled) {
        assert(settled);
        ++completions;
        assert(s->currentOffset() == terminal);
        assert(f(panel, NODE_TRANSLATE, 1) == terminal);
        assert(f(scrim, NODE_OPACITY) == (closing ? 0 : 1));
    });
    auto initial = animators.back();
    sample(initial, 0.25f);
    std::vector<ArkUI_AnimatorHandle> canceled{initial};
    for (unsigned index = 0; index != collapsedLayouts; ++index) {
        s->layout(collapsed, 0);
        assert(s->currentOffset() == 0);
        assert(f(panel, NODE_HEIGHT) == 0 && f(scrim, NODE_OPACITY) == 0);
        auto current = animators.back();
        sample(current, 0.4f);
        canceled.push_back(current);
        // Duplicate callbacks from a previous generation cannot complete.
        finish(canceled[index]);
        assert(completions == 0);
    }
    // The caller offset is deliberately zero. A closing restart still closes;
    // an opening restart must not reinterpret collapsed target==height as close.
    s->layout(positive, 0);
    auto restored = animators.back();
    for (auto previous : canceled) finish(previous);
    assert(completions == 0);
    sample(restored, 0.5f);
    assert(closing ? s->currentOffset() > 0 : s->currentOffset() == 0);
    finish(restored);
    assert(completions == 1 && s->currentOffset() == terminal);
    finish(restored);
    for (auto previous : canceled) finish(previous);
    assert(completions == 1 && s->currentOffset() == terminal);
    s->retire();
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}

void finishWhileCollapsed(bool closing, bool animateReentry) {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    std::shared_ptr<HarmonySheetSurface> s = surface(content, context);
    std::weak_ptr<HarmonySheetSurface> weak = s;
    const auto positive = geometry();
    const auto collapsed = geometry(0);
    const float terminal = closing ? positive.panelHeight : 0;
    const float reentryTerminal = closing ? 0 : positive.panelHeight;
    s->layout(positive, closing ? 0 : positive.panelHeight);
    s->setActive(true);
    auto panel = content.root->children.at(1);
    int completions = 0;
    int reentryCompletions = 0;
    s->animateTo(terminal, 0, [&](bool settled) {
        assert(settled);
        ++completions;
        // Policy: an SDK finish at valid zero height completes once at exact
        // numeric zero. It does not defer completion waiting for positive size.
        assert(s->currentOffset() == 0 && f(panel, NODE_TRANSLATE, 1) == 0);
        assert(f(panel, NODE_HEIGHT) == 0);
        // Host knows the completed intent; its reentrant restore chooses the
        // corresponding settled offset, without any old native write afterward.
        s->layout(positive, terminal);
        assert(s->currentOffset() == terminal);
        if (animateReentry) {
            s->animateTo(reentryTerminal, 0, [&](bool reentrySettled) {
                assert(reentrySettled);
                ++reentryCompletions;
                assert(s->currentOffset() == reentryTerminal);
                assert(f(panel, NODE_TRANSLATE, 1) == reentryTerminal);
                s->retire();
                assert(!content.root);
                s.reset();
            });
        }
    });
    auto initial = animators.back();
    s->layout(collapsed, 0);
    auto firstCollapsed = animators.back();
    s->layout(collapsed, 0);
    auto finalCollapsed = animators.back();
    finish(initial);
    finish(firstCollapsed);
    assert(completions == 0);
    finish(finalCollapsed);
    assert(completions == 1 && s->currentOffset() == terminal);
    auto reentered = animateReentry ? animators.back() : nullptr;
    finish(finalCollapsed);
    finish(firstCollapsed);
    finish(initial);
    assert(completions == 1 && reentryCompletions == 0 && s->currentOffset() == terminal);
    if (animateReentry) {
        sample(reentered, 0.5f);
        finish(reentered);
        finish(reentered);
        finish(finalCollapsed);
        assert(completions == 1 && reentryCompletions == 1);
        assert(!content.root && !weak.expired());
    } else {
        s->retire();
        s.reset();
    }
    drain();
    assert(weak.expired() && liveNodes == 0 && liveOptions == 0 && animators.empty());
}

#if SHEET_SURFACE_TEST_INTERACTION_NODE
void explicitInteractionNode() {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    auto s = surface(content, context);
    auto panel = content.root->children.at(1);
    // Inspect the fake boundary's owned hierarchy, never call getParent or
    // infer a panel in production host code.
    assert(s->interactionNode() == panel);
    assert(s->interactionNode() != s->viewport());
    assert(panel->children.at(1) == s->viewport());
    s->layout(geometry(), 0);
    s->setActive(true);
    s->setActive(false);
    assert(s->interactionNode() == panel); // Background is still attached.
    s->detach();
    assert(!content.root && s->interactionNode() == nullptr);
    s->retire();
    assert(s->interactionNode() == nullptr);
    s.reset();
    drain();
    assert(liveNodes == 0);

    s = surface(content, context, [&] {
        s->retire();
        assert(!content.root && s->interactionNode() == nullptr);
        s.reset();
    });
    s->layout(geometry(), 0);
    s->setActive(true);
    click(content.root->children.at(0));
    drain();
    assert(liveNodes == 0);
}
#endif
} // namespace

int main() {
    configure();
    for (bool closing : {false, true}) {
        for (unsigned repeats : {1u, 3u}) restoreBeforeFinish(closing, repeats);
        for (bool reentry : {false, true}) finishWhileCollapsed(closing, reentry);
    }
#if SHEET_SURFACE_TEST_INTERACTION_NODE
    explicitInteractionNode();
#endif
}
