// ValdiRuntime now contains both the official Swift marshaller and the native
// runtime. Re-export its Clang half throughout the App, preserving the existing
// SCValdi* call sites without changing each host implementation's imports.
@_exported import valdi_core
