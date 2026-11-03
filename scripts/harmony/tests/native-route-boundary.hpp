#pragma once
// Explicit SDK execution boundary. Function table and callback signatures come
// from the installed SDK26 headers; this is not an ArkUI rendering claim.
#include <arkui/native_interface.h>
#include <arkui/native_node.h>
#include <algorithm>
#include <cassert>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

struct ArkUI_LayoutConstraint { int width = 0, height = 0; };
struct ArkUI_Node {
    ArkUI_NodeType type;
    ArkUI_NodeHandle parent = nullptr;
    std::vector<ArkUI_NodeHandle> children;
    void* data = nullptr;
    void* backendEventData = nullptr;
    std::vector<void (*)(ArkUI_NodeCustomEvent*)> custom;
    void (*click)(ArkUI_NodeEvent*) = nullptr;
    void* clickData = nullptr;
    std::string label;
    std::map<ArkUI_NodeAttributeType, float> attributes;
    int width = 0, height = 0, measured = 0, laidOut = 0;
};
struct ArkUI_NodeCustomEvent {
    ArkUI_NodeHandle node;
    ArkUI_NodeCustomEventType type;
    ArkUI_LayoutConstraint* constraint;
    void* backendData;
};
struct ArkUI_NodeEvent { void* data; };

struct NativeRouteBoundary {
    static inline NativeRouteBoundary* current = nullptr;
    ArkUI_NativeNodeAPI_1 api{};
    std::set<ArkUI_NodeHandle> nodes;
    std::deque<std::function<void()>> deferred;
    int createCount = 0, addCount = 0, failCreate = -1, failAdd = -1, callbackDepth = 0;
    int rootMeasures = 0, rootLayouts = 0;
    NativeRouteBoundary() {
        assert(!current); current = this;
        api.createNode = [](ArkUI_NodeType type) -> ArkUI_NodeHandle {
            if (++current->createCount == current->failCreate) return nullptr;
            auto* n = new ArkUI_Node{type}; current->nodes.insert(n); return n;
        };
        api.disposeNode = [](ArkUI_NodeHandle n) {
            assert(current->callbackDepth == 0);
            assert(n->children.empty() && !n->parent && !n->click && n->custom.empty());
            assert(current->nodes.erase(n) == 1); delete n;
        };
        api.addChild = [](ArkUI_NodeHandle p, ArkUI_NodeHandle c) -> int32_t {
            if (++current->addCount == current->failAdd) return ARKUI_ERROR_CODE_PARAM_INVALID;
            assert(!c->parent); c->parent = p; p->children.push_back(c); return 0;
        };
        api.removeChild = [](ArkUI_NodeHandle p, ArkUI_NodeHandle c) -> int32_t {
            assert(c->parent == p); c->parent = nullptr;
            auto& children = p->children;
            children.erase(std::find(children.begin(), children.end(), c)); return 0;
        };
        api.setAttribute = [](ArkUI_NodeHandle n, ArkUI_NodeAttributeType type,
                              const ArkUI_AttributeItem* item) -> int32_t {
            if (item->string) n->label = item->string;
            if (item->size) n->attributes[type] = item->value[0].f32;
            return 0;
        };
        api.markDirty = [](ArkUI_NodeHandle, ArkUI_NodeDirtyFlag) {};
        api.setUserData = [](ArkUI_NodeHandle n, void* d) -> int32_t { n->data = d; return 0; };
        api.getUserData = [](ArkUI_NodeHandle n) { return n->data; };
        api.addNodeCustomEventReceiver = [](ArkUI_NodeHandle n, auto receiver) -> int32_t {
            n->custom.push_back(receiver); return 0;
        };
        api.removeNodeCustomEventReceiver = [](ArkUI_NodeHandle n, auto receiver) -> int32_t {
            auto found = std::find(n->custom.begin(), n->custom.end(), receiver);
            assert(found != n->custom.end()); n->custom.erase(found); return 0;
        };
        api.addNodeEventReceiver = [](ArkUI_NodeHandle n, auto receiver) -> int32_t {
            assert(!n->click); n->click = receiver; return 0;
        };
        api.removeNodeEventReceiver = [](ArkUI_NodeHandle n, auto receiver) -> int32_t {
            assert(n->click == receiver); n->click = nullptr; return 0;
        };
        api.registerNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType type, int32_t, void* data) -> int32_t {
            assert(type == NODE_ON_CLICK); n->clickData = data; return 0;
        };
        api.unregisterNodeEvent = [](ArkUI_NodeHandle n, ArkUI_NodeEventType) { n->clickData = nullptr; };
        api.measureNode = [](ArkUI_NodeHandle n, ArkUI_LayoutConstraint* constraint) -> int32_t {
            ++n->measured; n->width = constraint->width; n->height = constraint->height;
            // Native standard-node layout is an explicit SDK double. CUSTOM
            // roots run their registered receivers, whose backend member does
            // not walk these app-owned native children.
            if (n->type == ARKUI_NODE_CUSTOM) {
                auto callbacks = n->custom;
                ArkUI_NodeCustomEvent event{n, ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE, constraint, n->backendEventData};
                for (auto callback : callbacks) {
                    ++current->callbackDepth; callback(&event); --current->callbackDepth;
                }
            } else for (auto child : n->children) current->api.measureNode(child, constraint);
            return 0;
        };
        api.layoutNode = [](ArkUI_NodeHandle n, int32_t, int32_t) -> int32_t {
            ++n->laidOut;
            if (n->type == ARKUI_NODE_CUSTOM) {
                auto callbacks = n->custom;
                ArkUI_NodeCustomEvent event{n, ARKUI_NODE_CUSTOM_EVENT_ON_LAYOUT, nullptr, n->backendEventData};
                for (auto callback : callbacks) {
                    ++current->callbackDepth; callback(&event); --current->callbackDepth;
                }
            } else for (auto child : n->children) current->api.layoutNode(child, 0, 0);
            return 0;
        };
    }
    ~NativeRouteBoundary() { drain(); assert(nodes.empty()); current = nullptr; }
    static void backend(ArkUI_NodeCustomEvent* event) {
        assert(event->backendData == current);
        if (event->type == ARKUI_NODE_CUSTOM_EVENT_ON_MEASURE) ++current->rootMeasures;
        else ++current->rootLayouts;
    }
    std::shared_ptr<ArkUI_Node> root() {
        auto n = api.createNode(ARKUI_NODE_CUSTOM);
        if (!n) throw std::runtime_error("root allocation");
        n->backendEventData = this;
        n->custom.push_back(backend);
        return std::shared_ptr<ArkUI_Node>(n, [this](auto n) {
            assert(n->data == nullptr && n->custom == std::vector{backend});
            n->custom.clear(); api.disposeNode(n);
        });
    }
    void drain() {
        auto tasks = std::move(deferred); deferred.clear();
        for (auto& task : tasks) task();
    }
    void click(const std::string& label) {
        auto found = std::find_if(nodes.begin(), nodes.end(), [&](auto n) { return n->label == label && n->click; });
        if (found == nodes.end() || !(*found)->click) std::cerr << "Missing native click: " << label << "\n";
        assert(found != nodes.end() && (*found)->click);
        auto n = *found; auto callback = n->click;
        ArkUI_NodeEvent event{n->clickData};
        ++callbackDepth; callback(&event); --callbackDepth;
    }
    ArkUI_NodeHandle named(const std::string& label) {
        for (auto node : nodes) if (node->label == label) return node;
        return nullptr;
    }
};

extern "C" {
void* OH_ArkUI_QueryModuleInterfaceByName(ArkUI_NativeAPIVariantKind, const char*) {
    return &NativeRouteBoundary::current->api;
}
void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) { return event->data; }
ArkUI_NodeHandle OH_ArkUI_NodeCustomEvent_GetNodeHandle(ArkUI_NodeCustomEvent* event) { return event->node; }
ArkUI_NodeCustomEventType OH_ArkUI_NodeCustomEvent_GetEventType(ArkUI_NodeCustomEvent* event) {
    return event->type;
}
ArkUI_LayoutConstraint* OH_ArkUI_NodeCustomEvent_GetLayoutConstraintInMeasure(ArkUI_NodeCustomEvent* event) {
    return event->constraint;
}
ArkUI_LayoutConstraint* OH_ArkUI_LayoutConstraint_Copy(const ArkUI_LayoutConstraint* c) {
    return new ArkUI_LayoutConstraint(*c);
}
void* OH_ArkUI_LayoutConstraint_Dispose(ArkUI_LayoutConstraint* c) { delete c; return nullptr; }
void OH_ArkUI_LayoutConstraint_SetMaxWidth(ArkUI_LayoutConstraint* c, int32_t w) { c->width = w; }
void OH_ArkUI_LayoutConstraint_SetMaxHeight(ArkUI_LayoutConstraint* c, int32_t h) { c->height = h; }
void OH_ArkUI_LayoutConstraint_SetMinWidth(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetMinHeight(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetPercentReferenceWidth(ArkUI_LayoutConstraint*, int32_t) {}
void OH_ArkUI_LayoutConstraint_SetPercentReferenceHeight(ArkUI_LayoutConstraint*, int32_t) {}
}
