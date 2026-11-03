#pragma once

#include "HarmonyNativeRouteSurface.hpp"
#include "valdi_core/cpp/Utils/Value.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"
#include <atomic>
#include <map>
#include <string>

namespace ValdiHarmony {

// UI publishes permission; JS only reads atomics. Epoch invalidates already
// queued modal work/replies across cover, background, terminal and reentry.
struct HarmonyNativeRouteIdentity {
    std::atomic<uint64_t> epoch{1};
    std::atomic<bool> eligible{false};
    std::atomic<bool> retired{false};
    void setEligible(bool value) {
        if (eligible.exchange(value) != value) ++epoch;
    }
    void retire() { retired = true; setEligible(false); ++epoch; }
    bool accepts(uint64_t generation) const {
        return !retired && eligible && epoch == generation;
    }
};

using HarmonyNativeAppUI = std::function<void(std::weak_ptr<HarmonyNativeRouteIdentity>, uint64_t)>;
using HarmonyNativeAppUIProvider =
    std::function<Valdi::Ref<snap::valdi_modules::app_pages::AppUIHost>()>;
using HarmonyNativeAsync = std::function<void(std::function<void()>)>;

// Constructed by RuntimeHost using its JS queue and weak existing AppUI owner.
// No page/runtime/global singleton, and no UI-thread access to AppUI pending.
HarmonyNativeAppUI makeHarmonyNativeAppUI(HarmonyNativeAsync onJS, HarmonyNativeAppUIProvider provider);

struct HarmonyNativeScreenActions {
    std::function<void(const std::string&)> finishFruit;
    std::function<void()> back, pushDetail, switchWheels, modal;
};

class HarmonyNativeScreens {
public:
    using Factory = std::function<void(const std::shared_ptr<HarmonyNativeRouteSurface>&,
                                       const std::string&, const HarmonyNativeScreenActions&)>;
    HarmonyNativeScreens();
    bool contains(const std::string& name) const;
    void build(const std::string& name, const std::shared_ptr<HarmonyNativeRouteSurface>& surface,
               const std::string& title, const HarmonyNativeScreenActions& actions) const;
private:
    // Owned by one navigator, keyed by RouteEntry.nativeName.
    std::map<std::string, Factory> _factories;
};

} // namespace ValdiHarmony
