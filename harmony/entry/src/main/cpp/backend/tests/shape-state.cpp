#include "../ShapeState.hpp"

#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>

using namespace Valdi;
using namespace Valdi::Harmony::detail;

struct Recorder final : GeometricPathVisitor {
    std::vector<std::vector<double>> operations;
    void moveTo(double a, double b) override { operations.push_back({1, a, b}); }
    void lineTo(double a, double b) override { operations.push_back({2, a, b}); }
    void quadTo(double a, double b, double c, double d) override { operations.push_back({3, a, b, c, d}); }
    void cubicTo(double a, double b, double c, double d, double e, double f) override {
        operations.push_back({4, a, b, c, d, e, f});
    }
    void roundRectTo(double a, double b, double c, double d, double e, double f) override {
        operations.push_back({5, a, b, c, d, e, f});
    }
    void arcTo(double a, double b, double c, double d, double e, double f) override {
        operations.push_back({6, a, b, c, d, e, f});
    }
    void close() override { operations.push_back({7}); }
};

static bool near(double a, double b) { return std::abs(a - b) < 1e-9; }

int main(int argc, char** argv) {
    ShapeState state;
    assert(state.fill == 0 && state.stroke == 0 && state.width == 1);
    assert(state.cap == ShapeCap::Butt && state.join == ShapeJoin::Miter);
    state.strokeWidth(2.2);
    assert(std::abs(state.width - 2.2f) < 1e-6);
    for (double width : {-1.0, std::numeric_limits<double>::infinity(),
                          std::numeric_limits<double>::quiet_NaN()}) {
        bool rejected = false;
        try { state.strokeWidth(width); } catch (const std::invalid_argument&) { rejected = true; }
        assert(rejected && std::abs(state.width - 2.2f) < 1e-6);
    }
    assert(shapeCap("round") == ShapeCap::Round && shapeCap("square") == ShapeCap::Square);
    assert(shapeJoin("round") == ShapeJoin::Round && shapeJoin("bevel") == ShapeJoin::Bevel);
    for (bool cap : {false, true}) {
        bool rejected = false;
        try {
            if (cap) (void)shapeCap("bad");
            else (void)shapeJoin("bad");
        } catch (const std::invalid_argument&) { rejected = true; }
        assert(rejected);
    }

    // Actual NavigationBar builder bytes. At 28pt this must produce the real
    // three-point chevron; no SVG/icon substitution is involved.
    std::vector<double> chevron {24, 24, 2, 1, 15, 6, 2, 9, 12, 2, 15, 18};
    state.path.assign(chevron.data(), chevron.size() * sizeof(double));
    chevron.assign(chevron.size(), 0); // Input ownership must be independent.
    Recorder recorder;
    assert(state.path.visit(28, 28, recorder));
    assert(recorder.operations.size() == 3);
    assert(near(recorder.operations[0][1], 17.5) && near(recorder.operations[0][2], 7));
    assert(near(recorder.operations[1][1], 10.5) && near(recorder.operations[1][2], 14));
    assert(near(recorder.operations[2][1], 17.5) && near(recorder.operations[2][2], 21));
    const auto version = state.path.version();
    for (auto invalid : {
        std::vector<double>{}, {0, 10, 1}, {10, 10, 1.5}, {10, 10, 1, 1, 5},
        {10, 10, 1, 8}, {10, 10, 1, 2.5, 1, 2},
        {10, 10, 1, 5, 0, 0, -1, 3, 0, 0},
        {10, 10, 1, 6, 0, 0, -1, 0, 1},
        {10, 10, 1, 6, 0, 0, 1, 0, 10000},
        {10, 10, 1, 1, std::numeric_limits<double>::infinity(), 0}}) {
        bool rejected = false;
        try { state.path.assign(invalid.data(), invalid.size() * sizeof(double)); }
        catch (const std::invalid_argument&) { rejected = true; }
        assert(rejected && state.path.version() == version);
    }
    std::vector<double> extent {10, 20, 1, 1, 0, 0, 2, 10, 20};
    for (int mode = 1; mode <= 4; ++mode) {
        extent[2] = mode;
        // Byte buffers need not be aligned like doubles.
        std::vector<uint8_t> unaligned(extent.size() * sizeof(double) + 1);
        std::memcpy(unaligned.data() + 1, extent.data(), unaligned.size() - 1);
        state.path.assign(unaligned.data() + 1, unaligned.size() - 1);
        recorder.operations.clear();
        assert(state.path.visit(40, 40, recorder));
        const auto& start = recorder.operations[0];
        if (mode == 1) assert(start == std::vector<double>({1, 0, 0}));
        if (mode == 2) assert(start == std::vector<double>({1, 10, 0}));
        if (mode == 3) assert(start == std::vector<double>({1, 0, -20}));
        if (mode == 4) assert(start == std::vector<double>({1, 15, 10}));
        bool rejected = false;
        try { state.path.assign(unaligned.data() + 1, unaligned.size() - 2); }
        catch (const std::invalid_argument&) { rejected = true; }
        assert(rejected);
    }
    const double all[] {10, 20, 1, 1, 1, 2, 3, 2, 3, 4, 5,
        4, 1, 2, 3, 4, 5, 6, 7, 5, 1, 2, 3, 4, 1, 2, 6, 5, 6, 2, 0, ShapePath::pi, 7};
    state.path.assign(all, sizeof(all));
    recorder.operations.clear();
    assert(state.path.visit(20, 60, recorder));
    assert(recorder.operations.size() == 7);
    assert(recorder.operations[1] == std::vector<double>({3, 4, 9, 8, 15}));
    assert(recorder.operations[2] == std::vector<double>({4, 2, 6, 6, 12, 10, 18}));
    assert(recorder.operations[4] == std::vector<double>({5, 2, 6, 6, 12, 2, 6}));
    assert(recorder.operations[5] == std::vector<double>({6, 10, 18, 4, 6, 0, ShapePath::pi}));
    // Optional fixture generated by importing the actual pinned TS builder.
    if (argc > 1) {
        std::ifstream input(argv[1], std::ios::binary);
        const std::vector<char> bytes((std::istreambuf_iterator<char>(input)), {});
        assert(input.is_open() && !input.bad() && !bytes.empty());
        state.path.assign(bytes.data(), bytes.size());
        recorder.operations.clear();
        assert(state.path.visit(24, 24, recorder));
        assert(recorder.operations == std::vector<std::vector<double>>({{1, 15, 6}, {2, 9, 12}, {2, 15, 18}}));
    }
    state.path.clear();
    recorder.operations.clear();
    assert(state.path.empty() && state.path.visit(10, 10, recorder) && recorder.operations.empty());
    std::cout << "shape state / actual upstream GeometricPath parser: passed\n";
}
