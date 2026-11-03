#include "gesture.hpp"
#include <type_traits>
using namespace Valdi;
using namespace Valdi::Harmony::detail;
static_assert(std::has_virtual_destructor_v<GestureNode>);
static_assert(std::is_same_v<decltype(GestureNode::longPressDuration), double>);

// The relocatable SDK link must resolve these calls to the independently
// compiled production module, alongside the real manager's calls.
void useHarmonyGestureModule(GestureNode& node, ArkUI_NodeEvent* event, const StringBox& name, const Value& value) {
    (void)gestureInputUserData(node);
    gestureInputEvent(event);
    gestureInputEvent(node, event);
    gestureAttribute(node, name, value);
    resetGestureAttribute(node, name);
    updateTouchRegion(node);
    auto terminal = consumeRawTerminal(node, node.lastTouch);
    deliverRawTerminal(node, terminal);
    cancelGestures(node);
    refreshGestures(node);
}
