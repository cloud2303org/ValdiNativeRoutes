#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCValdiVideoLoader.h>
#import <AppVideoTypes/AppVideoTypes.h>

NS_ASSUME_NONNULL_BEGIN

/// App-owned scope. The runtime's loader and generated module factory retain this same object.
/// Construct and register on main; every generated host operation dispatches asynchronously to main.
@interface VRVideoService : NSObject <VRVideoHost, SCValdiVideoLoader>

/// Generated registration constructs factories with init, so inject this service only for that
/// synchronous registration scope. There is no process-wide session store or runtime lookup.
- (void)registerModules:(NS_NOESCAPE dispatch_block_t)registration;
+ (VRVideoService *)registrationService;

@end

NS_ASSUME_NONNULL_END
