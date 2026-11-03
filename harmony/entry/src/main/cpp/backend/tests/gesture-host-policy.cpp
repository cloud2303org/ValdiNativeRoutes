// Supplementary exact manager-adapter extraction; the controller is linked
// independently in gesture-native.cpp. All SDK types come from SDK 26.
#include "OverlayHitTest.hpp"
#include <arkui/ui_input_event.h>
#include <cstdio>
#include <stdexcept>
#include <vector>
using namespace Valdi::Harmony::detail;
struct Node {
    bool overlayHitTestManaged = false;
    OverlayHitMode overlayHitTestMode = OverlayHitMode::Default;
};
static std::vector<HitTestMode> writes;
static void check(int32_t code, const char*) { if (code) throw std::runtime_error("SDK failure"); }
extern "C" int32_t OH_ArkUI_PointerEvent_SetInterceptHitTestMode(const ArkUI_UIInputEvent*, HitTestMode mode) {
    writes.push_back(mode); return 0;
}
#include "gesture-host-policy-under-test.hpp"
int main() {
    Node node;
    applyInterceptPolicy(node, nullptr, false, "reject");
    applyInterceptPolicy(node, nullptr, true, "restore");
    if (writes != std::vector<HitTestMode>{HTM_BLOCK_DESCENDANTS, HTM_DEFAULT}) {
        std::fprintf(stderr, "REGRESSION: rejecting an unscoped hit must exclude descendants and restore DEFAULT on the next admitted hit\n");
        return 1;
    }
    writes.clear();
    node.overlayHitTestManaged = true; node.overlayHitTestMode = OverlayHitMode::None;
    applyInterceptPolicy(node, nullptr, false, "reject");
    applyInterceptPolicy(node, nullptr, true, "restore");
    if (writes != std::vector<HitTestMode>{HTM_BLOCK_DESCENDANTS, HTM_NONE}) return 2;
}
