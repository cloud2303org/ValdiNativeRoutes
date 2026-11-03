#pragma once

#include "valdi_core/cpp/Utils/GeometricPath.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <string_view>
#include <vector>

namespace Valdi::Harmony::detail {

enum class ShapeCap { Butt, Round, Square };
enum class ShapeJoin { Miter, Round, Bevel };

inline ShapeCap shapeCap(std::string_view value) {
    if (value == "butt") return ShapeCap::Butt;
    if (value == "round") return ShapeCap::Round;
    if (value == "square") return ShapeCap::Square;
    throw std::invalid_argument("shape strokeCap requires butt, round, or square");
}

inline ShapeJoin shapeJoin(std::string_view value) {
    if (value == "miter") return ShapeJoin::Miter;
    if (value == "round") return ShapeJoin::Round;
    if (value == "bevel") return ShapeJoin::Bevel;
    throw std::invalid_argument("shape strokeJoin requires miter, round, or bevel");
}

inline float shapeFloat(double value) {
    if (!std::isfinite(value) || std::abs(value) > std::numeric_limits<float>::max()) {
        throw std::invalid_argument("shape coordinate is not representable by Drawing");
    }
    return static_cast<float>(value);
}

// Upstream's iterator reinterprets Byte* as double*, truncates partial words,
// and casts opcodes to enums. Validate and align the complete buffer first.
// Only the validated owned snapshot ever reaches GeometricPath::visit.
class ShapePath {
public:
    void assign(const void* bytes, size_t size) {
        if (!bytes || size < 3 * sizeof(double) || size % sizeof(double)) {
            throw std::invalid_argument("shape path requires complete Float64 GeometricPath bytes");
        }
        std::vector<double> next(size / sizeof(double));
        std::memcpy(next.data(), bytes, size);
        for (double value : next) {
            if (!std::isfinite(value)) throw std::invalid_argument("shape path contains nonfinite data");
        }
        if (next[0] <= 0 || next[1] <= 0 ||
            (next[2] != 1 && next[2] != 2 && next[2] != 3 && next[2] != 4)) {
            throw std::invalid_argument("shape path has invalid extent or scale mode");
        }
        size_t cursor = 3;
        while (cursor < next.size()) {
            const double op = next[cursor++];
            size_t count = 0;
            if (op == 1 || op == 2) count = 2;
            else if (op == 3) count = 4;
            else if (op == 4 || op == 5) count = 6;
            else if (op == 6) count = 5;
            else if (op != 7) throw std::invalid_argument("shape path contains invalid opcode");
            if (count > next.size() - cursor) throw std::invalid_argument("shape path is truncated");
            if (op == 5 && (next[cursor + 2] < 0 || next[cursor + 3] < 0 ||
                            next[cursor + 4] < 0 || next[cursor + 5] < 0)) {
                throw std::invalid_argument("shape round rect requires nonnegative dimensions and radii");
            }
            // Bound subdivision work for a single arc; no silently truncated sweep.
            if (op == 6 && (next[cursor + 2] < 0 || std::abs(next[cursor + 4]) > 128 * pi)) {
                throw std::invalid_argument("shape arc requires nonnegative radius and at most 64 turns");
            }
            cursor += count;
        }
        words = std::move(next); // Rejected writes preserve the previous complete path.
        ++revision;
    }

    void clear() { words.clear(); ++revision; }
    bool empty() const { return words.empty(); }
    uint64_t version() const { return revision; }

    bool visit(double width, double height, GeometricPathVisitor& visitor) const {
        if (empty()) return true;
        shapeFloat(width);
        shapeFloat(height);
        if (width < 0 || height < 0) throw std::invalid_argument("shape frame must be nonnegative");
        return GeometricPath::visit(reinterpret_cast<const Byte*>(words.data()),
                                    words.size() * sizeof(double), width, height, visitor);
    }

    static constexpr double pi = 3.14159265358979323846;

private:
    std::vector<double> words;
    uint64_t revision = 0;
};

struct ShapeState {
    ShapePath path;
    uint32_t fill = 0;   // Drawing ARGB; transparent upstream defaults.
    uint32_t stroke = 0;
    float width = 1;     // Valdi points, independent of path extent.
    ShapeCap cap = ShapeCap::Butt;
    ShapeJoin join = ShapeJoin::Miter;

    void strokeWidth(double value) {
        const auto next = shapeFloat(value);
        if (next < 0) throw std::invalid_argument("shape strokeWidth must be nonnegative");
        width = next;
    }
};

} // namespace Valdi::Harmony::detail
