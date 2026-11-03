// Included inside detail after Backend and before Node.
struct NativeWheel : std::enable_shared_from_this<NativeWheel> {
    struct Control;
    std::weak_ptr<Node> node;
    std::shared_ptr<Backend> backend;
    WheelKind kind;
    WheelState state;
    Ref<ValueFunction> onChange;
    std::vector<std::shared_ptr<Control>> controls;
    uint64_t generation = 0;
    bool retired = false, replacing = false;
    NativeWheel(const std::shared_ptr<Node>& owner, WheelKind kind);
    bool active() const;
    void configure(const Value& object);
    void replace(WheelState next);
    void activate();
    void stop(bool clear = false);
    void retire();
    void measure(int32_t width, int32_t height);
    void layout();
    void settled(const std::shared_ptr<Control>& control, size_t selected);
    void segment(const std::shared_ptr<Control>& control);
    static void event(ArkUI_NodeEvent* event) noexcept;
};

static void bindWheelAttributes(AttributesBindingContext& binder, const Ref<ViewAttributeHandlerDelegate>& delegate);
static bool wheelClass(const StringBox& name) {
    return name == "ArkUIColumnWheelView" || name == "ArkUITimeWheelView" || name == "ArkUITreeWheelView";
}
static WheelKind wheelKind(const StringBox& name) {
    return name == "ArkUITimeWheelView" ? WheelKind::Time :
           name == "ArkUITreeWheelView" ? WheelKind::Tree : WheelKind::Column;
}
