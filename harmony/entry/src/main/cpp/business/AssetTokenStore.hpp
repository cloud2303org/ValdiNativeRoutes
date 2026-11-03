#pragma once

#include <string>
#include <string_view>

namespace ValdiHarmony {

// Synchronous SDK AssetStore operations. No local file, fallback, plaintext
// persistence, or token cache. The OS scopes this alias to the calling app/user.
class AssetTokenStore final {
public:
    static constexpr std::string_view Alias = "io.valdiroutes.app.session.token.v1";
    static constexpr size_t MaxTokenBytes = 1024;

    bool has();
    std::string read();
    void write(std::string_view token);
    void clear();
};

} // namespace ValdiHarmony
