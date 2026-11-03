// Actual Scroll specs/queued retry/properties and Node disposal/root-mount
// bodies, with production ScrollState math and installed SDK declarations.
#define VALDI_SCROLL_REFRESH_TEST
#include "refresh-native.cpp"

namespace Valdi::Harmony::detail {
// Notice delivery and native event receivers are inactive in these controller/
// hierarchy cases; the full backend ABI compile checks their real definitions.
void NativeScroll::drain() {}
void NativeScroll::event(ArkUI_NodeEvent*) noexcept {}
void NativeScroll::customEvent(ArkUI_NodeCustomEvent*) noexcept {}
}

static void nextTask(RefreshScene& scene) {
    require(!scene.queued.empty(), "expected deferred production command");
    auto fn = std::move(scene.queued.front());
    scene.queued.erase(scene.queued.begin());
    fn();
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    const std::string scenario = argv[1];
    RefreshScene scene;
    requireNoNativeMount("before Scroll/Refresh review scenario");
    detail::resetRefreshAttribute(*scene.root->node, "enabled");
    auto scroll = scene.child->scroll;
    auto& record = records[scroll->handle];
    scroll->geometry.viewportWidth = 120;
    scroll->geometry.viewportHeight = 80;
    auto tree = std::make_shared<TestTree>();
    auto view = std::make_shared<TestViewNode>();
    view->tree = tree.get();
    scene.child->viewNodeTree = tree;
    scene.child->viewNode = view;
    record.writes = 0;
    scene.api.getAttribute = [](ArkUI_NodeHandle handle, ArkUI_NodeAttributeType type) -> const ArkUI_AttributeItem* {
        assert(platform::live(handle) && type == NODE_SCROLL_OFFSET);
        static ArkUI_NumberValue values[2] {};
        values[0].f32 = values[1].f32 = 0;
        static ArkUI_AttributeItem item {values, 2, nullptr, nullptr};
        return &item;
    };
    if (scenario == "deferred-axis") {
        tree->available = false;
        view->horizontal = true;
        scroll->specs(Point(0, 50), Size {120, 600}, false);
        require(scroll->pending && !scroll->geometry.horizontal && tree->attempts == 1,
                "failed specs lock must retain pending vertical command");
        record.writes = 0;
        scroll->didLayout();
        nextTask(scene); // First command attempt cannot acquire the tree lock.
        require(scroll->pending && tree->attempts == 2 && record.writes == 0 && scene.queued.size() == 1,
                "failed deferred lock must queue retry without native writes");
        auto revision = scroll->geometryRevision;
        tree->available = true;
        nextTask(scene);
        require(tree->attempts == 3 && !scroll->geometry.horizontal && scroll->pending &&
                scroll->geometryRevision == revision && record.writes == 0 &&
                record.attributes[NODE_SCROLL_SCROLL_DIRECTION] == ARKUI_SCROLL_DIRECTION_VERTICAL &&
                scene.errors.size() == 1 && scene.errors[0].find("vertical scroll") != std::string::npos,
                "deferred horizontal axis bypassed Refresh guard with pending command");
    } else if (scenario == "immediate-axis") {
        view->horizontal = true;
        bool rejected = false;
        try { scroll->specs(Point(0, 50), Size {120, 600}, false); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && !scroll->geometry.horizontal && record.writes == 0 && scroll->pending,
                "acquired specs lock must reject before axis/native mutation");
    } else if (scenario == "properties-axis") {
        scroll->geometry.horizontal = true;
        bool rejected = false;
        try { scroll->properties(); }
        catch (const std::runtime_error&) { rejected = true; }
        require(rejected && record.writes == 0, "native properties accepted horizontal Refresh child");
        scroll->geometry.horizontal = false;
    } else if (scenario == "vertical-command") {
        scroll->specs(Point(0, 50), Size {120, 600}, false);
        scroll->didLayout();
        scene.drain();
        require(!scroll->pending && !scroll->geometry.horizontal && scene.errors.empty() &&
                record.values.contains(NODE_SCROLL_OFFSET) &&
                record.values[NODE_SCROLL_OFFSET].at(1).f32 == 50,
                "valid vertical pending command did not reach actual native offset write");
    } else if (scenario == "orphan-root") {
        auto retained = scene.view(scene.child);
        require(record.attributes[NODE_SCROLL_NESTED_SCROLL] == ARKUI_SCROLL_NESTED_MODE_SELF_ONLY,
                "test child did not begin with native Refresh nesting");
        scene.root->node->dispose();
        require(!scene.child->parent.lock() && scene.child->handle && !scene.child->disposing,
                "parent disposal did not retain/orphan Scroll child");
        scene.manager.mountRoot(retained, scene.content);
        require(scene.child->content == scene.content && !scene.child->parent.lock() &&
                record.attributes[NODE_SCROLL_NESTED_SCROLL] == ARKUI_SCROLL_NESTED_MODE_SELF_FIRST &&
                platform::invalid == 0,
                "retained child remounted as root with stale native SELF_ONLY");
    } else if (scenario == "orphan-shutdown") {
        scene.manager.shutdown();
        scene.drain();
        require(scene.backend->stopped && record.writes == 0 && platform::invalid == 0,
                "shutdown restored orphan properties on closing/disposed native nodes");
    } else return 2;
    std::cout << "production Refresh/Scroll review path passed: " << scenario << '\n';
}
