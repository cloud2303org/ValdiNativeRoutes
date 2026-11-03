#pragma once

#include "HarmonyNativeAppUIPresenter.hpp"
#include "valdi/runtime/Context/Context.hpp"
#include "valdi_core/cpp/Utils/Future.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <functional>
#include <type_traits>

namespace ValdiHarmony {

// JS-only. TypedPromise state retains the official marshalled ResolvablePromise.
// The Context pin protects context-owned JS Promise handlers through page removal.
struct HarmonyPendingAppUIRequest {
    Valdi::RetainedContext owner{Valdi::Ref(Valdi::Context::currentRoot())};
    std::function<void(const HarmonyNativeAppUIResult&)> finish;
    template<typename T>
    explicit HarmonyPendingAppUIRequest(Valdi::TypedPromise<T> promise)
        : finish([promise = std::move(promise)](const HarmonyNativeAppUIResult& result) {
            if (const auto* error = std::get_if<HarmonyNativeAppUIError>(&result)) {
                promise.setError(Valdi::Error(error->message)); return;
            }
            if constexpr (std::is_void_v<T>) {
                if (!std::holds_alternative<std::monostate>(result))
                    promise.setError(Valdi::Error("E_APP_UI_INTERNAL:unexpected native result type"));
                else promise.setValue(); // Official marshaller maps void to undefined.
            } else if constexpr (std::is_same_v<T, snap::valdi_modules::app_pages::ModalReply>) {
                const auto* reply = std::get_if<HarmonyNativeModalReply>(&result);
                if (!reply) promise.setError(Valdi::Error("E_APP_UI_INTERNAL:unexpected native result type"));
                else promise.setValue(T(reply->confirm, reply->cancel, Valdi::StringBox::fromString(reply->content)));
            } else if constexpr (std::is_same_v<T, snap::valdi_modules::app_pages::PresentationReply>) {
                const auto* reply = std::get_if<HarmonyNativePresentationReply>(&result);
                if (!reply) promise.setError(Valdi::Error("E_APP_UI_INTERNAL:unexpected native result type"));
                else promise.setValue(T(reply->confirm, reply->cancel, Valdi::StringBox::fromString(reply->value), reply->index));
            } else if constexpr (std::is_same_v<T, snap::valdi_modules::app_pages::ScanCodeReply>) {
                const auto* reply = std::get_if<HarmonyNativeScanReply>(&result);
                if (!reply) promise.setError(Valdi::Error("E_APP_UI_INTERNAL:unexpected native result type"));
                else promise.setValue(T(Valdi::StringBox::fromString(reply->result), Valdi::StringBox::fromString(reply->scanType)));
            } else if constexpr (std::is_same_v<T, snap::valdi_modules::app_pages::AttachmentSelection>) {
                const auto* reply = std::get_if<HarmonyNativeAttachmentSelection>(&result);
                if (!reply) promise.setError(Valdi::Error("E_APP_UI_INTERNAL:unexpected native result type"));
                else {
                    std::vector<snap::valdi_modules::app_pages::AttachmentAsset> assets;
                    assets.reserve(reply->assets.size());
                    for (const auto& asset : reply->assets) assets.emplace_back(
                        Valdi::StringBox::fromString(asset.id), Valdi::StringBox::fromString(asset.uri),
                        Valdi::StringBox::fromString(asset.name), Valdi::StringBox::fromString(asset.mimeType), asset.size);
                    promise.setValue(T(reply->canceled, std::move(assets)));
                }
            } else static_assert(std::is_void_v<T>, "Unsupported native AppUI completion type");
        }) {}
    // Release the Promise state before its owner pin.
};

} // namespace ValdiHarmony
