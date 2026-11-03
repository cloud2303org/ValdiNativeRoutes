// Host regression for the production cache, pool statistics and preload loop.
// Attribute binding/default processor registration are isolated by the runner;
// all view-factory resolution, cache, pool and preload methods are production.
#include "valdi/runtime/Attributes/AttributesManager.hpp"
#include "valdi/runtime/Interfaces/IViewManager.hpp"
#include "valdi/runtime/Interfaces/IViewTransaction.hpp"
#include "valdi/runtime/Utils/MainThreadManager.hpp"
#include "valdi/runtime/Views/ViewFactory.hpp"
#include "valdi_core/cpp/Interfaces/ILogger.hpp"
#include "valdi_core/cpp/Interfaces/IBitmapFactory.hpp"
#include <deque>
#include <functional>
#include <iostream>
#include <stdexcept>

// Expose cache entries only to seed the legacy-null state for defensive checks.
#define private public
#include "valdi/runtime/Views/GlobalViewFactories.hpp"
#include "valdi/runtime/Views/ViewPreloader.hpp"
#include "valdi/runtime/Context/ViewManagerContext.hpp"
#undef private

using namespace Valdi;
#define CHECK(condition) do { if (!(condition)) throw std::runtime_error(#condition); } while (false)

namespace Valdi {
// Deliberate test seams: this suite tests factory consumers, not attribute binding.
SharedBoundAttributes AttributesManager::getAttributesForClass(const StringBox&) noexcept { return nullptr; }
void registerDefaultProcessors(AttributesManager&) {}
}

class Logger final : public ILogger {
public:
    void log(LogType, std::string) override {}
};

class Dispatcher final : public IMainThreadDispatcher {
public:
    std::deque<std::unique_ptr<DispatchFunction>> tasks;
    void dispatch(DispatchFunction* task, bool sync) override {
        CHECK(!sync);
        tasks.emplace_back(task);
    }
    void drain() {
        size_t count = 0;
        while (!tasks.empty()) {
            CHECK(++count < 100); // Detect an unsupported class rescheduling forever.
            auto task = std::move(tasks.front());
            tasks.pop_front();
            (*task)();
        }
    }
};

class Factory final : public ViewFactory {
public:
    Factory(const StringBox& name, IViewManager& manager) : ViewFactory(name, manager, nullptr) {}
protected:
    Ref<View> doCreateView(ViewNodeTree*, ViewNode*) override { return nullptr; }
};

class Manager final : public IViewManager {
public:
    std::function<Ref<ViewFactory>(const StringBox&)> resolve;
    size_t calls = 0;
    PlatformType getPlatformType() const override { return PlatformTypeHarmony; }
    RenderingBackendType getRenderingBackendType() const override { return RenderingBackendTypeNative; }
    StringBox getDefaultViewClass() override { return STRING_LITERAL("supported"); }
    Ref<ViewFactory> createViewFactory(const StringBox& name, const Ref<BoundAttributes>&) override {
        ++calls;
        CHECK(calls < 100);
        return resolve(name);
    }
    void callAction(ViewNodeTree*, const StringBox&, const Ref<ValueArray>&) override {}
    NativeAnimator createAnimator(snap::valdi_core::AnimationType, const std::vector<double>&,
                                  double, bool, bool, double, double) override { return nullptr; }
    std::vector<StringBox> getClassHierarchy(const StringBox&) override { return {}; }
    void bindAttributes(const StringBox&, AttributesBindingContext&) override {}
    Value createViewNodeWrapper(const Ref<ViewNode>&, bool) override { return Value(); }
    Ref<IViewTransaction> createViewTransaction(const Ref<MainThreadManager>&, bool) override { return nullptr; }
    Ref<IBitmapFactory> getViewRasterBitmapFactory() const override { return nullptr; }
};

struct Fixture {
    Logger logger;
    Manager manager;
    AttributeIds ids;
    Ref<Dispatcher> dispatcher = makeShared<Dispatcher>();
    Ref<MainThreadManager> main = makeShared<MainThreadManager>(dispatcher);
    Ref<ViewManagerContext> context = makeShared<ViewManagerContext>(
        manager, ids, nullptr, nullptr, true, main, logger);
    Ref<GlobalViewFactories> factories = context->getGlobalViewFactories();
    Ref<ViewPreloader> preloader = context->_viewPreloader;
    const StringBox unsupported = STRING_LITERAL("unsupported");
    const StringBox supported = STRING_LITERAL("supported");
    const StringBox alias = STRING_LITERAL("alias");
    Ref<ViewFactory> factory = makeShared<Factory>(supported, manager);
    Fixture() {
        // A real ViewFactory pool entry suffices for dequeue's target-size check.
        factory->enqueueViewToPool(nullptr);
        manager.resolve = [this](const auto& name) -> Ref<ViewFactory> {
            return name == supported ? factory : nullptr;
        };
    }
    ~Fixture() { context->clearViewPools(); dispatcher->drain(); }
};

void nullCacheAndAlias() {
    Fixture f;
    CHECK(f.factories->getViewFactory(f.unsupported) == nullptr);
    CHECK(f.factories->getViewFactory(f.unsupported) == nullptr);
    CHECK(f.manager.calls == 2);
    CHECK(f.factories->_viewFactories.empty());
    f.factories->registerViewClassReplacement(f.alias, f.unsupported);
    CHECK(f.factories->getViewFactory(f.alias) == nullptr);
    CHECK(f.factories->_viewFactories.empty());
    f.factories->clearViewPools();
    CHECK(f.context->getViewPoolsStats().empty());
    f.factories->registerViewClassReplacement(f.alias, f.supported);
    CHECK(f.factories->getViewFactory(f.alias) == f.factory);
    CHECK(f.factories->getViewFactory(f.supported) == f.factory);
    CHECK(f.context->getViewPoolsStats().at(f.supported) == 1);
    f.factories->_viewFactories[f.unsupported] = nullptr;
    CHECK(f.factories->copyViewFactories().size() == 2);
    CHECK(f.context->getViewPoolsStats().size() == 1);
    f.factories->clearViewPools();
    CHECK(f.factory->getPoolSize() == 0);
}

void reentrantCacheWinner(bool replacement) {
    Fixture f;
    if (replacement) f.factories->registerViewClassReplacement(f.alias, f.supported);
    auto requested = replacement ? f.alias : f.supported;
    bool nested = false;
    f.manager.resolve = [&](const auto& name) -> Ref<ViewFactory> {
        CHECK(name == f.supported);
        if (nested) return f.factory;
        nested = true;
        CHECK(f.factories->getViewFactory(f.supported) == f.factory);
        return nullptr; // A concurrent/reentrant success must beat this failure.
    };
    CHECK(f.factories->getViewFactory(requested) == f.factory);
    CHECK(f.factories->getViewFactory(f.supported) == f.factory);
    CHECK(f.manager.calls == 2);
}

void unsupportedPreloadDrains() {
    Fixture f;
    f.preloader->pausePreload();
    f.preloader->startPreload(f.unsupported, 10);
    f.preloader->startPreload(f.supported, 1);
    CHECK(f.dispatcher->tasks.empty());
    f.preloader->resumePreload();
    f.dispatcher->drain();
    CHECK(f.manager.calls == 2);
    CHECK(f.preloader->_preloadCountByClassName.empty());
    CHECK(!f.preloader->_preloading);
    CHECK(f.factories->getViewFactory(f.supported) == f.factory);
}

void pauseDuringResolution() {
    Fixture f;
    f.manager.resolve = [&](const auto&) -> Ref<ViewFactory> {
        f.preloader->pausePreload();
        return nullptr;
    };
    f.preloader->startPreload(f.unsupported, 1);
    f.dispatcher->drain();
    CHECK(f.preloader->_paused);
    CHECK(!f.preloader->_preloading);
    CHECK(f.preloader->_preloadCountByClassName.size() == 1);
    f.manager.resolve = [](const auto&) -> Ref<ViewFactory> { return nullptr; };
    f.preloader->resumePreload();
    f.dispatcher->drain();
    CHECK(f.preloader->_preloadCountByClassName.empty());
    CHECK(!f.preloader->_preloading);
}

void stopAndRestartDuringResolution() {
    Fixture f;
    f.manager.resolve = [&](const auto&) -> Ref<ViewFactory> {
        if (f.manager.calls == 1) {
            f.preloader->stopPreload();
            f.preloader->startPreload(f.unsupported, 1);
        }
        return nullptr;
    };
    f.preloader->startPreload(f.unsupported, 7);
    f.dispatcher->drain();
    CHECK(f.manager.calls == 2); // The fresh request must get its own resolution.
    CHECK(f.preloader->_preloadCountByClassName.empty());
    CHECK(!f.preloader->_preloading);
}

int main() {
    nullCacheAndAlias();
    reentrantCacheWinner(false);
    reentrantCacheWinner(true);
    unsupportedPreloadDrains();
    pauseDuringResolution();
    stopAndRestartDuringResolution();
    std::cout << "PASS 6 real-header runtime nullable-factory regressions\n";
}
