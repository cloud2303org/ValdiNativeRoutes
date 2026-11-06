// app_pages/src/cpp/Cpp.d.ts in C++. The factory registered at the bottom gives the runtime the module the first time
// JS reads `app_pages/src/cpp/Cpp`; JS then calls it directly, on the JS thread.
#include "valdi_modules/app_pages/app_pages.hpp"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace snap::valdi_modules::app_pages {
namespace {

#define CPP_STRINGIFY_(x) #x
#define CPP_STRINGIFY(x) CPP_STRINGIFY_(x)

/** SHA-256 (FIPS 180-4) of `bytes`. */
std::array<uint8_t, 32> sha256Digest(std::string_view bytes) {
    static constexpr uint32_t k[64] = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    };
    uint32_t h[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
    auto rotr = [](uint32_t x, int n) { return (x >> n) | (x << (32 - n)); };

    // The message, a 1 bit, zeros, and its length in bits (big endian), padded to whole 64-byte blocks.
    std::string message(bytes);
    const uint64_t bitLength = static_cast<uint64_t>(bytes.size()) * 8;
    message.push_back(static_cast<char>(0x80));
    while (message.size() % 64 != 56) message.push_back(0);
    for (int i = 7; i >= 0; i--) message.push_back(static_cast<char>((bitLength >> (i * 8)) & 0xff));

    for (size_t block = 0; block < message.size(); block += 64) {
        uint32_t w[64];
        for (int i = 0; i < 16; i++) {
            const auto *p = reinterpret_cast<const uint8_t *>(message.data() + block + i * 4);
            w[i] = (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | uint32_t(p[3]);
        }
        for (int i = 16; i < 64; i++) {
            const uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            const uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; i++) {
            const uint32_t t1 = hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i];
            const uint32_t t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
            hh = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        h[0] += a, h[1] += b, h[2] += c, h[3] += d, h[4] += e, h[5] += f, h[6] += g, h[7] += hh;
    }

    std::array<uint8_t, 32> digest{};
    for (int i = 0; i < 32; i++) digest[i] = static_cast<uint8_t>(h[i / 4] >> (24 - (i % 4) * 8));
    return digest;
}

class CppModuleImpl final : public CppModule {
public:
    Valdi::StringBox BUILD_INFO() final {
        std::string info = "clang " __clang_version__;
        info += " · libc++ " CPP_STRINGIFY(_LIBCPP_VERSION);
        info += " · C++" + std::to_string(__cplusplus / 100 % 100);
#if defined(__ANDROID__)
        info += " · Android";
#elif defined(__APPLE__)
        info += " · Apple";
#endif
#if defined(__aarch64__)
        info += " arm64";
#elif defined(__x86_64__)
        info += " x86_64";
#elif defined(__arm__)
        info += " armv7";
#endif
        return Valdi::StringBox::fromString(info);
    }

    Valdi::StringBox sha256(Valdi::StringBox text) final {
        static constexpr char kHex[] = "0123456789abcdef";
        std::string hex;
        for (uint8_t byte : sha256Digest(text.toStringView())) {
            hex.push_back(kHex[byte >> 4]);
            hex.push_back(kHex[byte & 0xf]);
        }
        return Valdi::StringBox::fromString(hex);
    }

    CppStats stats(std::vector<double> values) final {
        if (values.empty()) return CppStats(0, 0, 0, 0);
        double sum = 0;
        for (double value : values) sum += value;
        const auto [min, max] = std::minmax_element(values.begin(), values.end());
        return CppStats(static_cast<double>(values.size()), sum / static_cast<double>(values.size()), *min, *max);
    }
};

class CppModuleFactoryImpl final : public CppModuleFactory {
protected:
    Valdi::Ref<CppModule> onLoadModule() final {
        return Valdi::makeShared<CppModuleImpl>();
    }
};

// Runs when the runtime binary loads, before any runtime exists; RuntimeManager collects it at startup.
auto kRegisterCppModule = Valdi::RegisterModuleFactory::registerTyped<CppModuleFactoryImpl>();

} // namespace
} // namespace snap::valdi_modules::app_pages
