#include "../HarmonyHostLifecycle.hpp"
#include "../HarmonyPendingAppUIRequest.hpp"
#include "valdi/runtime/Context/ContextEntry.hpp"
#include "valdi/runtime/Utils/Disposable.hpp"
#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_core/cpp/Utils/ExceptionTracker.hpp"
#include "valdi_core/cpp/Utils/Promise.hpp"

#include <cassert>
#include <iostream>
#include <map>
#include <memory>
#include <thread>
#include <vector>

using namespace ValdiHarmony;
namespace Pages = snap::valdi_modules::app_pages;

namespace {

void destructionOwnership() {
    std::map<int, std::unique_ptr<int>> hosts;
    hosts.emplace(1, std::make_unique<int>(1));
    hosts.emplace(2, std::make_unique<int>(2));
    auto outer = takeHostForDestruction(hosts, 1);
    TeardownErrors errors;
    std::vector<int> phases;
    // Model a shared dispatcher drain in A's unmount. B's observer reenters A,
    // then destroys B. Neither operation can steal or erase A's claimed owner.
    errors.run([&] {
        phases.push_back(1);
        bool duplicateRejected = false;
        try {
            auto duplicate = takeHostForDestruction(hosts, 1);
        } catch (const std::invalid_argument&) {
            duplicateRejected = true;
        }
        assert(duplicateRejected);
        auto nested = takeHostForDestruction(hosts, 2);
        assert(*nested == 2 && *outer == 1 && hosts.empty());
        phases.push_back(2);
        throw std::runtime_error("native unmount failed");
    });
    errors.run([&] { phases.push_back(3); }); // suspension still runs
    errors.run([&] {
        phases.push_back(4);
        throw std::runtime_error("transport shutdown failed");
    });
    errors.run([&] { phases.push_back(5); }); // worker handoff still runs
    assert((phases == std::vector<int>{1, 2, 3, 4, 5}));
    assert(errors.message() == "native unmount failed; transport shutdown failed");
    bool reported = false;
    try {
        errors.throwIfAny();
    } catch (const std::runtime_error&) {
        reported = true;
    }
    assert(reported && *outer == 1);
}

// Exercise the real pinned Context/RetainedContext/DisposableGroup mechanism.
// The probe stands for a context-attached stashed JS reference, not a JS engine.
struct StashedReference final : Valdi::Disposable {
    bool disposed = false;
    std::thread::id disposedOn;
    bool dispose(std::unique_lock<Valdi::Mutex>&) override {
        disposed = true;
        disposedOn = std::this_thread::get_id();
        return true;
    }
};

// The production Future marshaller owns a ResolvablePromise through settlement.
// Use its actual bridge and the canonical generated models, not a callback ABI.
template<typename T>
Valdi::Ref<Valdi::Promise> nativePromise(const Valdi::Future<T>& future) {
    Valdi::SimpleExceptionTracker error;
    Valdi::Value value;
    Valdi::CppMarshaller::marshall(error, future, value);
    assert(error);
    auto promise = Valdi::castOrNull<Valdi::Promise>(value.getValdiObject());
    assert(promise != nullptr);
    return promise;
}

template<typename T>
void pendingResult(const HarmonyNativeAppUIResult& completion) {
    const auto jsThread = std::this_thread::get_id();
    StashedReference reference;
    auto context = Valdi::makeShared<Valdi::Context>(1, Valdi::Ref<Valdi::ILogger>());
    context->postInit();
    assert(context->insertDisposable(&reference));
    size_t delivered = 0;
    bool handlerDestroyed = false;
    Valdi::Ref<Valdi::Promise> promise;
    std::map<int, HarmonyPendingAppUIRequest> pending;
    {
        Valdi::ContextEntry entry(context);
        Valdi::TypedPromise<T> source;
        promise = nativePromise(source.getFuture());
        pending.emplace(1, HarmonyPendingAppUIRequest(std::move(source)));
        assert(pending.at(1).owner.context == context);
    } // The pending request now owns the only TypedPromise and Context pin.
    {
        auto lifetime = std::shared_ptr<int>(new int(0), [&](int* value) {
            assert(!reference.disposed);
            assert(std::this_thread::get_id() == jsThread);
            handlerDestroyed = true;
            delete value;
        });
        promise->onComplete([&, lifetime = std::move(lifetime)](const Valdi::Result<Valdi::Value>& result) {
            assert(!reference.disposed);
            assert(std::this_thread::get_id() == jsThread);
            assert(pending.empty()); // Reentrant handlers cannot find this request.
            ++delivered;
            if (const auto* error = std::get_if<HarmonyNativeAppUIError>(&completion)) {
                assert(!result && result.error().toString() == error->message);
            } else {
                assert(result);
                if constexpr (std::is_void_v<T>) {
                    assert(result.value().isUndefined());
                } else {
                    T reply;
                    Valdi::SimpleExceptionTracker error;
                    Valdi::CppMarshaller::unmarshall(error, result.value(), reply);
                    assert(error);
                    if constexpr (std::is_same_v<T, Pages::ModalReply>) {
                        const auto& expected = std::get<HarmonyNativeModalReply>(completion);
                        assert(reply.getConfirm() == expected.confirm);
                        assert(reply.getCancel() == expected.cancel);
                        assert(reply.getContent().toStringView() == expected.content);
                    } else {
                        const auto& expected = std::get<HarmonyNativePresentationReply>(completion);
                        assert(reply.getConfirm() == expected.confirm);
                        assert(reply.getCancel() == expected.cancel);
                        assert(reply.getValue().toStringView() == expected.value);
                        assert(reply.getIndex() == expected.index);
                    }
                }
            }
        });
    }
    assert(delivered == 0 && !handlerDestroyed);
    // A reset/pop destroys the page before its shell frame acknowledgement.
    std::thread ui([context, jsThread] {
        assert(std::this_thread::get_id() != jsThread);
        context->onDestroy();
    });
    ui.join();
    assert(context->isDestroyed() && !reference.disposed);
    auto deliver = [&] {
        auto found = pending.find(1);
        if (found == pending.end()) return;
        auto request = std::move(found->second);
        pending.erase(found); // Production removes admission before delivery.
        request.finish(completion);
        assert(delivered == 1 && !reference.disposed);
        assert(handlerDestroyed); // Promise callbacks release while the pin lives.
        assert(pending.find(1) == pending.end()); // Late/duplicate reply is inert.
    };
    deliver(); // Request/TypedPromise destruction releases the final pin here.
    assert(reference.disposed && reference.disposedOn == jsThread);
    deliver();
    assert(delivered == 1);
}

} // namespace

int main() {
    destructionOwnership();
    pendingResult<void>(std::monostate{});
    pendingResult<Pages::ModalReply>(HarmonyNativeModalReply{true, false, "edited"});
    pendingResult<Pages::ModalReply>(HarmonyNativeModalReply{false, true, ""});
    pendingResult<Pages::PresentationReply>(HarmonyNativePresentationReply{true, false, "selected", 2});
    pendingResult<Pages::PresentationReply>(HarmonyNativePresentationReply{false, true, "", -1});
    const HarmonyNativeAppUIResult closed = HarmonyNativeAppUIError{"E_APP_UI_CLOSED:host was destroyed"};
    pendingResult<void>(closed);
    pendingResult<Pages::ModalReply>(closed);
    pendingResult<Pages::PresentationReply>(closed);
    std::cout << "PASS: reentrant ownership and teardown error continuation\n"
              << "PASS: 8 typed Future/ResolvablePromise cases: void, modal/presentation success/cancel, shutdown errors\n"
              << "PASS: map erased before settlement, duplicate reply inert, JS-thread handler destruction and Context disposal\n";
}
