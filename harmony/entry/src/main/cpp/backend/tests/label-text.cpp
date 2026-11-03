#include "../LabelText.hpp"
#include "../OverlayHitTest.hpp"
#include <cassert>
#include <iostream>

using namespace Valdi::Harmony::detail;

template<class F>
static void rejected(F&& call) {
    bool threw = false;
    try { call(); } catch (const std::runtime_error&) { threw = true; }
    assert(threw);
}

int main() {
    assert(labelParagraphWidth(0) == 1);
    assert(labelParagraphWidth(1) == 1);
    assert(labelParagraphWidth(317) == 317);
    assert(!labelHasPaintArea(0, 20) && !labelHasPaintArea(100, 0));
    assert(!labelHasPaintArea(0, 0) && labelHasPaintArea(100, 20));
    for (double invalid : {-1.0, std::numeric_limits<double>::infinity(),
                           std::numeric_limits<double>::quiet_NaN()}) {
        bool rejected = false;
        try { (void)labelParagraphWidth(invalid); }
        catch (const std::runtime_error&) { rejected = true; }
        assert(rejected);
    }
    const auto italic = parseLabelFont("system-demi-bold-italic 21.5");
    assert(italic.italic && italic.weight == 600 && italic.size == 21.5f && italic.family.empty());
    assert(parseLabelFont("system-italic 16").italic);
    assert(parseLabelFont("system-bold-italic 18").weight == 700);
    assert(!parseLabelFont("app:mono_italic 18").italic);
    rejected([] { parseLabelFont("system-bold-magic 18"); });
    rejected([] { parseLabelFont("system 18 junk"); });
    rejected([] { parseLabelFont("app:mono nan"); });
    rejected([] { labelDecoration("blink"); });
    rejected([] { validateLabelContent(std::string("a\0b", 3)); });
    rejected([] { labelScalar(-1, "lineHeight", true); });
    rejected([] { labelScalar(std::numeric_limits<double>::infinity(), "letterSpacing", false); });
    labelScalar(-2, "letterSpacing", false);
    assert(labelARGB(0x11223380) == 0x80112233);
    assert(labelARGB(0xff000000) == 0x00ff0000); // Transparent red retains RGB.

    TextStyle text;
    static_cast<LabelFont&>(text) = parseLabelFont("app:body 18");
    text.color = 0xff112233;
    text.decoration = LabelDecoration::Underline;
    text.lineHeight = 1.5;
    text.lineHeightAbsolute = 25;
    text.letterSpacing = -1.5;
    text.attributed = true;
    text.runs = {
        {"你好 😀", {}, {}, {}},
        {"bold", parseLabelFont("system-bold-italic 30"), 0, LabelDecoration::None},
        {"tail", parseLabelFont("app:mono 12"), 0xffaabbcc, LabelDecoration::Dotted},
        {"same", parseLabelFont("app:mono 16"), {}, {}},
    };
    const auto inherited = inheritLabelRun(text, text.runs[0]);
    assert(inherited.content == "你好 😀" && inherited.style.family == "app:body");
    assert(inherited.style.color == text.color && inherited.style.decoration == LabelDecoration::Underline);
    const auto overridden = inheritLabelRun(text, text.runs[1]);
    assert(overridden.style.family.empty() && overridden.style.italic && overridden.style.weight == 700);
    assert(overridden.style.color == 0 && overridden.style.decoration == LabelDecoration::None);
    assert(overridden.style.letterSpacing == -1.5);
    const auto absolute = labelLineMetrics(overridden.style, 2);
    assert(!absolute.naturalHeight && absolute.absolutePixels == 50 && absolute.factor == 25.0 / 30);
    auto relativeStyle = overridden.style;
    relativeStyle.lineHeightAbsolute.reset();
    const auto relative = labelLineMetrics(relativeStyle, 3);
    assert(relative.naturalHeight && !relative.absolutePixels && relative.factor == 1.5);

    FontApplicationEpoch epoch;
    std::vector<std::string> loads;
    std::vector<LabelRun> published;
    const auto resolve = [&](const std::string& name) {
        loads.push_back(name);
        return name.empty() ? "" : "registered:" + name;
    };
    assert(applyResolvedLabel(epoch, text, resolve, [] { return true; },
        [&](const TextStyle& resolved, const auto& runs) {
            assert(resolved.family == "registered:app:body");
            published = runs;
        }));
    assert((loads == std::vector<std::string>{"app:body", "", "app:mono"}));
    assert(published.size() == 4 && published[0].style.family == "registered:app:body");
    assert(published[2].style.family == published[3].style.family);
    assert(published[1].style.color == 0 && published[2].style.decoration == LabelDecoration::Dotted);
    assert(text.runs[2].font->family == "app:mono"); // No alias contamination of logical style.

    loads.clear();
    bool alive = true;
    // A later span loader reenters with a new label. Outer state must neither
    // overwrite that label nor perform any subsequent font loads.
    assert(!applyResolvedLabel(epoch, text,
        [&](const std::string& name) {
            loads.push_back(name);
            if (name == "app:mono") {
                TextStyle next;
                next.text = "replacement";
                applyResolvedLabel(epoch, next, [](const auto& family) { return family; },
                    [] { return true; }, [&](const auto&, const auto& runs) { published = runs; });
            }
            return name;
        }, [&] { return alive; }, [&](const auto&, const auto&) { assert(false); }));
    assert(published.size() == 1 && published[0].content == "replacement");
    assert((loads == std::vector<std::string>{"app:body", "", "app:mono"}));
    assert(!applyResolvedLabel(epoch, text,
        [&](const auto& name) { alive = false; return name; },
        [&] { return alive; }, [&](const auto&, const auto&) { assert(false); }));
    text.runs.clear();
    bool emptyRich = false;
    applyResolvedLabel(epoch, text, resolve, [] { return true; },
        [&](const auto&, const auto& runs) { emptyRich = runs.empty(); });
    assert(emptyRich);
    text.attributed = false;
    text.text = "plain after rich";
    applyResolvedLabel(epoch, text, resolve, [] { return true; },
        [&](const auto&, const auto& runs) { published = runs; });
    assert(published.size() == 1 && published[0].content == text.text);

    const auto root = overlayHitPolicy(true, true, false);
    const auto layout = overlayHitPolicy(root.passToChildren, true, false);
    const auto button = overlayHitPolicy(layout.passToChildren, true, true);
    const auto buttonChild = overlayHitPolicy(button.passToChildren, true, false);
    assert(root.mode == OverlayHitMode::None && layout.mode == OverlayHitMode::None);
    assert(button.mode == OverlayHitMode::BlockHierarchy && !button.passToChildren);
    assert(buttonChild.mode == OverlayHitMode::Default);
    const auto disabled = overlayHitPolicy(true, false, true);
    assert(disabled.mode == OverlayHitMode::BlockDescendants && disabled.passToChildren);
    // Removed action, reenabled control, root opt-out and reparent all use the
    // same pure decision as live nodes; no per-node sticky transparent state.
    assert(overlayHitPolicy(true, true, false).passToChildren);
    assert(overlayHitPolicy(true, true, true).mode == OverlayHitMode::BlockHierarchy);
    assert(overlayHitPolicy(false, true, true).mode == OverlayHitMode::Default);
    assert(overlayHitPolicy(false, false, false).mode == OverlayHitMode::BlockDescendants);
    assert(overlayInterceptMode(true, root.mode, false) == OverlayHitMode::BlockDescendants);
    assert(overlayInterceptMode(true, root.mode, true) == OverlayHitMode::None);
    assert(overlayInterceptMode(true, button.mode, false) == OverlayHitMode::BlockDescendants);
    assert(overlayInterceptMode(true, button.mode, true) == OverlayHitMode::BlockHierarchy);
    assert(!overlayInterceptMode(false, root.mode, true));
    std::cout << "label run inheritance/styles/font reentry/line metrics and scoped overlay hit policy passed\n";
}
