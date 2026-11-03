// A shared-library link with every Valdi object pulled in validates the archive closure.
extern "C" __attribute__((visibility("default"))) int valdi_runtime_ohos_build_probe() {
    return 99;
}
