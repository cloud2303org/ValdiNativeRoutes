#include "../InputState.hpp"

#include <cassert>
#include <functional>
#include <iostream>
#include <vector>

using namespace Valdi::Harmony::detail;

static void setterCompletion() {
    using namespace std::chrono_literals;
    const InputSetterEchoes::Time now {};
    InputSetterEchoes echoes;
    const InputEdit assigned {"Native42", {3, 3}};
    auto ticket = echoes.remember(assigned, true, true, now);
    // A blocking native setter spends two seconds on UI/IME work. Its echo
    // follows 15ms after return and still belongs to the completed write.
    assert(echoes.complete(ticket, true, now + 2000ms));
    assert(echoes.text("Native42", false, now + 2015ms));
    assert(echoes.selection({8, 8}, now + 2016ms));
    assert(echoes.selection({3, 3}, now + 2017ms));
    assert(echoes.size() == 0 && !echoes.text("Native42", false, now + 2018ms));

    ticket = echoes.remember(assigned, true, true, now);
    assert(echoes.complete(ticket, true, now + 2000ms));
    assert(echoes.text("Native42", false, now + 2499ms));
    echoes.cancel();
    ticket = echoes.remember(assigned, true, true, now);
    assert(echoes.complete(ticket, true, now + 2000ms));
    assert(!echoes.complete(ticket, true, now + 2400ms)); // cannot extend repeatedly
    assert(!echoes.text("Native42", false, now + 2500ms));

    // A synchronous text acknowledgement leaves only selection channels.
    ticket = echoes.remember(assigned, true, true, now);
    assert(echoes.text("Native42", false, now + 1ms));
    assert(echoes.complete(ticket, true, now + 2000ms));
    assert(echoes.selection({3, 3}, now + 2015ms));
    assert(!echoes.text("Native42", false, now + 2016ms)); // no text rearming
    // The inverse is also independent: consumed selections stay consumed.
    ticket = echoes.remember(assigned, true, true, now);
    assert(echoes.selection({8, 8}, now + 1ms) && echoes.selection({3, 3}, now + 2ms));
    assert(echoes.complete(ticket, true, now + 2000ms));
    assert(!echoes.selection({3, 3}, now + 2015ms));
    assert(echoes.text("Native42", false, now + 2016ms));

    // Fully consumed, cancelled, expired-and-pruned and evicted tickets must
    // never be recreated by a later completion of the old native call.
    ticket = echoes.remember(assigned, true, true, now);
    assert(echoes.text("Native42", false, now + 1ms));
    assert(echoes.selection({8, 8}, now + 2ms) && echoes.selection({3, 3}, now + 3ms));
    assert(!echoes.complete(ticket, true, now + 2000ms) && echoes.size() == 0);
    ticket = echoes.remember(assigned, true, true, now);
    echoes.cancel();
    assert(!echoes.complete(ticket, true, now + 2000ms) && echoes.size() == 0);
    ticket = echoes.remember(assigned, true, true, now);
    assert(!echoes.selection({3, 3}, now + 600ms)); // prunes expired in-flight record
    assert(!echoes.complete(ticket, true, now + 2000ms) && echoes.size() == 0);
    ticket = echoes.remember(assigned, true, true, now);
    for (int i = 0; i < 8; ++i) echoes.remember({std::to_string(i), {0, 0}}, true, true, now);
    assert(!echoes.complete(ticket, true, now + 2000ms) && echoes.size() == 8);
    echoes.cancel();

    // A late completion for a missing old ticket must not refresh a newer one.
    ticket = echoes.remember(assigned, true, true, now);
    echoes.cancel(ticket);
    echoes.remember({"new", {1, 1}}, true, true, now + 10ms);
    assert(!echoes.complete(ticket, true, now + 400ms));
    assert(!echoes.text("new", false, now + 510ms));
    // Reentry changes the epoch. Completing that old call cancels only its own
    // surviving ticket, leaving the newer write's channels/deadline untouched.
    InputEpoch epoch;
    const auto oldEpoch = epoch.generation;
    ticket = echoes.remember(assigned, true, true, now);
    epoch.replace();
    const auto newer = echoes.remember({"new", {1, 1}}, true, true, now + 100ms);
    assert(echoes.complete(newer, true, now + 2000ms));
    assert(!echoes.complete(ticket, oldEpoch == epoch.generation, now + 2100ms));
    assert(echoes.size() == 1 && echoes.text("new", false, now + 2499ms));
    echoes.cancel();
    assert(!echoes.complete(0, true, now) && echoes.size() == 0);
}

static void setterEchoBounds() {
    using namespace std::chrono_literals;
    const InputSetterEchoes::Time now {};
    InputSetterEchoes echoes;
    const InputEdit assigned {"Native42", {3, 3}};

    // Programmatic text sets the native caret to its end before restoring the
    // requested range. Both notifications can arrive after the write returns.
    echoes.remember(assigned, true, true, now);
    assert(echoes.selection({8, 8}, now + 7ms));
    assert(echoes.selection({3, 3}, now + 8ms));
    assert(!echoes.selection({3, 3}, now + 9ms));
    assert(echoes.text("Native42", false, now + 10ms));
    assert(echoes.size() == 0);
    assert(!echoes.text("Native42", false, now + 11ms)); // same-text commit survives

    echoes.remember({"", {0, 0}}, true, true, now);
    assert(echoes.text("", false, now + 5ms)); // clear emits a real deferred echo
    assert(echoes.selection({0, 0}, now + 6ms));
    assert(echoes.size() == 0);

    // Composition, including empty preedit with a marked offset, is user work.
    echoes.remember(assigned, true, true, now);
    assert(!echoes.text("Native42", true, now + 1ms));
    assert(echoes.size() == 0);
    assert(!echoes.text("Native42", false, now + 2ms));
    // DID_INSERT/DELETE, paste/cut, raw DOWN/key, stop all cancel the ledger.
    echoes.remember(assigned, true, true, now);
    echoes.cancel();
    assert(echoes.size() == 0 && !echoes.text("Native42", false, now + 2ms));
    // A different commit retires all old expectations before user processing.
    echoes.remember(assigned, true, true, now);
    assert(!echoes.text("Native42x", false, now + 1ms));
    assert(echoes.size() == 0 && !echoes.text("Native42", false, now + 2ms));

    // Setter notifications can coalesce into the latest content. A newest
    // matching acknowledgement retires older text generations, not future ones.
    echoes.remember({"a", {1, 1}}, true, false, now);
    echoes.remember({"b", {1, 1}}, true, false, now + 1ms);
    assert(echoes.text("b", false, now + 2ms));
    assert(!echoes.text("a", false, now + 3ms));
    echoes.remember({"a", {1, 1}}, true, false, now);
    echoes.remember({"b", {1, 1}}, true, false, now + 1ms);
    assert(echoes.text("a", false, now + 2ms));
    assert(echoes.text("b", false, now + 3ms));
    echoes.cancel();
    echoes.remember(assigned, true, true, now);
    echoes.remember(assigned, true, true, now + 1ms);
    assert(echoes.text("Native42", false, now + 2ms));
    assert(!echoes.text("Native42", false, now + 3ms)); // no leftover equal ticket

    // Never leave text equality armed for an unbounded future IME commit.
    echoes.remember(assigned, true, true, now);
    assert(echoes.text("Native42", false, now + 499ms));
    echoes.remember(assigned, true, true, now);
    assert(!echoes.text("Native42", false, now + 500ms));
    assert(echoes.size() == 0);
    echoes.remember(assigned, true, true, now);
    assert(!echoes.selection({3, 3}, now + 501ms));
    assert(echoes.size() == 0);
    for (int i = 0; i < 100; ++i) {
        echoes.remember({std::to_string(i), {0, 0}}, true, true, now);
        assert(echoes.size() <= 8);
    }
    assert(echoes.size() == 8 && !echoes.text("0", false, now + 1ms));

    // Exception/reentry cleanup cancels ONLY the failed setter generation.
    const auto old = echoes.remember(assigned, true, true, now);
    const auto newer = echoes.remember({"replacement", {2, 2}}, true, true, now);
    assert(newer > old);
    echoes.cancel(old);
    assert(echoes.text("replacement", false, now + 1ms));
    echoes.cancel();
    assert(echoes.remember(assigned, false, false, now) == 0 && echoes.size() == 0);
    echoes.remember(assigned, false, true, now); // selection-only never mutes text
    assert(!echoes.text("Native42", false, now + 1ms));
    echoes.remember(assigned, true, true, now);
    assert(!echoes.selection({1, 1}, now + 1ms));
    assert(echoes.text("Native42", false, now + 2ms)); // selection is not text origin
}

static void deferredSetterPipeline() {
    using namespace std::chrono_literals;
    const InputSetterEchoes::Time now {};
    InputSetterEchoes echoes;
    InputEpoch epoch;
    epoch.active = true;
    InputEdit committed {"abc", {3, 3}}, stored = committed;
    InputSelection notified = committed.selection;
    int processors = 0, changes = 3, selections = 0, nativeWrites = 0;
    const auto processor = [&](const InputEdit&) -> std::optional<InputEdit> {
        ++processors;
        return std::nullopt;
    };
    const auto write = [&](const InputEdit& edit) {
        InputWriteGuard guard(epoch);
        ++nativeWrites;
        const auto ticket = echoes.remember(edit, true, true, now);
        assert(echoes.complete(ticket, true, now));
        // No callback until the SDK's layout task runs after this guard ends.
    };
    const auto deliver = [&](const InputEdit& candidate, bool preview = false) {
        if (echoes.text(candidate.text, preview, now + 7ms) || preview) return false;
        const auto accepted = inputProcess(epoch, candidate, -1, processor, [] { return true; });
        if (!accepted) return false;
        return inputCommit(epoch, committed, notified, *accepted, [&](const InputEdit& edit) {
            if (edit != candidate) write(edit);
        }, [&](uint64_t) { stored = committed; return true; },
        [&](const InputEdit&) { ++changes; }, [&](const InputEdit&) { ++selections; },
        [] { return true; });
    };
    assert(inputProgrammaticEdit(epoch, committed, notified, {"Native42", {3, 3}},
        write, [] { return true; }, [&](InputSelection value) { stored = committed; assert(value == notified); }));
    const auto setterGeneration = epoch.generation;
    assert(!deliver({"Native42", {3, 3}}));
    assert(epoch.generation == setterGeneration && processors == 0 && changes == 3 && selections == 0);
    assert((committed == InputEdit {"Native42", {3, 3}} && stored == committed && nativeWrites == 1));
    assert(deliver({"Native42", {3, 3}})); // equal committed text is not a general dedup
    assert(processors == 1 && changes == 4 && nativeWrites == 1);

    assert(inputProgrammaticEdit(epoch, committed, notified, {"", {0, 0}},
        write, [] { return true; }, [&](InputSelection) { stored = committed; }));
    assert(!deliver({"", {0, 0}}) && processors == 1 && changes == 4);
    assert(deliver({"a", {1, 1}}) && processors == 2 && changes == 5 && selections == 1);
    // Even when the setter echo is absent, user/composition evidence permits
    // an equal-text IME commit inside the pending 500ms window.
    assert(inputProgrammaticEdit(epoch, committed, notified, {"Native42", {2, 2}},
        write, [] { return true; }, [&](InputSelection) {}));
    echoes.cancel(); // native DID_INSERT (no processing / no JS dispatch)
    assert(deliver({"Native42", {2, 2}}) && processors == 3 && changes == 6);
    assert(inputProgrammaticEdit(epoch, committed, notified, {"Native42", {2, 2}},
        write, [] { return true; }, [&](InputSelection) {}));
    assert(!deliver({"Native42", {2, 2}}, true));
    assert(deliver({"Native42", {2, 2}}) && processors == 4 && changes == 7);

    // Synchronous acknowledgements are consumed inside the suppression guard,
    // so no phantom ticket remains for the next same-text commit.
    {
        InputWriteGuard guard(epoch);
        echoes.remember(committed, true, true, now);
        assert(!deliver(committed));
    }
    assert(deliver(committed) && processors == 5 && changes == 8);

    // A processor replacement gets one real change; its delayed correction echo
    // must not run that processor again.
    auto replacement = inputProcess(epoch, {"raw", {3, 3}}, -1,
        [&](const InputEdit&) -> std::optional<InputEdit> {
            ++processors;
            return InputEdit {"processed", {4, 4}};
        }, [] { return true; });
    assert(replacement);
    assert(inputCommit(epoch, committed, notified, *replacement, write,
        [&](uint64_t) { stored = committed; return true; },
        [&](const InputEdit&) { ++changes; }, [&](const InputEdit&) { ++selections; },
        [] { return true; }));
    assert(!deliver({"processed", {4, 4}}) && processors == 6 && changes == 9);
    assert(deliver({"processed", {4, 4}}) && processors == 7 && changes == 10);
}

static void sessionTermination() {
    using Action = std::function<void()>;
    bool focused = true, listening = true, storedFocus = true;
    int ends = 0, replacementEnds = 0, cleanups = 0;
    Action action = [&] { ++ends; };
    std::function<void()> stop;
    stop = [&] {
        inputEndSession(focused, action, [&](bool ended) {
            ++cleanups;
            listening = false; // stop() unregisters before stopping native editing.
            action = [&] { ++replacementEnds; }; // clear/rebind cannot lose the snapshot.
            if (ended) {
                assert(!focused);
                // SDK synchronous EDIT_CHANGE(false), or recursive detach.
                stop();
            }
        }, [&] {
            storedFocus = false;
            stop(); // valueChanged flushes a detach before terminal delivery.
        }, [&](const Action& terminal) {
            assert(!listening && !storedFocus && !focused);
            terminal();
            stop(); // onEditEnd removes the editor.
        });
    };
    stop();
    assert(ends == 1 && replacementEnds == 0 && cleanups == 4);
    stop(); // already idle: no invented terminal.
    assert(ends == 1 && replacementEnds == 0);
    focused = true; // a later native begin creates a new session.
    stop();
    assert(ends == 1 && replacementEnds == 1);

    // A synchronous native blur with live listeners consumes the same session.
    // A new focus from valueChanged must survive the old terminal callback.
    focused = true;
    int nativeEnds = 0;
    inputEndSession(focused, Action([&] { ++nativeEnds; }), [&](bool ended) {
        assert(ended && !focused);
    }, [&] { focused = true; },
    [&](const Action& terminal) { terminal(); });
    assert(focused && nativeEnds == 1);
    inputEndSession(focused, Action([&] { ++nativeEnds; }), [](bool) {},
                    [] {}, [](const Action& terminal) { terminal(); });
    assert(!focused && nativeEnds == 2);
}

static void programmaticSelection() {
    InputEpoch epoch; // Writes before mount must also publish clamped state.
    InputEdit committed {"abcdef", {5, 6}}, native = committed;
    InputSelection notified = committed.selection, stored {99, 99};
    int stores = 0, processors = 0, changes = 0;
    const auto write = [&](const InputEdit& edit) {
        InputWriteGuard guard(epoch);
        native = edit;
        // A native setter echo must never enter user processing.
        assert(!inputProcess(epoch, edit, -1, [&](const auto&) -> std::optional<InputEdit> {
            ++processors;
            return std::nullopt;
        }, [] { return true; }));
    };
    const auto publish = [&](InputSelection selection) { stored = selection; ++stores; };
    assert(inputProgrammaticEdit(epoch, committed, notified, {"ab", committed.selection},
                                 write, [] { return true; }, publish));
    assert((committed == InputEdit {"ab", {2, 2}} && native == committed));
    assert(stored == committed.selection && notified == stored && stores == 1);
    epoch.active = true;
    assert(inputProgrammaticEdit(epoch, committed, notified, {"ab", {-100, 999}},
                                 write, [] { return true; }, publish));
    assert((stored == InputSelection {0, 2} && committed.selection == stored && native == committed));
    assert(inputProgrammaticEdit(epoch, committed, notified, {"ab", {99, -5}},
                                 write, [] { return true; }, publish));
    assert((stored == InputSelection {2, 2}));
    assert(inputProgrammaticEdit(epoch, committed, notified, {"", committed.selection},
                                 write, [] { return true; }, publish));
    assert((stored == InputSelection {0, 0} && native == committed && stores == 4));
    assert(processors == 0 && changes == 0);

    // Reentrant newer content/selection wins over an older native setter.
    assert(!inputProgrammaticEdit(epoch, committed, notified, {"old", {3, 3}},
        [&](const InputEdit&) {
            assert(inputProgrammaticEdit(epoch, committed, notified, {"newer", {4, 4}},
                                         write, [] { return true; }, publish));
        }, [] { return true; }, publish));
    assert((committed == InputEdit {"newer", {4, 4}} && stored == committed.selection && stores == 5));
    bool alive = true;
    assert(!inputProgrammaticEdit(epoch, committed, notified, {"removed", {7, 7}},
        [&](const InputEdit&) { alive = false; }, [&] { return alive; }, publish));
    assert((stored == InputSelection {4, 4} && stores == 5));
}

static void actionRebinding() {
    using Action = std::function<std::optional<InputEdit>(const InputEdit&)>;
    InputEpoch epoch;
    epoch.active = true;
    InputActions<Action, 3> actions;
    InputEdit committed {"before", {0, 0}}, stored = committed;
    InputSelection notified = committed.selection;
    std::vector<std::string> order;
    const InputEdit candidate {"accepted", {8, 8}};
    auto replacement = [&](const InputEdit&) -> std::optional<InputEdit> {
        order.emplace_back("future");
        return std::nullopt;
    };
    actions.bind(0, [&](const InputEdit&) -> std::optional<InputEdit> {
        order.emplace_back("processor");
        // makeMainThreadCallback + setState returns undefined while rerender
        // replaces the inline selection action on the same editor/value.
        actions.bind(0, replacement);
        actions.bind(1, replacement);
        actions.bind(2, replacement);
        return std::nullopt;
    });
    actions.bind(1, [&](const InputEdit& edit) -> std::optional<InputEdit> {
        assert(edit == candidate && committed == candidate && stored == candidate);
        order.emplace_back("change");
        actions.bind(2, replacement); // onChange itself can rerender as well.
        return std::nullopt;
    });
    actions.bind(2, [&](const InputEdit& edit) -> std::optional<InputEdit> {
        assert(edit == candidate && notified == candidate.selection);
        order.emplace_back("selection");
        return std::nullopt;
    });
    const auto snapshot = actions;
    auto accepted = inputProcess(epoch, candidate, -1, snapshot[0], [] { return true; });
    assert(accepted && *accepted == candidate);
    assert(inputCommit(epoch, committed, notified, *accepted,
        [&](const InputEdit& edit) { assert(edit == candidate); order.emplace_back("write"); },
        [&](uint64_t generation) {
            assert(epoch.current(generation));
            stored = committed;
            order.emplace_back("store");
            return true;
        }, [&](const InputEdit& edit) { snapshot[1](edit); },
        [&](const InputEdit& edit) { snapshot[2](edit); }, [] { return true; }));
    assert((order == std::vector<std::string>{"processor", "write", "store", "change", "selection"}));
    actions[2](candidate); // The next sequence gets the replacement.
    assert(order.back() == "future");

    // True replacement/focus/removal during processing still cancels acceptance.
    for (int mutation = 0; mutation < 3; ++mutation) {
        epoch.active = true;
        bool alive = true;
        assert(!inputProcess(epoch, candidate, -1,
            [&](const InputEdit&) -> std::optional<InputEdit> {
                if (mutation == 0) {
                    committed = {"replacement", {1, 1}};
                    epoch.replace();
                } else if (mutation == 1) epoch.replace(); // focus superseded
                else alive = false;
                return std::nullopt;
            }, [&] { return alive; }));
    }
    // Replacement/removal from onChange must suppress the stale selection.
    for (bool remove : {false, true}) {
        epoch.active = true;
        notified = {0, 0};
        bool alive = true;
        int selections = 0;
        assert(!inputCommit(epoch, committed, notified, candidate, [](const auto&) {},
            [](uint64_t) { return true; },
            [&](const InputEdit&) {
                if (remove) alive = false;
                else { committed = {"replacement", {1, 1}}; epoch.replace(); }
            }, [&](const auto&) { ++selections; }, [&] { return alive; }));
        assert(selections == 0);
    }
}

int main() {
    setterCompletion();
    setterEchoBounds();
    deferredSetterPipeline();
    sessionTermination();
    programmaticSelection();
    actionRebinding();
    const std::string emoji = "\xf0\x9f\x98\x80";
    const std::string cjk = "\xe4\xb8\xad";
    assert(inputLength("a" + emoji + cjk) == 4);
    assert(inputTruncate("a" + emoji + cjk, 1) == "a");
    assert(inputTruncate("a" + emoji + cjk, 2) == "a"); // no broken surrogate
    assert(inputTruncate("a" + emoji + cjk, 3) == "a" + emoji);
    assert(inputTruncate("a" + emoji + cjk, 4) == "a" + emoji + cjk);
    assert(inputTruncate(emoji, 0).empty());
    assert((inputClamp({-3, 100}, emoji) == InputSelection {0, 2}));
    assert((inputClamp({9, -2}, emoji) == InputSelection {2, 2}));
    for (auto text : {std::string("\xc0\xaf"), std::string("\xed\xa0\x80"),
                     std::string("\xf4\x90\x80\x80"), std::string("\xe4\xb8"), std::string("\x80")}) {
        bool threw = false;
        try { inputLength(text); } catch (const std::runtime_error&) { threw = true; }
        assert(threw);
    }
    InputEpoch epoch;
    epoch.active = true;
    int processors = 0;
    auto accept = [&](const InputEdit&) -> std::optional<InputEdit> { ++processors; return std::nullopt; };
    const InputEdit candidate {"a" + emoji, {3, 3}};
    auto first = inputProcess(epoch, candidate, -1, accept, [] { return true; });
    auto sameTextIME = inputProcess(epoch, candidate, -1, accept, [] { return true; });
    assert(first && sameTextIME && *first == candidate && *sameTextIME == candidate && processors == 2);
    {
        InputWriteGuard write(epoch);
        assert(!inputProcess(epoch, candidate, -1, accept, [] { return true; }));
        { InputWriteGuard nested(epoch); assert(epoch.suppression == 2); }
        assert(epoch.suppression == 1);
    }
    assert(epoch.suppression == 0 && processors == 2);
    assert(epoch.processing == 0);
    assert(!inputProcess(epoch, candidate, -1, [&](auto&) -> std::optional<InputEdit> {
        assert(epoch.processing == 1);
        epoch.replace(); // explicit same-value assignment still supersedes processing
        return std::nullopt;
    }, [] { return true; }));
    assert(epoch.processing == 0);
    const auto replacement = inputProcess(epoch, candidate, 3, [](auto&) -> std::optional<InputEdit> {
        return InputEdit {"AB\xf0\x9f\x98\x80", {-1, 999}};
    }, [] { return true; });
    assert((replacement && replacement->text == "AB" && replacement->selection == InputSelection {0, 2}));
    assert(!inputProcess(epoch, candidate, -1, [&](auto&) -> std::optional<InputEdit> {
        epoch.replace(); // JS assigned a newer value or rebound the node
        return InputEdit {"stale", {5, 5}};
    }, [] { return true; }));
    assert(!inputProcess(epoch, candidate, -1, [&](auto&) -> std::optional<InputEdit> {
        epoch.active = false; // synchronous unmount/disposal
        return std::nullopt;
    }, [] { return true; }));
    epoch.active = true;
    assert(!inputProcess(epoch, candidate, -1, accept, [] { return false; }));
    InputEdit before {emoji + "ab", {2, 3}};
    InputEdit newline {emoji + "\nb", {3, 3}};
    assert(inputSingleNewline(before, newline, false, false));
    assert(!inputSingleNewline(before, newline, true, false));
    assert(!inputSingleNewline(before, newline, false, true));
    assert(!inputSingleNewline(before, {emoji + "\nx\nb", {5, 5}}, false, false));
    assert(inputSingleNewline({"", {0, 0}}, {"\n", {1, 1}}, false, false));
    assert(inputSingleNewline({"a", {1, 1}}, {"a\n", {2, 2}}, false, false));
    std::cout << "input setter completion windows, bounded echoes, same-text IME, session terminals, stored clamps, action rebinding, UTF16 and reentry tests passed\n";
}
