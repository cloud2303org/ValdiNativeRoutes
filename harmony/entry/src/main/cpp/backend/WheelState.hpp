#pragma once

#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <iterator>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
#include <variant>

namespace Valdi::Harmony::detail {

enum class WheelKind { Column, Time, Tree };

struct WheelOption {
    std::string value, label;
    std::vector<WheelOption> children;
    bool operator==(const WheelOption& other) const {
        return value == other.value && label == other.label && children == other.children;
    }
};

struct WheelColumn {
    std::vector<std::string> values, labels;
    size_t selected = 0;
    // Calendar field, independent of the currently visible date/time segment.
    int field = -1;
};

struct WheelConfig {
    WheelKind kind = WheelKind::Column;
    std::vector<WheelOption> options;
    std::vector<std::string> path;
    std::string value, mode = "date";
    int minYear = 2000, maxYear = 2100, columns = 3;
    bool sameStructure(const WheelConfig& other) const {
        return kind == other.kind && options == other.options && mode == other.mode &&
               minYear == other.minYear && maxYear == other.maxYear && columns == other.columns;
    }
};

inline int wheelMonthDays(int year, int month) {
    static constexpr int days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    if (month < 1 || month > 12) throw std::runtime_error("wheel month out of range");
    return days[month - 1] + (month == 2 && year % 4 == 0 && (year % 100 != 0 || year % 400 == 0));
}

inline std::string wheelPad(int value) {
    return value < 10 ? "0" + std::to_string(value) : std::to_string(value);
}

// Keep tree identity as a path, including in pending controlled echoes.
using WheelValue = std::variant<std::string, std::vector<std::string>>;

struct WheelEcho {
    std::deque<WheelValue> pending;
    std::optional<WheelValue> acknowledged;
    void clear() { pending.clear(); acknowledged.reset(); }
    bool consume(const WheelValue& value) {
        const auto match = std::find(pending.begin(), pending.end(), value);
        if (match != pending.end()) {
            pending.erase(pending.begin(), std::next(match));
            acknowledged = value;
            return true;
        }
        if (acknowledged && *acknowledged == value && !pending.empty()) return true;
        clear();
        return false;
    }
};

struct WheelState {
    std::optional<WheelConfig> config;
    std::vector<WheelColumn> visible;
    std::vector<std::string> path;
    std::array<int, 5> calendar {2000, 1, 1, 0, 0};
    std::string value;
    WheelEcho echo;
    bool timeSegment = false;

    WheelValue publicValue() const {
        return config && config->kind == WheelKind::Tree ? WheelValue(path) : WheelValue(value);
    }

    static WheelColumn optionColumn(const std::vector<WheelOption>& options, const std::string& requested) {
        WheelColumn result;
        for (const auto& option : options) {
            result.values.push_back(option.value);
            result.labels.push_back(option.label);
        }
        const auto found = std::find(result.values.begin(), result.values.end(), requested);
        result.selected = found == result.values.end() ? 0 : size_t(found - result.values.begin());
        return result;
    }

    void rebuild() {
        visible.clear();
        if (!config) return;
        const auto& c = *config;
        if (c.kind == WheelKind::Column) {
            visible.push_back(optionColumn(c.options, value));
            value = visible[0].values.at(visible[0].selected);
        } else if (c.kind == WheelKind::Tree) {
            const auto* level = &c.options;
            std::vector<std::string> normalized;
            while (!level->empty() && normalized.size() < size_t(c.columns)) {
                const auto i = normalized.size();
                auto column = optionColumn(*level, i < path.size() ? path[i] : "");
                // Duplicates deliberately select the first matching value.
                normalized.push_back(column.values.at(column.selected));
                level = &level->at(column.selected).children;
                visible.push_back(std::move(column));
            }
            path = std::move(normalized);
        } else {
            calendar[0] = std::clamp(calendar[0], c.minYear, c.maxYear);
            calendar[1] = std::clamp(calendar[1], 1, 12);
            calendar[2] = std::clamp(calendar[2], 1, wheelMonthDays(calendar[0], calendar[1]));
            calendar[3] = std::clamp(calendar[3], 0, 23);
            calendar[4] = std::clamp(calendar[4], 0, 59);
            const auto date = std::to_string(calendar[0]) + "-" + wheelPad(calendar[1]) + "-" + wheelPad(calendar[2]);
            const auto time = wheelPad(calendar[3]) + ":" + wheelPad(calendar[4]);
            value = c.mode == "year" ? std::to_string(calendar[0]) :
                    c.mode == "year-month" ? date.substr(0, 7) :
                    c.mode == "date" ? date : c.mode == "time" ? time : date + " " + time;
            auto range = [&](int field, int first, int last, const char* suffix) {
                WheelColumn column;
                column.field = field;
                column.selected = size_t(calendar[field] - first);
                for (int v = first; v <= last; ++v) {
                    column.values.push_back(std::to_string(v));
                    column.labels.push_back((field >= 3 ? wheelPad(v) : std::to_string(v)) + suffix);
                }
                visible.push_back(std::move(column));
            };
            if (c.mode == "time" || (c.mode == "datetime" && timeSegment)) {
                range(3, 0, 23, "时"); range(4, 0, 59, "分");
            } else {
                range(0, c.minYear, c.maxYear, "年");
                if (c.mode != "year") range(1, 1, 12, "月");
                if (c.mode != "year" && c.mode != "year-month") range(2, 1, wheelMonthDays(calendar[0], calendar[1]), "日");
            }
        }
    }

    // Input has already been validated as a canonical shared-schema value.
    void readCalendar(const WheelConfig& c) {
        auto number = [&](size_t start, size_t count) { return std::stoi(c.value.substr(start, count)); };
        if (c.mode == "time") {
            calendar[3] = number(0, 2); calendar[4] = number(3, 2);
        } else {
            calendar[0] = number(0, 4);
            if (c.mode != "year") calendar[1] = number(5, 2);
            if (c.mode == "date" || c.mode == "datetime") calendar[2] = number(8, 2);
            if (c.mode == "datetime") { calendar[3] = number(11, 2); calendar[4] = number(14, 2); }
        }
    }

    // Operate on a candidate copy. Native allocation/mount succeeds BEFORE the
    // candidate replaces committed state, including its pending echo history.
    bool configure(const WheelConfig& next) {
        const bool structural = !config || !config->sameStructure(next);
        if (structural) echo.clear();
        const auto requested = next.kind == WheelKind::Tree ? WheelValue(next.path) : WheelValue(next.value);
        const bool ownEcho = !structural && echo.consume(requested);
        if (!structural && (ownEcho || requested == publicValue())) return false;
        config = next;
        if (structural) timeSegment = false;
        if (next.kind == WheelKind::Tree) path = next.path;
        else if (next.kind == WheelKind::Time) readCalendar(next);
        else value = next.value;
        rebuild();
        return true;
    }

    bool select(size_t column, size_t index) {
        if (!config || column >= visible.size() || index >= visible[column].values.size()) return false;
        const auto previous = publicValue();
        const auto next = visible[column].values[index];
        if (config->kind == WheelKind::Column) value = next;
        else if (config->kind == WheelKind::Tree) {
            if (column >= path.size() || path[column] != next) {
                path.resize(column);
                path.push_back(next); // changed parent discards the entire suffix
            }
        } else calendar[visible[column].field] = std::stoi(next);
        rebuild();
        return publicValue() != previous;
    }
};

// A DOWN arms a new interaction; another DOWN before settlement keeps its
// pending selection. STOP/CANCEL and control retirement clear that sequence.
// A previously completed touch never authorizes subsequent setter events.
struct WheelInteraction {
    bool armed = false;
    std::optional<size_t> tentative;
    void begin() {
        if (armed) return;
        armed = true;
        tentative.reset();
    }
    void cancel() { armed = false; tentative.reset(); }
    bool stop(size_t getter, size_t payload) {
        const bool accept = armed && tentative && *tentative == getter && getter == payload;
        if (accept) cancel();
        return accept;
    }
};

} // namespace Valdi::Harmony::detail
