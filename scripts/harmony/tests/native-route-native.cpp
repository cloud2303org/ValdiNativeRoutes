#include "HarmonyNativeScreens.hpp"
#include "native-route-boundary.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include <iostream>
#include <thread>

using namespace ValdiHarmony;
namespace Routes = snap::valdi_modules::app_pages;

// Real generated interface/Futures/DTOs; only the UI presenter is substituted.
struct TypedUI final : Routes::AppUIHost {
    bool* onJS;
    int modals = 0, toasts = 0;
    std::string toast;
    Valdi::TypedPromise<Routes::ModalReply> reply;
    explicit TypedUI(bool& queue) : onJS(&queue) {}
    Valdi::Future<Routes::ModalReply> showModal(Routes::ModalRequest request) override {
        assert(*onJS && request.getTitle() == STRING_LITERAL("原生调用") && request.getShowCancel());
        ++modals; reply = {}; return reply.getFuture();
    }
    Valdi::Future<void> showToast(Routes::ToastRequest request) override {
        assert(*onJS && request.getIcon() == STRING_LITERAL("none"));
        ++toasts; toast = request.getTitle().slowToString();
        Valdi::TypedPromise<void> done; done.setValue(); return done.getFuture();
    }
    template<typename T> Valdi::Future<T> unused() { assert(false); return {}; }
    Valdi::Future<Routes::PresentationReply> showActionSheet(Routes::ActionSheetRequest) override { return unused<Routes::PresentationReply>(); }
    Valdi::Future<Routes::PresentationReply> showPicker(Routes::PickerRequest) override { return unused<Routes::PresentationReply>(); }
    Valdi::Future<Routes::PresentationReply> showDatePicker(Routes::DatePickerRequest) override { return unused<Routes::PresentationReply>(); }
    Valdi::Future<Routes::PresentationReply> showBottomSheet(Routes::BottomSheetRequest) override { return unused<Routes::PresentationReply>(); }
    Valdi::Future<Routes::PresentationReply> previewImage(Routes::ImagePreviewRequest) override { return unused<Routes::PresentationReply>(); }
    Valdi::Future<Routes::ScanCodeReply> scanCode() override { return unused<Routes::ScanCodeReply>(); }
    Valdi::Future<Routes::AttachmentSelection> pickAttachments(Valdi::StringBox, double, std::vector<Valdi::StringBox>) override { return unused<Routes::AttachmentSelection>(); }
    Valdi::Future<void> clearAttachmentCache() override { return unused<void>(); }
    Valdi::Future<void> hideToast() override { return unused<void>(); }
    Valdi::Future<void> showLoading(Routes::LoadingRequest) override { return unused<void>(); }
    Valdi::Future<void> hideLoading() override { return unused<void>(); }
};

void surfaceTests() {
    NativeRouteBoundary b;
    HarmonyNativeScreens registry;
    assert(registry.contains("picker") && !registry.contains("unknown"));
    auto root = b.root();
    auto make = [&] {
        return HarmonyNativeRouteSurface::create(b.api, root.get(), root,
            [&](auto task) { b.deferred.push_back(std::move(task)); }, [](auto) { assert(false); });
    };
    root->data = &b;
    try { make(); assert(false); } catch (const std::runtime_error&) {}
    root->data = nullptr;
    auto surface = make();
    HarmonyNativeScreenActions actions;
    int fruit = 0, back = 0, push = 0, tab = 0, modal = 0;
    std::function<void()> onBanana;
    actions.finishFruit = [&](auto value) {
        if (value == "香蕉") { onBanana(); return; }
        assert(value == "苹果"); ++fruit;
    };
    actions.back = [&] { ++back; }; actions.pushDetail = [&] { ++push; };
    actions.switchWheels = [&] { ++tab; }; actions.modal = [&] { ++modal; };
    try { registry.build("unknown", surface, "test", actions); assert(false); }
    catch (const std::runtime_error&) {}
    registry.build("picker", surface, "选择水果", actions);
    assert(root->custom.size() == 2 && root->backendEventData == &b);
    // Invoke the *parent's* measure/layout. A raw-child-only implementation
    // leaves the button at zero measurements, even if it is in the tree.
    surface->setSizePixels(720, 1280);
    ArkUI_LayoutConstraint constraint{1000, 2000};
    b.api.measureNode(root.get(), &constraint);
    b.api.layoutNode(root.get(), 0, 0);
    auto apple = b.named("苹果");
    assert(b.rootMeasures == 1 && b.rootLayouts == 1 && apple->measured == 1 &&
           apple->laidOut == 1 && apple->width == 720 && apple->height == 1280);
    surface->setSizePixels(480, 600);
    constraint = {1000, 2000};
    b.api.measureNode(root.get(), &constraint);
    assert(apple->width == 480 && apple->height == 600 && apple->measured == 2);
    b.click("苹果"); b.click("返回"); b.click("从原生页 push Valdi 详情页");
    b.click("原生调用 switchTab('wheels')"); b.click("原生调用 showModal");
    assert(fruit == 1 && back == 1 && push == 1 && tab == 1 && modal == 1);
    // Retire *inside* the current SDK callback, then simulate its already
    // captured duplicate. Unregister/detach now; userdata/nodes/root live until
    // the current callback unwinds and deferred disposal is safe.
    auto raw = apple->clickData; auto callback = apple->click;
    onBanana = [&] {
        surface->retire();
        ArkUI_NodeEvent stale{raw}; callback(&stale);
        b.drain(); // Reentrant dispatcher drain must not dispose this stack.
        assert(!b.nodes.empty());
    };
    b.click("香蕉");
    assert(fruit == 1 && root->children.empty() && root->custom.size() == 1 && !root->data);
    surface->retire(); surface.reset(); b.drain();
    assert(b.nodes.size() == 1);
    root.reset();
    // Exhaust every native allocation and insertion failure position.
    for (int fail = 1; fail <= 14; ++fail) {
        auto root = b.root(); auto s = HarmonyNativeRouteSurface::create(b.api, root.get(), root,
            [&](auto task) { b.deferred.push_back(std::move(task)); }, {});
        b.failCreate = b.createCount + fail;
        try { registry.build("picker", s, "test", actions); } catch (const std::runtime_error&) {}
        s->retire(); s.reset(); b.drain(); root.reset(); assert(b.nodes.empty());
        b.failCreate = -1;
    }
    for (int fail = 1; fail <= 14; ++fail) {
        auto root = b.root(); auto s = HarmonyNativeRouteSurface::create(b.api, root.get(), root,
            [&](auto task) { b.deferred.push_back(std::move(task)); }, {});
        b.failAdd = b.addCount + fail;
        try { registry.build("picker", s, "test", actions); } catch (const std::runtime_error&) {}
        s->retire(); s.reset(); b.drain(); root.reset(); assert(b.nodes.empty());
        b.failAdd = -1;
    }
}

void typedUITests() {
    std::deque<std::function<void()>> queue;
    bool onJS = false;
    auto host = Valdi::makeShared<TypedUI>(onJS);
    Valdi::Ref<Routes::AppUIHost> interface = host;
    Valdi::Value hostValue; Valdi::SimpleExceptionTracker tracker;
    Valdi::CppMarshaller::marshall(tracker, interface, hostValue); assert(tracker);
    auto invoke = makeHarmonyNativeAppUI(
        [&](auto task) { queue.push_back(std::move(task)); },
        [&] {
            assert(onJS);
            Valdi::Ref<Routes::AppUIHost> out; Valdi::SimpleExceptionTracker tracker;
            Valdi::CppMarshaller::unmarshall(tracker, hostValue, out); assert(tracker); return out;
        });
    auto drain = [&] {
        auto tasks = std::move(queue); queue.clear();
        onJS = true; for (auto& task : tasks) task(); onJS = false;
    };
    auto identity = std::make_shared<HarmonyNativeRouteIdentity>();
    invoke(identity, identity->epoch); drain(); assert(host->modals == 0);
    identity->setEligible(true);
    for (bool confirm : {true, false}) {
        invoke(identity, identity->epoch); assert(!onJS); drain();
        auto before = host->toasts;
        // Complete on a different queue. No typed AppUI request happens there.
        std::thread ui([&] { host->reply.setValue(Routes::ModalReply(confirm, !confirm, {})); });
        ui.join(); assert(host->toasts == before); drain();
        assert(host->toasts == before + 1);
        assert(host->toast == (confirm ? "原生页点了确定" : "原生页点了取消"));
    }
    auto before = host->toasts;
    invoke(identity, identity->epoch); drain();
    identity->setEligible(false); identity->setEligible(true); // cover then uncover
    host->reply.setValue(Routes::ModalReply(true, false, {})); drain();
    assert(host->toasts == before);
    invoke(identity, identity->epoch); identity->setEligible(false); drain();
    identity->setEligible(true);
    invoke(identity, identity->epoch); drain();
    identity->retire(); host->reply.setValue(Routes::ModalReply(true, false, {})); drain();
    assert(host->toasts == before);
    auto reentry = std::make_shared<HarmonyNativeRouteIdentity>(); reentry->setEligible(true);
    invoke(reentry, reentry->epoch); drain();
    host->reply.setError(Valdi::Error("cancel")); drain(); assert(host->toasts == before);
}

int main() {
    surfaceTests(); typedUITests();
    std::cout << "PASS real native controls + parent measure/layout + allocation/insertion failures + "
                 "SDK-stack retirement; real generated AppUI interface/Futures/CppMarshaller + JS queue + "
                 "confirm/cancel + cover/background/retire/reentry reply fences\n";
}
