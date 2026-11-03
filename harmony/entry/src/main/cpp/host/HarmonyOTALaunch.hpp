#pragma once

#include <atomic>
#include <cstdint>
#include <functional>

namespace ValdiHarmony {

// A native-only weak lifetime token for one RuntimeHost. UI owns generations and
// admission; the runtime logger may mark a failure from any thread.
class HarmonyOTALaunch final {
public:
    uint64_t begin() {
        _closing = false;
        _confirmed = false;
        _failed.store(false, std::memory_order_release);
        return ++_generation;
    }
    void close() { _closing = true; ++_generation; }
    void fail() { _failed.store(true, std::memory_order_release); }
    void accept(uint64_t generation, const std::function<void()>& confirm) {
        if (_closing || _generation != generation || _confirmed ||
            _failed.load(std::memory_order_acquire)) return;
        _confirmed = true;
        confirm();
    }
private:
    uint64_t _generation = 0;
    bool _closing = true, _confirmed = false;
    std::atomic<bool> _failed{false};
};
} // namespace ValdiHarmony
