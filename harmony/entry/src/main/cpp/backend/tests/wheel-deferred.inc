// Production default binding and ViewNode platform resolution, with only the
// surrounding tree/factory lifecycle represented by an explicit host boundary.
// The replay input is the actual compiler -> packaged Renderer attribute flow.
namespace WheelDeferredProof {
using namespace Valdi;
using namespace Valdi::Harmony::detail;
#include "wheel-class-selection.inc"
struct ViewTransactionScope {};
struct Factory { StringBox name; };
struct Manager {
    PlatformType platform = PlatformTypeHarmony;
    PlatformType getPlatformType() const { return platform; }
};
struct ManagerContext {
    Manager manager;
    Manager& getViewManager() { return manager; }
};
struct Tree {
    ManagerContext context;
    std::map<std::string, std::shared_ptr<Factory>> factories;
    ManagerContext* getViewManagerContext() { return &context; }
    std::shared_ptr<Factory> getOrCreateViewFactory(const StringBox& name) {
        auto& slot = factories[name.slowToString()];
        if (!slot) slot = std::make_shared<Factory>(Factory{name});
        return slot;
    }
};
struct ViewNode {
    Tree* _viewNodeTree;
    std::shared_ptr<Factory> factory;
    std::function<void(const std::shared_ptr<Factory>&)> created;
    int replacements = 0;
    void setViewFactory(ViewTransactionScope&, std::shared_ptr<Factory> next) {
        if (factory == next) return;
        factory = std::move(next);
        ++replacements;
        created(factory);
    }
    void setViewClassNameForPlatform(ViewTransactionScope&, const StringBox&, PlatformType);
};
#include "wheel-deferred-platform.inc"
struct Binder {
    std::function<Result<Void>(ViewTransactionScope&, ViewNode&, const Value&)> apply;
    std::function<void(ViewTransactionScope&, ViewNode&)> reset;
    template<typename Apply, typename Reset>
    void bind(const char* name, Apply a, Reset r) {
        require(std::string(name) == "harmonyClass", "wrong default binding");
        apply = std::move(a); reset = std::move(r);
    }
};
static void replay(const std::string& filename) {
    std::ifstream file(filename);
    require(bool(file), "missing compiled Harmony flow");
    const std::string json((std::istreambuf_iterator<char>(file)), {});
    const auto parsed = correctJsonToValue(json);
    require(bool(parsed) && parsed.value().isArray(), "invalid compiled Harmony flow");
    const auto* flows = parsed.value().getArray();
    require(flows->size() == 6, "three components in debug/minified output required");
    Binder binder;
#include "wheel-deferred-binding.inc"
    for (const auto& flow : *flows) {
        Scene scene;
        scene.root->wheel->retire();
        scene.root->wheel.reset();
        scene.drain();
        Tree tree;
        ViewTransactionScope scope;
        ViewNode node {&tree, nullptr, [&](const auto& factory) {
            if (factory) {
                require(wheelClass(factory->name), "Deferred resolved an unsupported wheel class");
                scene.root->wheel = std::make_shared<NativeWheel>(scene.root, wheelKind(factory->name));
            }
        }};
        auto apply = [&] {
            const auto attributes = flow.getMapValue("attributes");
            for (const auto& attribute : *attributes.getArray()) {
                const auto name = attribute.getMapValue("name").toStringBox().slowToString();
                if (name == "harmonyClass") {
                    const auto result = binder.apply(scope, node, attribute.getMapValue("value"));
                    require(bool(result), "native default class binding failed");
                } else {
                    require(node.factory && scene.root->wheel, "Deferred config arrived before class resolution");
                    applyWheelAttribute(*scene.root, StringBox::fromCString(name.c_str()),
                        name == "onChange" ? Value(scene.callback) : attribute.getMapValue("value"));
                }
            }
        };
        apply();
        require(node.replacements == 1 && !scene.wheel()->controls.empty(), "Deferred failed to create concrete wheel");
        const auto first = scene.wheel()->controls[0];
        apply();
        require(node.replacements == 1 && scene.wheel()->controls[0] == first, "controlled render replaced Deferred wheel");
        const auto previous = node.factory;
        tree.context.manager.platform = PlatformTypeIOS;
        binder.apply(scope, node, Value("ForeignHarmonyClass"));
        require(node.factory == previous, "native Harmony class changed an iOS view");
        scene.drain();
    }
}
}
