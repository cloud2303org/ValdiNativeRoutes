#include "../HarmonyImageFilterGraph.hpp"
#include "../HarmonyImageNativeOwner.hpp"
#include "../HarmonyImageRequest.hpp"

#include <cassert>
#include <iostream>
#include <limits>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace {

using namespace ValdiHarmony;

void matrixAndSigma() {
    HarmonyImageFilterSpec identity;
    assert(identity.valid() && identity.isIdentity() && !identity.hasMatrix());
    auto invert = identity;
    for (size_t row = 0; row < 3; ++row) {
        invert.matrix[row * 5 + row] = -1;
        invert.matrix[row * 5 + 4] = 1;
    }
    invert.matrix[19] = 0.25f; // alpha bias has the same normalized convention
    auto drawing = invert.drawingMatrix();
    assert(drawing[4] == 1 && drawing[9] == 1 && drawing[14] == 1);
    assert(drawing[19] == 0.25f && drawing[0] == -1 && drawing[18] == 1);
    assert(invert.matrix[4] == 1); // forwarding never mutates the snapshot
    assert(!invert.isIdentity() && invert.hasMatrix());
    for (size_t i = 0; i < 20; ++i) {
        auto bad = identity;
        bad.matrix[i] = std::numeric_limits<float>::quiet_NaN();
        assert(!bad.valid());
        bad.matrix[i] = std::numeric_limits<float>::infinity();
        assert(!bad.valid());
        bad.matrix[i] = 1000001;
        assert(!bad.valid());
    }
    for (float radius : {-1.0f, 128.01f, std::numeric_limits<float>::infinity(),
                         std::numeric_limits<float>::quiet_NaN()}) {
        auto bad = identity;
        bad.sigma = radius;
        assert(!bad.valid());
    }
    identity.sigma = 128;
    assert(identity.valid() && !identity.isIdentity());
    identity.sigma = -0.0f;
    assert(identity.valid() && identity.isIdentity());
}

// Normalized affine-matrix contract only: this is a mathematical oracle for
// the production forwarding seam, not a substitute for native pixel rendering.
void normalizedMatrixRegression(std::string_view name) {
    HarmonyImageFilterSpec spec;
    const std::array<float, 4> input{0.2f, 0.3f, 0.4f, 0.5f};
    std::array<float, 4> expected{};
    if (name == "passthrough") {
        for (size_t i = 0; i < spec.matrix.size(); ++i) {
            spec.matrix[i] = (float(i) - 9.0f) / 16.0f;
        }
        assert(spec.drawingMatrix() == spec.matrix); // all 20 entries, unchanged
        return;
    } else if (name == "invert") {
        for (size_t row = 0; row < 3; ++row) {
            spec.matrix[row * 5 + row] = -1;
            spec.matrix[row * 5 + 4] = 1;
        }
        expected = {0.8f, 0.7f, 0.6f, 0.5f};
    } else if (name == "fractional") {
        spec.matrix[4] = 0.25f;
        spec.matrix[9] = -0.125f;
        spec.matrix[14] = 0.0625f;
        expected = {0.45f, 0.175f, 0.4625f, 0.5f};
    } else {
        assert(name == "alpha");
        spec.matrix[18] = 0.5f;
        spec.matrix[19] = 0.125f;
        expected = {0.2f, 0.3f, 0.4f, 0.375f};
    }
    const auto matrix = spec.drawingMatrix();
    for (size_t row = 0; row < 4; ++row) {
        float actual = matrix[row * 5 + 4];
        for (size_t column = 0; column < 4; ++column) {
            actual += matrix[row * 5 + column] * input[column];
        }
        assert(std::abs(actual - expected[row]) < 0.000001f);
    }
}

void combinedWorkingSet() {
    using namespace ImageDecodePolicy;
    using namespace ImageFilterPolicy;
    HarmonyImageFilterSpec filter;
    assert(admitsDecode(1000, 640, 480, {160, 120}, filter));
    assert(!admitsDecode(kMaxEncodedBytes + 1, 1, 1, {1, 1}, filter));
    assert(!admitsDecode(1, UINT32_MAX, UINT32_MAX, {1, 1}, filter));
    // Even tiny preferred output cannot hide a too-large intrinsic workspace.
    assert(!admitsDecode(1, 4096, 4096, {1, 1}, filter));
    filter.sigma = 128;
    assert(admitsDecode(1000, 640, 480, {160, 120}, filter));
    const auto small = surfaceBytes(640, 480);
    auto bytes = renderWorkingBytes(640, 480, small, small, 2000, filter);
    assert(bytes && *bytes == 2000 + 3 * small + 3 * surfaceBytes(1408, 1248));
    // Each individual surface is under 64 MiB, but their combined peak is not.
    const auto large = surfaceBytes(3000, 3000);
    assert(large < kMaxDecodedBytes);
    assert(!renderWorkingBytes(3000, 3000, large, large, 0, filter));
    assert(!renderWorkingBytes(1, 1, UINT64_MAX, 4, 0, filter));
    assert(!renderWorkingBytes(1, 1, 4, UINT64_MAX, 0, filter));
    assert(!renderWorkingBytes(1, 1, 4, 4, UINT64_MAX, filter));
    assert(!renderWorkingBytes(UINT32_MAX, UINT32_MAX, 4, 4, 0, filter));
    filter.sigma = 0;
    filter.matrix[4] = 1;
    assert(renderWorkingBytes(640, 480, small, small, 2000, filter) ==
           2000 + 4 * small);
    // Check both exact limit and the first byte above it, using actual allocation
    // sizes rather than trusting a compact width*height*4 estimate.
    filter = {};
    assert(renderWorkingBytes(1, 1, kMaxDecodedBytes, 4, 2 * kMaxEncodedBytes, filter) ==
           kMaxWorkingBytes);
    assert(!renderWorkingBytes(1, 1, kMaxDecodedBytes, 4, 2 * kMaxEncodedBytes + 1, filter));
    assert(surfaceBytes(3, 4) == 1024);
}

struct Trace {
    std::vector<std::string> events;
    int live = 0;
    int fail = 0;
    bool canceled = false;
};

struct Handle { Trace* trace; std::string name; };
void release(Handle* handle) {
    handle->trace->events.push_back("release " + handle->name);
    --handle->trace->live;
    delete handle;
}
using Owner = ImageNativeOwner<Handle, release>;

// Fault injection around the actual production graph template. This is an
// ownership/order test; it deliberately does not pretend to rasterize SDK pixels.
struct RecordingDrawing {
    using ColorOwner = Owner;
    using FilterOwner = Owner;
    Trace& trace;
    Handle* matrix = nullptr;
    Handle* blur = nullptr;
    float expectedSigma = 7.25f;
    std::function<void()> duringDraw;

    Owner allocate(const char* name, int stage) {
        trace.events.emplace_back(name);
        if (trace.fail == stage) return {};
        ++trace.live;
        return Owner(new Handle{&trace, name});
    }
    ColorOwner createColorMatrix(const std::array<float, 20>& matrixValues) {
        assert(matrixValues[4] == 1 && matrixValues[19] == 0.5f);
        return allocate("color", 1);
    }
    FilterOwner createMatrixNode(Handle* color) {
        assert(color && color->name == "color");
        auto result = allocate("matrix", 2);
        matrix = result.value;
        return result;
    }
    FilterOwner createClampedCroppedBlur(float sigma, Handle* input) {
        assert(sigma == expectedSigma); // no density/downsample/radius conversion
        assert(input == matrix);
        auto result = allocate("clamp+crop blur", 3);
        blur = result.value;
        return result;
    }
    bool draw(Handle* input) {
        assert(input == (blur ? blur : matrix));
        trace.events.emplace_back("draw");
        if (duringDraw) duringDraw();
        return trace.fail != 4;
    }
};

HarmonyImageFilterSpec composedFilter() {
    HarmonyImageFilterSpec result;
    result.matrix[4] = 1;
    result.matrix[19] = 0.5;
    result.sigma = 7.25f;
    return result;
}

void graphOrderAndCleanup() {
    Trace trace;
    RecordingDrawing api{trace, nullptr, nullptr, 7.25f, {}};
    const auto status = renderHarmonyImageFilterGraph(api, composedFilter(), [] { return false; });
    assert(status == ImageFilterRenderStatus::Success && trace.live == 0);
    assert((trace.events == std::vector<std::string>{
        "color", "matrix", "clamp+crop blur", "draw",
        "release clamp+crop blur", "release matrix", "release color"}));

    for (int stage = 1; stage <= 4; ++stage) {
        Trace failed;
        failed.fail = stage;
        RecordingDrawing failing{failed, nullptr, nullptr, 7.25f, {}};
        auto result = renderHarmonyImageFilterGraph(failing, composedFilter(), [] { return false; });
        assert(result == static_cast<ImageFilterRenderStatus>(stage + 1));
        assert(failed.live == 0);
    }
    Trace blurOnly;
    RecordingDrawing blurApi{blurOnly, nullptr, nullptr, 7.25f, {}};
    auto spec = HarmonyImageFilterSpec{};
    spec.sigma = 7.25f;
    assert(renderHarmonyImageFilterGraph(blurApi, spec, [] { return false; }) ==
           ImageFilterRenderStatus::Success);
    assert((blurOnly.events == std::vector<std::string>{
        "clamp+crop blur", "draw", "release clamp+crop blur"}));
    Trace matrixOnly;
    RecordingDrawing matrixApi{matrixOnly, nullptr, nullptr, 7.25f, {}};
    spec = composedFilter();
    spec.sigma = 0;
    assert(renderHarmonyImageFilterGraph(matrixApi, spec, [] { return false; }) ==
           ImageFilterRenderStatus::Success);
    assert((matrixOnly.events == std::vector<std::string>{
        "color", "matrix", "draw", "release matrix", "release color"}));
}

void cancelAtEveryGraphBoundary() {
    for (int cancelAt = 1; cancelAt <= 4; ++cancelAt) {
        Trace trace;
        RecordingDrawing api{trace, nullptr, nullptr, 7.25f, {}};
        int boundary = 0;
        const auto status = renderHarmonyImageFilterGraph(api, composedFilter(),
            [&] { return ++boundary == cancelAt; });
        assert(status == ImageFilterRenderStatus::Canceled);
        assert(trace.live == 0);
        assert(trace.events.empty() || cancelAt != 1);
    }
}

void canceledFilterNeverDeliversAndReleasesOutput() {
    int deliveries = 0;
    auto request = std::make_shared<HarmonyImageRequest<std::shared_ptr<int>>>(
        [&](const auto&) { ++deliveries; });
    assert(request->claimDownload());
    Trace trace;
    RecordingDrawing api{trace, nullptr, nullptr, 7.25f, [&] { request->cancel(); }};
    auto output = std::make_shared<int>(1);
    auto source = std::make_shared<int>(17);
    std::weak_ptr<int> staleOutput = output;
    const auto status = renderHarmonyImageFilterGraph(api, composedFilter(),
        [&] { return request->wasCanceled(); });
    assert(status == ImageFilterRenderStatus::Canceled && trace.live == 0);
    request->complete(output); // late worker result is suppressed by the real gate
    output.reset();
    assert(staleOutput.expired() && deliveries == 0 && *source == 17);
}

void sdkOutPointerAndMoveOwnership() {
    Trace trace;
    {
        Owner out;
        // An SDK may write an owning pointer and then return an error.
        out.value = new Handle{&trace, "out on error"};
        ++trace.live;
    }
    assert(trace.live == 0);
    {
        Owner first(new Handle{&trace, "first"});
        Owner second(new Handle{&trace, "second"});
        trace.live += 2;
        second = std::move(first);
        assert(!first.value && second.value && trace.live == 1);
        second.reset();
        second.reset();
        assert(trace.live == 0);
        Owner third(new Handle{&trace, "transferred"});
        ++trace.live;
        auto* raw = third.release();
        assert(!third.value);
        release(raw);
    }
    assert(trace.live == 0);
}

} // namespace

int main(int argc, char** argv) {
    if (argc == 2) {
        normalizedMatrixRegression(argv[1]);
        std::cout << "Normalized matrix regression passed: " << argv[1] << '\n';
        return 0;
    }
    matrixAndSigma();
    for (auto name : {"passthrough", "invert", "fractional", "alpha"}) {
        normalizedMatrixRegression(name);
    }
    combinedWorkingSet();
    graphOrderAndCleanup();
    cancelAtEveryGraphBoundary();
    canceledFilterNeverDeliversAndReleasesOutput();
    sdkOutPointerAndMoveOwnership();
    std::cout << "Harmony image filter math/policy/production graph/ownership: 7 groups passed\n";
}
