#include "HarmonyNativeScreens.hpp"

#include <arkui/native_interface.h>
#include <stdexcept>

namespace ValdiHarmony {
namespace {
namespace Routes = snap::valdi_modules::app_pages;
using Valdi::StringBox;
bool accepts(const std::weak_ptr<HarmonyNativeRouteIdentity>& identity, uint64_t epoch) {
    auto owner = identity.lock();
    return owner && owner->accepts(epoch);
}

void picker(const std::shared_ptr<HarmonyNativeRouteSurface>& surface, const std::string& title,
            const HarmonyNativeScreenActions& actions) {
    auto* api = static_cast<ArkUI_NativeNodeAPI_1*>(
        OH_ArkUI_QueryModuleInterfaceByName(ARKUI_NATIVE_NODE, "ArkUI_NativeNodeAPI_1"));
    if (!api) throw std::runtime_error("ArkUI node API unavailable");
    auto number = [&](ArkUI_NodeHandle node, ArkUI_NodeAttributeType type, float value) {
        ArkUI_NumberValue n[] = {{.f32 = value}};
        ArkUI_AttributeItem item{n, 1};
        if (api->setAttribute(node, type, &item)) throw std::runtime_error("Native route attribute failed");
    };
    auto text = [&](ArkUI_NodeHandle node, ArkUI_NodeAttributeType type, const std::string& value) {
        ArkUI_AttributeItem item{};
        item.string = value.c_str();
        if (api->setAttribute(node, type, &item)) throw std::runtime_error("Native route text failed");
    };
    auto scroll = surface->node(ARKUI_NODE_SCROLL);
    auto column = surface->node(ARKUI_NODE_COLUMN);
    number(scroll, NODE_WIDTH_PERCENT, 1);
    number(scroll, NODE_HEIGHT_PERCENT, 1);
    number(column, NODE_WIDTH_PERCENT, 1);
    number(column, NODE_PADDING, 16);
    surface->append(scroll, column);
    auto label = [&](const std::string& value) {
        auto node = surface->node(ARKUI_NODE_TEXT);
        text(node, NODE_TEXT_CONTENT, value);
        number(node, NODE_FONT_SIZE, 18);
        number(node, NODE_MARGIN, 10);
        surface->append(column, node);
    };
    auto button = [&](const std::string& value, std::function<void()> action) {
        auto node = surface->node(ARKUI_NODE_BUTTON);
        text(node, NODE_BUTTON_LABEL, value);
        number(node, NODE_WIDTH_PERCENT, 1);
        number(node, NODE_HEIGHT, 48);
        number(node, NODE_MARGIN, 4);
        surface->append(column, node);
        surface->onClick(node, std::move(action));
    };
    button("返回", actions.back);
    label(title);
    label("ArkUI 原生页面，选一项返回给 Valdi 页面");
    for (const auto* fruit : {"苹果", "香蕉", "橙子", "葡萄", "西瓜"}) {
        button(fruit, [finish = actions.finishFruit, fruit = std::string(fruit)] { finish(fruit); });
    }
    button("从原生页 push Valdi 详情页", actions.pushDetail);
    button("原生调用 switchTab('wheels')", actions.switchWheels);
    button("原生调用 showModal", actions.modal);
    // Opaque page background covers the retained outgoing route during tweens.
    ArkUI_NumberValue color[] = {{.u32 = 0xfff7f7f7}};
    ArkUI_AttributeItem background{color, 1};
    if (api->setAttribute(scroll, NODE_BACKGROUND_COLOR, &background))
        throw std::runtime_error("Native route background failed");
    surface->content(scroll);
}
}

HarmonyNativeAppUI makeHarmonyNativeAppUI(HarmonyNativeAsync onJS, HarmonyNativeAppUIProvider provider) {
    return [onJS, provider](std::weak_ptr<HarmonyNativeRouteIdentity> identity, uint64_t epoch) {
        onJS([onJS, provider, identity, epoch] {
            if (!accepts(identity, epoch)) return;
            auto host = provider(); // Generated unmarshalling is performed on JS.
            if (host == nullptr) return;
            Routes::ModalRequest request(STRING_LITERAL("原生调用"), STRING_LITERAL("app.ui.showModal"),
                true, STRING_LITERAL("确定"), STRING_LITERAL("取消"), false, {}, {});
            host->showModal(std::move(request)).then([onJS, provider, identity, epoch](auto reply) {
                if (!reply) return;
                const bool confirmed = reply.value().getConfirm();
                // Future continuations may run inline or on another queue.
                // Hop to JS even then; never touch AppUI pending from UI.
                onJS([provider, identity, epoch, confirmed] {
                    if (!accepts(identity, epoch)) return;
                    auto host = provider();
                    if (host == nullptr) return;
                    Routes::ToastRequest toast(
                        confirmed ? STRING_LITERAL("原生页点了确定") : STRING_LITERAL("原生页点了取消"),
                        STRING_LITERAL("none"), 1500, false);
                    host->showToast(std::move(toast));
                });
            });
        });
    };
}

HarmonyNativeScreens::HarmonyNativeScreens() { _factories.emplace("picker", picker); }
bool HarmonyNativeScreens::contains(const std::string& name) const { return _factories.count(name) != 0; }
void HarmonyNativeScreens::build(const std::string& name,
    const std::shared_ptr<HarmonyNativeRouteSurface>& surface, const std::string& title,
    const HarmonyNativeScreenActions& actions) const {
    auto found = _factories.find(name);
    if (found == _factories.end()) throw std::runtime_error("Harmony native screen is not registered: " + name);
    found->second(surface, title, actions);
}
} // namespace ValdiHarmony
