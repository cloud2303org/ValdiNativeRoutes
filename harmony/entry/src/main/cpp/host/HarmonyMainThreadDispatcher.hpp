#pragma once

#include "valdi_core/cpp/Interfaces/IMainThreadDispatcher.hpp"

#include <functional>
#include <memory>
#include <uv.h>

namespace ValdiHarmony {

// Construct, drain and close on the ArkTS UI thread. Keep open until every
// RuntimeManager has completed fullTeardown on a worker thread.
class HarmonyMainThreadDispatcher final : public Valdi::IMainThreadDispatcher {
public:
    explicit HarmonyMainThreadDispatcher(uv_loop_t* loop);
    ~HarmonyMainThreadDispatcher() override;

    void dispatch(Valdi::DispatchFunction* function, bool sync) override;
    bool isUIThread() const;
    void drain();
    void keepAlive(bool enabled);
    void close(std::function<void()> completion);

private:
    struct State;
    std::shared_ptr<State> _state;
};

void logNativeError(const char* message);

} // namespace ValdiHarmony
