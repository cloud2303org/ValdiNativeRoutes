#pragma once

#include <utility>

namespace ValdiHarmony {

// SDK out-pointers may be owning even on failure. Default construct before
// passing &value; destruct in reverse dependency order, including every error.
template<typename T, auto Release>
struct ImageNativeOwner {
    T* value = nullptr;
    ImageNativeOwner() = default;
    explicit ImageNativeOwner(T* pointer) : value(pointer) {}
    ~ImageNativeOwner() { reset(); }
    ImageNativeOwner(const ImageNativeOwner&) = delete;
    ImageNativeOwner& operator=(const ImageNativeOwner&) = delete;
    ImageNativeOwner(ImageNativeOwner&& other) noexcept : value(other.release()) {}
    ImageNativeOwner& operator=(ImageNativeOwner&& other) noexcept {
        if (this != &other) { reset(); value = other.release(); }
        return *this;
    }
    T* release() { return std::exchange(value, nullptr); }
    void reset() { if (auto* pointer = release()) Release(pointer); }
};

} // namespace ValdiHarmony
