#pragma once

#include <algorithm>
#include <array>
#include <chrono>
#include <cstdint>
#include <deque>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>

namespace Valdi::Harmony::detail {

// Native ArkUI strings are UTF-8; JS and native editor offsets are UTF-16.
// Reject malformed UTF-8 instead of silently turning bytes into caret offsets.
inline uint32_t inputCodePoint(std::string_view text, size_t& cursor) {
    auto first = static_cast<uint8_t>(text.at(cursor++));
    if (first < 0x80) return first;
    unsigned count;
    uint32_t code;
    if (first >= 0xc2 && first <= 0xdf) { count = 1; code = first & 0x1f; }
    else if (first >= 0xe0 && first <= 0xef) { count = 2; code = first & 0xf; }
    else if (first >= 0xf0 && first <= 0xf4) { count = 3; code = first & 7; }
    else throw std::runtime_error("input contains invalid UTF-8");
    if (cursor + count > text.size()) throw std::runtime_error("input contains truncated UTF-8");
    for (unsigned i = 0; i < count; ++i) {
        auto next = static_cast<uint8_t>(text[cursor++]);
        if ((next & 0xc0) != 0x80) throw std::runtime_error("input contains invalid UTF-8 continuation");
        code = (code << 6) | (next & 0x3f);
    }
    if ((count == 1 && code < 0x80) || (count == 2 && code < 0x800) ||
        (count == 3 && code < 0x10000) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        throw std::runtime_error("input contains invalid Unicode scalar");
    }
    return code;
}

inline int32_t inputLength(std::string_view text) {
    int64_t length = 0;
    for (size_t offset = 0; offset < text.size();) length += inputCodePoint(text, offset) > 0xffff ? 2 : 1;
    if (length > std::numeric_limits<int32_t>::max()) throw std::runtime_error("input exceeds native offset range");
    return static_cast<int32_t>(length);
}

inline std::string inputTruncate(std::string_view text, int32_t limit) {
    if (limit < 0) { inputLength(text); return std::string(text); }
    size_t end = 0;
    int64_t length = 0;
    for (size_t offset = 0; offset < text.size();) {
        length += inputCodePoint(text, offset) > 0xffff ? 2 : 1;
        if (length <= limit) end = offset;
    }
    return std::string(text.substr(0, end));
}

struct InputSelection {
    int32_t start = 0, end = 0;
    bool operator==(const InputSelection&) const = default;
};

inline InputSelection inputClamp(InputSelection selection, std::string_view text) {
    const auto length = inputLength(text);
    selection.start = std::clamp(selection.start, 0, length);
    selection.end = std::clamp(selection.end, selection.start, length);
    return selection;
}

struct InputEdit {
    std::string text;
    InputSelection selection;
    bool operator==(const InputEdit&) const = default;
};

// ArkUI resolves its after-layout callback against the CURRENT registration;
// targetId is not the registration that caused the queued change. Match only
// outstanding native setters, never committed-value equality. Acknowledgements
// are one-shot, expire, and are cancelled by observed user input/composition.
class InputSetterEchoes {
public:
    using Clock = std::chrono::steady_clock;
    using Time = Clock::time_point;
    static constexpr size_t capacity = 8;
    static constexpr auto lifetime = std::chrono::milliseconds(500);

    uint64_t remember(const InputEdit& edit, bool text, bool selection, Time now = Clock::now()) {
        expire(now);
        if (!text && !selection) return 0;
        if (_pending.size() == capacity) _pending.pop_front();
        const auto end = text ? inputLength(edit.text) : 0;
        // A text setter first moves the native caret to the end, then the
        // explicit selection setter restores the requested range. Either
        // selection notification may be deferred by the SDK.
        _pending.push_back({++_generation, edit, now + lifetime, end, text, selection,
                            text && (!selection || edit.selection != InputSelection {end, end}), false});
        return _generation;
    }

    // Native setters can block on UI/IME work. Allow the deferred window after
    // their return, once, for only this surviving ticket. Never recreate a
    // cancelled/consumed/evicted ticket or rearm an acknowledged channel.
    bool complete(uint64_t ticket, bool current, Time now = Clock::now()) {
        if (!current) { cancel(ticket); return false; }
        for (auto& pending : _pending) {
            if (pending.generation == ticket && !pending.completed) {
                pending.completed = true;
                pending.expires = now + lifetime;
                return true;
            }
        }
        return false;
    }

    bool text(std::string_view value, bool preview = false, Time now = Clock::now()) {
        if (preview) { cancel(); return false; }
        expire(now);
        uint64_t matched = 0;
        for (const auto& pending : _pending) {
            if (pending.text && pending.edit.text == value) matched = pending.generation;
        }
        if (!matched) { cancel(); return false; } // A different commit is user work.
        // Layout can coalesce several setters. Acknowledging the newest match
        // also retires superseded text expectations, including equal targets.
        for (auto& pending : _pending) if (pending.generation <= matched) pending.text = false;
        prune();
        return true;
    }

    bool selection(InputSelection value, Time now = Clock::now()) {
        expire(now);
        uint64_t matched = 0;
        for (const auto& pending : _pending) {
            if ((pending.selection && pending.edit.selection == value) ||
                (pending.caret && value == InputSelection {pending.caretOffset, pending.caretOffset})) {
                matched = pending.generation;
            }
        }
        for (auto& pending : _pending) {
            if (!matched || pending.generation < matched) pending.selection = pending.caret = false;
            else if (pending.generation == matched) {
                if (pending.edit.selection == value) pending.selection = false;
                if (value == InputSelection {pending.caretOffset, pending.caretOffset}) pending.caret = false;
            }
        }
        // Selection alone cannot establish content origin: SDK setters can
        // emit intermediate selection changes. Raw touch/key and edit hooks
        // cancel BOTH channels when there is independent user evidence.
        prune();
        return matched != 0;
    }

    void cancel() { _pending.clear(); }
    void cancel(uint64_t generation) {
        std::erase_if(_pending, [generation](const auto& pending) { return pending.generation == generation; });
    }
    size_t size() const { return _pending.size(); }

private:
    struct Pending {
        uint64_t generation;
        InputEdit edit;
        Time expires;
        int32_t caretOffset;
        bool text, selection, caret, completed;
    };
    void expire(Time now) {
        std::erase_if(_pending, [now](const auto& pending) { return now >= pending.expires; });
    }
    void prune() {
        std::erase_if(_pending, [](const auto& pending) {
            return !pending.text && !pending.selection && !pending.caret;
        });
    }
    std::deque<Pending> _pending;
    uint64_t _generation = 0;
};

inline InputEdit inputNormalize(InputEdit edit, int32_t limit) {
    edit.text = inputTruncate(edit.text, limit);
    edit.selection = inputClamp(edit.selection, edit.text);
    return edit;
}

// A newline Return candidate must be precisely the selected range replaced by
// one LF. An arbitrary diff containing LF would misclassify multiline pastes.
inline bool inputSingleNewline(const InputEdit& before, const InputEdit& after,
                               bool composing, bool pasted) {
    if (composing || pasted || before.selection != inputClamp(before.selection, before.text)) return false;
    std::optional<size_t> start, end;
    if (before.selection.start == 0) start = 0;
    if (before.selection.end == 0) end = 0;
    int32_t units = 0;
    for (size_t offset = 0; offset < before.text.size();) {
        const size_t previous = offset;
        if (units == before.selection.start) start = previous;
        if (units == before.selection.end) end = previous;
        units += inputCodePoint(before.text, offset) > 0xffff ? 2 : 1;
        if (units == before.selection.start) start = offset;
        if (units == before.selection.end) end = offset;
    }
    if (!start || !end) return false; // Never classify a split-surrogate edit.
    return after.text == before.text.substr(0, *start) + "\n" + before.text.substr(*end) &&
           after.selection.start == before.selection.start + 1 &&
           after.selection.end == after.selection.start;
}

struct InputEpoch {
    uint64_t generation = 0;
    unsigned suppression = 0;
    unsigned processing = 0;
    bool active = false;
    void replace() { ++generation; }
    bool current(uint64_t expected) const { return active && !suppression && generation == expected; }
};

// Actions belong to future sequences. Rebinding an inline JS function does not
// supersede the content/focus generation of an already accepted native edit.
template<class Action, size_t Count>
struct InputActions {
    std::array<Action, Count> values {};
    void bind(size_t index, Action action) { values.at(index) = std::move(action); }
    const Action& operator[](size_t index) const { return values[index]; }
    auto begin() { return values.begin(); }
    auto end() { return values.end(); }
};

// Consume the actual session before native cleanup or valueChanged can reenter.
// The callback is a snapshot, so clearing/rebinding actions during cleanup
// cannot lose the terminal event. An idle editor never invents an end event.
template<class Action, class Cleanup, class Publish, class Deliver>
bool inputEndSession(bool& focused, Action callback, Cleanup&& cleanup,
                     Publish&& publish, Deliver&& deliver) {
    const bool ended = std::exchange(focused, false);
    cleanup(ended);
    if (ended) {
        publish();
        deliver(callback);
    }
    return ended;
}

// Native setters suppress selection notifications. Publish the final clamped
// state ourselves, including a caret clamped by a shorter programmatic value.
// Content replacement/removal during a setter wins over this stale write.
template<class Write, class Valid, class Publish>
bool inputProgrammaticEdit(InputEpoch& epoch, InputEdit& committed,
                           InputSelection& notifiedSelection, InputEdit edit,
                           Write&& write, Valid&& valid, Publish&& publish) {
    edit.selection = inputClamp(edit.selection, edit.text);
    epoch.replace();
    const auto generation = epoch.generation;
    committed = edit;
    write(edit);
    if (generation != epoch.generation || !valid()) return false;
    notifiedSelection = edit.selection;
    publish(edit.selection);
    return generation == epoch.generation && valid();
}

class InputProcessingGuard {
public:
    explicit InputProcessingGuard(InputEpoch& epoch) : _epoch(epoch) { ++_epoch.processing; }
    ~InputProcessingGuard() { --_epoch.processing; }
private:
    InputEpoch& _epoch;
};

class InputWriteGuard {
public:
    explicit InputWriteGuard(InputEpoch& epoch) : _epoch(epoch) { ++_epoch.suppression; }
    ~InputWriteGuard() { --_epoch.suppression; }
    InputWriteGuard(const InputWriteGuard&) = delete;
private:
    InputEpoch& _epoch;
};

// Production orchestration seam: same-text commits still run the processor.
// Content/focus replacement and detach invalidate all remaining work; action
// rebinding alone preserves the accepted sequence and its callback snapshot.
template<class Processor, class Valid>
std::optional<InputEdit> inputProcess(InputEpoch& epoch, InputEdit candidate,
                                    int32_t limit, Processor&& processor, Valid&& valid) {
    if (!epoch.active || epoch.suppression) return std::nullopt;
    const auto generation = ++epoch.generation;
    candidate = inputNormalize(std::move(candidate), limit);
    InputProcessingGuard processing(epoch);
    auto replacement = processor(candidate);
    if (!epoch.current(generation) || !valid()) return std::nullopt;
    return inputNormalize(replacement ? std::move(*replacement) : std::move(candidate), limit);
}

// Complete one accepted native edit in order. Every user-visible step may
// synchronously replace content/focus or remove the editor. Action-only
// rebinding leaves this sequence alive; callers retain its action snapshot.
template<class Write, class Store, class Change, class Selection, class Valid>
bool inputCommit(InputEpoch& epoch, InputEdit& committed, InputSelection& notifiedSelection,
                 InputEdit accepted, Write&& write, Store&& store, Change&& change,
                 Selection&& selection, Valid&& valid) {
    const auto generation = epoch.generation;
    const auto current = [&] { return epoch.current(generation) && valid(); };
    if (!current()) return false;
    committed = accepted;
    write(accepted);
    if (!current() || !store(generation)) return false;
    change(accepted);
    if (!current()) return false;
    if (notifiedSelection != accepted.selection) {
        notifiedSelection = accepted.selection;
        selection(accepted);
    }
    return current();
}

} // namespace Valdi::Harmony::detail
