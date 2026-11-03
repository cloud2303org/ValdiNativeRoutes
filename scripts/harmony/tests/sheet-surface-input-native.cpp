// SOURCE ONLY in the implementation child. The parent owns serial native
// compilation/execution. This fixture calls the actual helper implementation.
// SHEET_SURFACE_HEADER is honored by the unchanged real-SDK fake boundary.
#include "sheet-surface-p2-boundary.hpp"

namespace {
int32_t i(ArkUI_NodeHandle node, ArkUI_NodeAttributeType attribute) {
    return node->attributes.at(attribute).at(0).i32;
}

void assertInput(ArkUI_NodeHandle root, bool active, bool enabled) {
    assert(i(root, NODE_VISIBILITY) == (active ? ARKUI_VISIBILITY_VISIBLE : ARKUI_VISIBILITY_HIDDEN));
    assert(i(root, NODE_ENABLED) == (active && enabled ? 1 : 0));
    assert(i(root, NODE_HIT_TEST_BEHAVIOR) ==
        (active && enabled ? ARKUI_HIT_TEST_MODE_DEFAULT : ARKUI_HIT_TEST_MODE_BLOCK_DESCENDANTS));
}

void foregroundCloseIsVisibleAndInert() {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    int scrimCalls = 0;
    auto s = surface(content, context, [&] { ++scrimCalls; });
    auto root = content.root;
    auto scrim = root->children.at(0);
    auto panel = s->interactionNode();
    s->layout(geometry(), 0);
    s->setActive(true);
    assertInput(root, true, true);
    click(scrim);
    assert(scrimCalls == 1);
    int completions = 0;
    float expectedTerminal = 600;
    s->animateTo(600, 0, [&](bool settled) {
        assert(settled);
        ++completions;
        assert(s->currentOffset() == expectedTerminal);
        assert(f(panel, NODE_TRANSLATE, 1) == expectedTerminal);
    });
    auto initial = animators.back();
    sample(initial, 0.2f);
    const float firstOffset = s->currentOffset();
    const auto initialCount = animators.size();
    assert(firstOffset > 0 && firstOffset < 600);
    s->setInputEnabled(false);
    assertInput(root, true, false);
    assert(animators.size() == initialCount && animators.back() == initial);
    assert(s->interactionNode() == panel && content.root == root);
    click(scrim); // Forced native callback also observes the logical input gate.
    assert(scrimCalls == 1);
    sample(initial, 0.45f);
    assert(s->currentOffset() > firstOffset && completions == 0);
    // Foreground reconciliation must not re-enable the closing carrier.
    s->setActive(true);
    s->setInputEnabled(false);
    assertInput(root, true, false);
    assert(animators.size() == initialCount && animators.back() == initial);

    const float fraction = s->currentOffset() / 600;
    expectedTerminal = 400;
    s->layout(geometry(600, 200), 0);
    auto retargeted = animators.back();
    assert(retargeted != initial && animators.size() == initialCount + 1);
    assert(std::abs(s->currentOffset() / expectedTerminal - fraction) < 0.0001f);
    assert(f(s->viewport(), NODE_HEIGHT) == 376);
    assertInput(root, true, false);
    s->setInputEnabled(false);
    assert(animators.back() == retargeted && animators.size() == initialCount + 1);
    finish(initial); // Only the existing layout retarget revoked this generation.
    assert(completions == 0);
    click(scrim);
    assert(scrimCalls == 1);
    const float retargetedOffset = s->currentOffset();
    sample(retargeted, 0.5f);
    assert(s->currentOffset() > retargetedOffset);
    finish(retargeted);
    finish(retargeted);
    assert(completions == 1 && s->currentOffset() == expectedTerminal);
    assertInput(root, true, false);
    s->detach();
    assert(!content.root);
    s->setInputEnabled(true);
    s->setInputEnabled(false);
    assertInput(root, true, false); // Detached setter performed no native writes.
    s->retire();
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}

void backgroundStillCancelsAndResumeKeepsGate() {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    int scrimCalls = 0;
    auto s = surface(content, context, [&] { ++scrimCalls; });
    auto root = content.root;
    auto scrim = root->children.at(0);
    s->layout(geometry(), 0);
    s->setInputEnabled(false);
    assertInput(root, false, false);
    s->setActive(true);
    assertInput(root, true, false);
    int canceledCompletions = 0;
    s->animateTo(600, 0, [&](bool) { ++canceledCompletions; });
    auto initial = animators.back();
    // Stay short of the resized 280vp terminal so re-enabled scrim admission
    // below is checked while there is still a visible panel.
    sample(initial, 0.1f);
    const float interrupted = s->currentOffset();
    s->setActive(false);
    assertInput(root, false, false);
    s->setInputEnabled(true);
    assertInput(root, false, true); // Input preference cannot unhide background.
    click(scrim);
    assert(scrimCalls == 0);
    s->setInputEnabled(false);
    sample(initial, 0.8f);
    finish(initial);
    assert(canceledCompletions == 0 && s->currentOffset() == interrupted);

    const auto count = animators.size();
    s->layout(geometry(480, 320), interrupted);
    assert(animators.size() == count); // Background layout has no active settle.
    assert(f(s->viewport(), NODE_HEIGHT) == 256);
    assertInput(root, false, false);
    s->setActive(true);
    assertInput(root, true, false); // Closing input gate survives foreground resume.
    click(scrim);
    assert(scrimCalls == 0);
    int closingCompletions = 0;
    s->animateTo(280, 0, [&](bool settled) { assert(settled); ++closingCompletions; });
    auto resumed = animators.back();
    assert(animators.size() == count + 1);
    s->setInputEnabled(true);
    assertInput(root, true, true);
    assert(animators.back() == resumed && animators.size() == count + 1);
    click(scrim);
    assert(scrimCalls == 1);
    s->setInputEnabled(false);
    assertInput(root, true, false);
    finish(resumed);
    assert(closingCompletions == 1 && canceledCompletions == 0 && s->currentOffset() == 280);
    s->retire();
    s->setInputEnabled(true);
    assert(!content.root && s->interactionNode() == nullptr);
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}

void disabledInputPreservesCollapsedIntent(bool closing) {
    ArkUI_Context context;
    ArkUI_NodeContent content;
    int scrimCalls = 0;
    auto s = surface(content, context, [&] { ++scrimCalls; });
    auto root = content.root;
    const float terminal = closing ? 600 : 0;
    s->layout(geometry(), closing ? 0 : 600);
    s->setActive(true);
    int completions = 0;
    s->animateTo(terminal, 0, [&](bool settled) {
        assert(settled);
        ++completions;
        assert(s->currentOffset() == terminal);
    });
    auto initial = animators.back();
    sample(initial, 0.2f);
    s->setInputEnabled(false);
    s->layout(geometry(0), 0);
    auto collapsed = animators.back();
    s->setInputEnabled(true);
    s->setInputEnabled(false);
    assert(animators.back() == collapsed);
    s->layout(geometry(0), 0);
    auto collapsedAgain = animators.back();
    s->layout(geometry(), 0);
    auto restored = animators.back();
    assertInput(root, true, false);
    click(root->children.at(0));
    assert(scrimCalls == 0);
    finish(initial);
    finish(collapsed);
    finish(collapsedAgain);
    assert(completions == 0);
    finish(restored);
    finish(restored);
    assert(completions == 1 && s->currentOffset() == terminal);
    s->retire();
    s.reset();
    drain();
    assert(liveNodes == 0 && liveOptions == 0 && animators.empty());
}
} // namespace

int main() {
    configure();
    foregroundCloseIsVisibleAndInert();
    backgroundStillCancelsAndResumeKeepsGate();
    disabledInputPreservesCollapsedIntent(false);
    disabledInputPreservesCollapsedIntent(true);
}
