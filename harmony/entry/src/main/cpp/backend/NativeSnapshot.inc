// Included inside detail, after Node/unwrap. Only capture touches ArkUI; the
// admitted worker owns a PixelMap and terminal gate, never a backend/dispatcher.
template<typename T, auto Release>
struct SnapshotOwner {
    T* value = nullptr;
    SnapshotOwner() = default;
    SnapshotOwner(const SnapshotOwner&) = delete;
    SnapshotOwner& operator=(const SnapshotOwner&) = delete;
    ~SnapshotOwner() { if (value) Release(value); }
};

struct SnapshotPixelmap {
    OH_PixelmapNative* value = nullptr;
    uint32_t width = 0, height = 0;
    ~SnapshotPixelmap() {
        if (value) OH_PixelmapNative_Destroy(&value);
    }
};

using SnapshotResult = Result<BytesView>;
struct SnapshotJob final : SnapshotRequest<SnapshotPixelmap, SnapshotResult> {
    using SnapshotRequest::SnapshotRequest;
};

static void finishSnapshots(const std::vector<std::weak_ptr<SnapshotJob>>& pending, const char* reason) {
    // Capture every accepted job before callbacks; cancellation cannot consume
    // a new snapshot created by a reentrant completion.
    std::vector<std::shared_ptr<SnapshotJob>> jobs;
    for (const auto& weak : pending) if (auto job = weak.lock()) jobs.push_back(std::move(job));
    for (const auto& job : jobs) job->complete(Error(reason));
}

static void cancelBackendSnapshots(Backend& backend) {
    // Keep weak entries for admission accounting until queued/running workers
    // release their jobs, including cancellation followed by immediate resume.
    const auto pending = backend.snapshots;
    finishSnapshots(pending, "Valdi ArkUI: snapshot canceled by suspension/shutdown");
}

static void cancelSubtreeSnapshots(Node& node) {
    std::vector<std::shared_ptr<Node>> nodes;
    // A Node destructor has no remaining shared owner, but still owns children.
    std::vector<std::weak_ptr<SnapshotJob>> pending = std::move(node.snapshots);
    nodes.insert(nodes.end(), node.children.begin(), node.children.end());
    for (size_t i = 0; i < nodes.size(); ++i) {
        auto& child = *nodes[i];
        pending.insert(pending.end(), child.snapshots.begin(), child.snapshots.end());
        child.snapshots.clear();
        const auto children = child.children;
        nodes.insert(nodes.end(), children.begin(), children.end());
    }
    finishSnapshots(pending, "Valdi ArkUI: snapshot source detached/disposed");
}

static void snapshotImageCheck(Image_ErrorCode code, const char* operation) {
    if (code != IMAGE_SUCCESS) {
        fail(std::string("snapshot ") + operation + " failed, SDK code " +
             std::to_string(static_cast<int32_t>(code)));
    }
}

static SnapshotResult encodeSnapshot(const std::shared_ptr<SnapshotPixelmap>& pixelmap,
                                     const std::shared_ptr<SnapshotJob>& job) {
    SnapshotOwner<OH_PackingOptions, OH_PackingOptions_Release> options;
    snapshotImageCheck(OH_PackingOptions_Create(&options.value), "create PNG options");
    if (!options.value) fail("snapshot returned null PNG options");
    char mime[] = "image/png";
    Image_MimeType format {mime, sizeof(mime) - 1};
    snapshotImageCheck(OH_PackingOptions_SetMimeType(options.value, &format), "set PNG MIME");
    snapshotImageCheck(OH_PackingOptions_SetQuality(options.value, 100), "set PNG quality");
    SnapshotOwner<OH_ImagePackerNative, OH_ImagePackerNative_Release> packer;
    snapshotImageCheck(OH_ImagePackerNative_Create(&packer.value), "create PNG packer");
    if (!packer.value) fail("snapshot returned null PNG packer");
    if (job->finished()) return Error("Valdi ArkUI: snapshot canceled");
    auto bytes = makeShared<Bytes>();
    bytes->resize(SnapshotBudget::maxPNGBytes);
    size_t size = bytes->size();
    snapshotImageCheck(OH_ImagePackerNative_PackToDataFromPixelmap(
        packer.value, options.value, pixelmap->value, bytes->data(), &size), "encode PNG");
    if (!size || size > bytes->size()) fail("snapshot PNG exceeds output budget");
    bytes->resize(size);
    return BytesView(bytes);
}

static void takeSnapshot(const std::shared_ptr<Backend>& backend, const Ref<View>& view,
                         Function<void(SnapshotResult)> completion) {
    auto job = std::make_shared<SnapshotJob>(
        [completion = std::move(completion)](SnapshotResult result) { completion(std::move(result)); });
    // The completion is outside try: user callback exceptions must never be
    // mistaken for a capture/dispatcher failure followed by another callback.
    std::optional<Error> error;
    try {
        backend->live();
        if (!backend->configuration.dispatchWorker) fail("snapshots require dispatchWorker");
        auto owner = unwrap(view);
        if (owner->backend != backend) fail("snapshot view belongs to another backend");
        if (!owner->imageCallbacksActive() || !owner->imageAttachmentEnabled) {
            fail("snapshot requires an attached, active rendered wrapper");
        }
        auto& requests = backend->snapshots;
        requests.erase(std::remove_if(requests.begin(), requests.end(),
            [](const auto& weak) { return weak.expired(); }), requests.end());
        if (requests.size() >= SnapshotBudget::maxRequests) fail("snapshot request budget exhausted");
        requests.emplace_back(job);
        owner->snapshots.erase(std::remove_if(owner->snapshots.begin(), owner->snapshots.end(),
            [](const auto& weak) { return weak.expired(); }), owner->snapshots.end());
        owner->snapshots.emplace_back(job);
        const auto size = backend->api->getMeasuredSize(owner->handle);
        if (size.width <= 0 || size.height <= 0 ||
            !SnapshotBudget::dimensions(size.width, size.height)) {
            fail("snapshot wrapper exceeds 4096 / 4-megapixel budget or is not rendered");
        }
        auto pixelmap = std::make_shared<SnapshotPixelmap>();
        SnapshotOwner<ArkUI_SnapshotOptions, OH_ArkUI_DestroySnapshotOptions> options;
        options.value = OH_ArkUI_CreateSnapshotOptions();
        if (!options.value) fail("cannot allocate snapshot options");
        check(OH_ArkUI_SnapshotOptions_SetScale(options.value, 1), "snapshot scale");
        check(OH_ArkUI_SnapshotOptions_SetColorMode(options.value, 4, false), "snapshot sRGB");
        check(OH_ArkUI_SnapshotOptions_SetDynamicRangeMode(
            options.value, ARKUI_DYNAMIC_RANGE_MODE_STANDARD, false), "snapshot SDR");
        check(OH_ArkUI_GetNodeSnapshot(owner->handle, options.value, &pixelmap->value), "capture native wrapper");
        if (job->finished()) return; // Capture may flush reentrant native callbacks.
        if (!pixelmap->value) fail("native snapshot returned null PixelMap");
        SnapshotOwner<OH_Pixelmap_ImageInfo, OH_PixelmapImageInfo_Release> info;
        snapshotImageCheck(OH_PixelmapImageInfo_Create(&info.value), "create image info");
        if (!info.value) fail("snapshot returned null image info");
        snapshotImageCheck(OH_PixelmapNative_GetImageInfo(pixelmap->value, info.value), "get image info");
        uint32_t stride = 0, allocation = 0;
        int32_t format = 0;
        snapshotImageCheck(OH_PixelmapImageInfo_GetWidth(info.value, &pixelmap->width), "get width");
        snapshotImageCheck(OH_PixelmapImageInfo_GetHeight(info.value, &pixelmap->height), "get height");
        snapshotImageCheck(OH_PixelmapImageInfo_GetRowStride(info.value, &stride), "get stride");
        snapshotImageCheck(OH_PixelmapImageInfo_GetPixelFormat(info.value, &format), "get pixel format");
        snapshotImageCheck(OH_PixelmapNative_GetAllocationByteCount(pixelmap->value, &allocation), "get allocation");
        if ((format != PIXEL_FORMAT_RGBA_8888 && format != PIXEL_FORMAT_BGRA_8888) ||
            !SnapshotBudget::layout(pixelmap->width, pixelmap->height, stride, allocation)) {
            fail("snapshot PixelMap exceeds 16 MiB RGBA/BGRA budget");
        }
        job->setResource(std::move(pixelmap));
        const auto uiThread = std::this_thread::get_id();
        bool accepted = backend->configuration.dispatchWorker([job, uiThread] {
            std::optional<SnapshotResult> result;
            try {
                if (job->finished()) return;
                if (std::this_thread::get_id() == uiThread) fail("dispatchWorker ran snapshot encoding on UI");
                auto pixelmap = job->takeResource();
                if (!pixelmap) return;
                result.emplace(encodeSnapshot(pixelmap, job));
            } catch (const std::exception& exception) {
                result.emplace(Error(exception.what()));
            } catch (...) {
                result.emplace(Error("Valdi ArkUI: snapshot encoder threw"));
            }
            job->complete(std::move(*result));
        });
        if (!accepted) error.emplace("Valdi ArkUI: snapshot worker rejected request");
    } catch (const std::exception& exception) {
        error.emplace(exception.what());
    } catch (...) {
        error.emplace("Valdi ArkUI: snapshot capture/dispatch threw");
    }
    if (error) job->complete(std::move(*error));
}
