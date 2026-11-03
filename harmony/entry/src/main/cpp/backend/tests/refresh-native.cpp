// Execute extracted production component/hierarchy/lifetime bodies against the
// actual SDK declarations. Native input arbitration/rendering remain device QA.
#define VALDI_REFRESH_TEST
#include "mount-reentry.cpp"
#include <map>

struct RecordedNode {
    std::map<ArkUI_NodeAttributeType, int32_t> attributes;
    std::map<ArkUI_NodeAttributeType, std::vector<ArkUI_NumberValue>> values;
    std::map<ArkUI_NodeEventType, void*> events;
    void (*receiver)(ArkUI_NodeEvent*) = nullptr;
    int writes = 0;
};
static std::map<ArkUI_NodeHandle, RecordedNode> records;
struct NativeEvent {
    void* data;
    ArkUI_NodeEventType type;
    ArkUI_NodeComponentEvent component {};
};
extern "C" void* OH_ArkUI_NodeEvent_GetUserData(ArkUI_NodeEvent* event) {
    return reinterpret_cast<NativeEvent*>(event)->data;
}
extern "C" ArkUI_NodeEventType OH_ArkUI_NodeEvent_GetEventType(ArkUI_NodeEvent* event) {
    return reinterpret_cast<NativeEvent*>(event)->type;
}
extern "C" ArkUI_NodeComponentEvent* OH_ArkUI_NodeEvent_GetNodeComponentEvent(ArkUI_NodeEvent* event) {
    return &reinterpret_cast<NativeEvent*>(event)->component;
}

struct RefreshScene : Scene {
    static RefreshScene* current;
    std::vector<DispatchFunction> queued;
    detail::Transaction transaction {backend};
    int requests = 0;
    std::function<void()> request;
    std::shared_ptr<detail::NativeRefresh> refresh;
#ifdef VALDI_SCROLL_REFRESH_TEST
    std::vector<std::string> errors;
#endif
    RefreshScene() {
        current = this;
        records.clear();
#ifdef VALDI_SCROLL_REFRESH_TEST
        backend->configuration.reportError = [this](const std::string& value) { errors.push_back(value); };
#endif
        backend->configuration.dispatchUI = [this](DispatchFunction fn, bool sync) {
            if (sync) fn(); else queued.push_back(std::move(fn));
        };
        api.createNode = [](ArkUI_NodeType) -> ArkUI_NodeHandle {
            auto native = std::make_unique<platform::Node>();
            auto handle = reinterpret_cast<ArkUI_NodeHandle>(native.get());
            current->nativeNodes.push_back(std::move(native));
            return handle;
        };
        api.setAttribute = [](ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type,
                              const ArkUI_AttributeItem* item) -> int32_t {
            assert(platform::live(handle) && item && item->size >= 1);
            if (type != NODE_SCROLL_OFFSET) records[handle].attributes[type] = item->value[0].i32;
            records[handle].values[type] = {item->value, item->value + item->size};
            ++records[handle].writes;
            return 0;
        };
        api.addNodeEventReceiver = [](ArkUI_NodeHandle handle, void (*fn)(ArkUI_NodeEvent*)) -> int32_t {
            assert(platform::live(handle)); records[handle].receiver = fn; return 0;
        };
        api.removeNodeEventReceiver = [](ArkUI_NodeHandle handle, void (*)(ArkUI_NodeEvent*)) -> int32_t {
            assert(platform::live(handle)); records[handle].receiver = nullptr; return 0;
        };
        api.registerNodeEvent = [](ArkUI_NodeHandle handle, ArkUI_NodeEventType type, int32_t,
                                   void* data) -> int32_t {
            assert(platform::live(handle)); records[handle].events[type] = data; return 0;
        };
        api.unregisterNodeEvent = [](ArkUI_NodeHandle handle, ArkUI_NodeEventType type) {
            assert(platform::live(handle)); records[handle].events.erase(type);
        };
        api.addChild = [](ArkUI_NodeHandle parent, ArkUI_NodeHandle node) -> int32_t {
            assert(platform::live(parent) && platform::live(node)); return 0;
        };
#ifdef VALDI_SCROLL_REFRESH_TEST
        child->scroll = std::make_shared<detail::NativeScroll>(child);
        child->scroll->handle = api.createNode(ARKUI_NODE_SCROLL);
        child->scroll->content = api.createNode(ARKUI_NODE_CUSTOM);
#else
        child->scroll = std::make_shared<detail::InactiveSubsystem>();
        child->scroll->handle = child->scroll->content = child->handle;
#endif
        refresh = attachRefresh(root->node);
#ifdef VALDI_SCROLL_REFRESH_TEST
        child->scroll->properties();
#endif
        auto callback = std::make_shared<ValueFunction>();
        callback->fn = [this] { ++requests; if (request) request(); };
        detail::refreshAttribute(*root->node, "onRefresh", Value(callback));
    }
    std::shared_ptr<detail::NativeRefresh> attachRefresh(const std::shared_ptr<detail::Node>& owner) {
        auto result = std::make_shared<detail::NativeRefresh>(owner);
        owner->refresh = result;
        result->initialize();
        return result;
    }
    void emit(ArkUI_NodeEventType type, int32_t state = 0) {
        auto& record = records[refresh->handle];
        assert(record.receiver && record.events.contains(type));
        NativeEvent event {record.events[type], type, {}};
        event.component.data[0].i32 = state;
        record.receiver(reinterpret_cast<ArkUI_NodeEvent*>(&event));
    }
    void pull() {
        emit(NODE_REFRESH_STATE_CHANGE, 1);
        emit(NODE_REFRESH_STATE_CHANGE, 2);
        emit(NODE_REFRESH_ON_REFRESH);
    }
    void drain() {
        while (!queued.empty()) {
            auto work = std::move(queued);
            queued.clear();
            for (auto& fn : work) fn();
        }
    }
    Ref<View> view(const std::shared_ptr<detail::Node>& node) {
        auto result = std::make_shared<View>(); result->node = node; return result;
    }
    ~RefreshScene() { manager.shutdown(); drain(); current = nullptr; }
};
RefreshScene* RefreshScene::current = nullptr;

static void require(bool value, const char* message) {
    if (!value) {
        std::cerr << "REGRESSION: " << message << '\n';
        std::exit(75);
    }
}

#ifndef VALDI_SCROLL_REFRESH_TEST
int main(int argc, char** argv) {
    if (argc != 2) return 2;
    const std::string scenario = argv[1];
    RefreshScene scene;
    auto& refresh = *scene.refresh;
    auto& state = refresh.state;
    auto native = refresh.handle;
    auto& record = records[native];
    if (scenario == "controlled") {
        scene.request = [&] { detail::refreshAttribute(*scene.root->node, "refreshing", Value(true)); };
        scene.pull();
        require(scene.requests == 1 && record.attributes[NODE_REFRESH_REFRESHING] == 1, "pull must request controlled start");
        scene.emit(NODE_REFRESH_ON_REFRESH);
        scene.drain();
        require(scene.requests == 1 && state.refreshing, "duplicate/native programmatic callback echoed");
        detail::resetRefreshAttribute(*scene.root->node, "refreshing");
        require(!state.refreshing && record.attributes[NODE_REFRESH_REFRESHING] == 0, "finish must stop spinner");
        scene.pull();
        require(scene.requests == 2, "next independent pull must request again");
    } else if (scenario == "programmatic") {
        detail::refreshAttribute(*scene.root->node, "refreshing", Value(true));
        scene.emit(NODE_REFRESH_ON_REFRESH); // Native programmatic transition can emit this.
        scene.drain();
        require(scene.requests == 0 && record.attributes[NODE_REFRESH_REFRESHING] == 1,
                "controlled programmatic start must not echo business onRefresh");
    } else if (scenario == "disabled") {
        detail::refreshAttribute(*scene.root->node, "enabled", Value(false));
        scene.pull();
        scene.drain();
        require(scene.requests == 0 && record.attributes[NODE_REFRESH_PULL_TO_REFRESH] == 0,
                "disabled refresh must disable native threshold and business request");
        detail::resetRefreshAttribute(*scene.root->node, "enabled");
        scene.request = [&] { detail::refreshAttribute(*scene.root->node, "refreshing", Value(true)); };
        scene.pull();
        require(scene.requests == 1, "re-enabled native pull must request");
    } else if (scenario == "shutdown") {
        scene.request = [&] { scene.manager.shutdown(); };
        auto self = scene.refresh; // Hold event userdata while the SDK stack unwinds.
        scene.pull();
        require(scene.requests == 1 && scene.backend->stopped && refresh.retired, "callback shutdown must retire");
        require(!records[native].receiver && records[native].events.empty(), "retire must unregister before return");
        require(reinterpret_cast<platform::Node*>(native)->alive, "native event handle freed before callback unwound");
        scene.drain();
        require(!reinterpret_cast<platform::Node*>(native)->alive && !self->handle && platform::invalid == 0,
                "deferred native disposal must complete without stale access");
    } else if (scenario == "snapshot") {
        scene.pending([&] { scene.manager.shutdown(); });
        bool rejected = false;
        try { scene.manager.mountRoot(scene.root, scene.content); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && scene.completions == 1 && scene.backend->stopped, "snapshot detach shutdown must abort remount");
        requireNoNativeMount("Refresh subtree snapshot completion -> shutdown");
        scene.drain();
    } else if (scenario == "transfer") {
        auto childView = scene.view(scene.child);
        require(detail::nativeScrollNestedMode(*scene.child) == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY, "Refresh nesting default");
        scene.transaction.insertChildView(scene.view(scene.target), childView, 0, nullptr);
        require(scene.root->node->children.empty() && record.attributes[NODE_REFRESH_PULL_TO_REFRESH] == 0,
                "Refresh must release transferred child");
        require(detail::nativeScrollNestedMode(*scene.child) == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST, "ordinary nesting not restored");
        scene.transaction.insertChildView(scene.root, childView, 0, nullptr);
        require(scene.target->children.empty() && scene.root->node->children.size() == 1 &&
                detail::nativeScrollNestedMode(*scene.child) == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY, "return transfer");
    } else if (scenario == "capacity") {
        auto second = scene.makeNode();
        second->scroll = std::make_shared<detail::InactiveSubsystem>();
        bool rejected = false;
        try { scene.transaction.insertChildView(scene.root, scene.view(second), 1, nullptr); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && scene.root->node->children.size() == 1 && platform::insertions == 0, "second child reached native Refresh");
    } else if (scenario == "reentrant-capacity") {
        auto targetRefresh = scene.attachRefresh(scene.target);
        auto replacement = scene.makeNode();
        replacement->scroll = std::make_shared<detail::InactiveSubsystem>();
        auto ownerView = scene.view(scene.target);
        scene.pending([&] { scene.transaction.insertChildView(ownerView, scene.view(replacement), 0, nullptr); });
        bool rejected = false;
        try { scene.transaction.insertChildView(ownerView, scene.view(scene.child), 0, nullptr); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && scene.completions == 1 && scene.target->children.size() == 1 &&
                scene.target->children[0] == replacement && platform::insertions == 1,
                "snapshot callback must not bypass single-child revalidation");
        require(targetRefresh->handle != nullptr, "target refresh lost");
    } else if (scenario == "generation") {
        scene.request = [&] {
            scene.root->node->detach();
            scene.manager.mountRoot(scene.root, scene.content);
        };
        scene.pull();
        record.writes = 0;
        scene.drain();
        require(scene.requests == 1 && record.writes == 0, "old reconcile touched remounted refresh generation");
    } else if (scenario == "child-generation") {
        auto childView = scene.view(scene.child);
        scene.request = [&] {
            scene.transaction.insertChildView(scene.view(scene.target), childView, 0, nullptr);
            scene.transaction.insertChildView(scene.root, childView, 0, nullptr);
        };
        scene.pull();
        record.writes = 0;
        scene.drain();
        require(scene.requests == 1 && record.writes == 0, "old request survived child transfer generation");
        scene.request = [&] { detail::refreshAttribute(*scene.root->node, "refreshing", Value(true)); };
        scene.pull();
        require(scene.requests == 2, "transferred child retained old request deduplication");
    } else if (scenario == "child-dispose") {
        detail::refreshAttribute(*scene.root->node, "refreshing", Value(true));
        scene.child->dispose();
        require(scene.root->node->children.empty() && record.attributes[NODE_REFRESH_REFRESHING] == 0 &&
                record.attributes[NODE_REFRESH_PULL_TO_REFRESH] == 0 && state.refreshing,
                "direct child disposal left an empty native spinner active");
    } else if (scenario == "disposing-child-event") {
        scene.pending([&] { scene.pull(); });
        scene.child->dispose();
        scene.drain();
        require(scene.completions == 1 && scene.requests == 0, "snapshot completion admitted pull from disposing child");
    } else if (scenario == "reset-suspend") {
        detail::refreshAttribute(*scene.root->node, "refreshing", Value(true));
        scene.manager.setSuspended(true);
        require(state.refreshing && record.attributes[NODE_REFRESH_REFRESHING] == 0 &&
                record.attributes[NODE_REFRESH_PULL_TO_REFRESH] == 0, "suspend must hide without losing controlled state");
        scene.manager.setSuspended(false);
        require(record.attributes[NODE_REFRESH_REFRESHING] == 1 && scene.requests == 0, "resume controlled state");
        detail::resetRefreshAttribute(*scene.root->node, "refreshing");
        detail::resetRefreshAttribute(*scene.root->node, "onRefresh");
        require(!refresh.onRefresh && !state.refreshing, "reset must clear callback/control");
        scene.pull();
        scene.drain();
        require(scene.requests == 0, "cleared callback delivered");
    } else if (scenario == "vertical") {
        scene.transaction.insertChildView(scene.view(scene.target), scene.view(scene.child), 0, nullptr);
        scene.child->scroll->geometry.horizontal = true;
        bool rejected = false;
        try { scene.transaction.insertChildView(scene.root, scene.view(scene.child), 0, nullptr); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && scene.child->parent.lock() == scene.target, "horizontal scroll accepted into Refresh");
    } else return 2;
    std::cout << "production native Refresh path passed: " << scenario << '\n';
}
#endif
