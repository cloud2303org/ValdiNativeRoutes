#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCNValdiCoreModuleFactory.h>

// The app registers this factory through SCValdiRuntime's public API.
FOUNDATION_EXPORT id<SCNValdiCoreModuleFactory> _Nonnull ValdiWebViewCreateModuleFactory(void);
