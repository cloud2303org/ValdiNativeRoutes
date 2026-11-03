#include "ClientSQLNativeModuleFactory.hpp"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"

// Forces the exact integration constructor/registration and generated ABI into
// the shared proof library. Not invoked by the cross-build.
extern "C" __attribute__((visibility("default")))
void valdi_clientsql_ohos_registration_build_probe() {
    Valdi::ModuleFactoryRegistry::sharedInstance()->registerModuleFactory(
        std::make_shared<Valdi::ClientSQLNativeModuleFactory>());
}
