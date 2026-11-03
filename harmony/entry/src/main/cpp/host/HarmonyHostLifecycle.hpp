#pragma once

#include <exception>
#include <stdexcept>
#include <string>
#include <utility>

namespace ValdiHarmony {

// Remove public admission before any teardown step can invoke a shell callback.
// The returned owner survives reentrant destruction and shared-dispatcher drains.
template<typename Hosts, typename Id>
auto takeHostForDestruction(Hosts& hosts, Id id) {
    auto entry = hosts.extract(id);
    if (entry.empty()) {
        throw std::invalid_argument("Unknown or destroyed Valdi Harmony handle");
    }
    return std::move(entry.mapped());
}

// Cleanup phases must all run, even after an earlier native/UI operation fails.
// Report the collected failures only after ownership has reached a safe state.
class TeardownErrors {
public:
    template<typename Action>
    void run(Action&& action) {
        try {
            std::forward<Action>(action)();
        } catch (const std::exception& error) {
            append(error.what());
        } catch (...) {
            append("Unknown exception during Valdi Harmony teardown");
        }
    }

    void append(const std::string& message) {
        if (!_message.empty()) _message += "; ";
        _message += message;
    }

    const std::string& message() const { return _message; }

    void throwIfAny() const {
        if (!_message.empty()) throw std::runtime_error(_message);
    }

private:
    std::string _message;
};

} // namespace ValdiHarmony
