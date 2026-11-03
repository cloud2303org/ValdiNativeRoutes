#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCNValdiCoreModuleFactory.h>

// Explicit registration through SCValdiRuntime's public API. The exported
// runtime does not export the C functions used by VALDI_REGISTER_MODULE().
FOUNDATION_EXPORT id<SCNValdiCoreModuleFactory> _Nonnull CalculatorCreateModuleFactory(void);
