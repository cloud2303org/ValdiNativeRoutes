#pragma once

#include <cstdint>
#include <optional>

namespace Valdi::Harmony::detail {

// One decode notification per installed asset. Replacing a callback on a
// rendered image must not recursively replay decode on every inline TS lambda.
// A callback arriving after the asset may still receive its pending notice.
struct ImageDecodedState {
    struct Ticket {
        uint64_t asset, callback, lifecycle;
        bool operator==(const Ticket&) const = default;
    };
    uint64_t asset = 0, callback = 0, lifecycle = 0;
    uint64_t delivered = 0;
    bool loaded = false, listening = false;
    std::optional<Ticket> queued;

    void setAsset(bool present) { ++asset; loaded = present; queued.reset(); }
    void setCallback(bool present) { ++callback; listening = present; queued.reset(); }
    void detach() { ++lifecycle; queued.reset(); }
    std::optional<Ticket> schedule() {
        if (!loaded || !listening || delivered == asset) return std::nullopt;
        Ticket ticket {asset, callback, lifecycle};
        if (queued == ticket) return std::nullopt;
        queued = ticket;
        return ticket;
    }
    bool consume(Ticket ticket) {
        if (queued != ticket || ticket != Ticket {asset, callback, lifecycle} ||
            !loaded || !listening || delivered == asset) return false;
        // Consume before JS: onImageDecoded may set state, replace the asset,
        // reset the callback, remove the node or dispose its entire context.
        queued.reset();
        delivered = asset;
        return true;
    }
};

} // namespace Valdi::Harmony::detail
