#include "HarmonyDevelopmentHostLease.hpp"

#include <stdexcept>
#include <string>

bool peerCanAdmit() {
#if VALDI_HARMONY_FULL_DEVELOPMENT
    try {
        ValdiHarmony::HarmonyDevelopmentHostLease probe;
        return true;
    } catch (const std::runtime_error& error) {
        if (std::string(error.what()).find("only one live or destroying runtime host") == std::string::npos) throw;
        return false;
    }
#else
    return true;
#endif
}
