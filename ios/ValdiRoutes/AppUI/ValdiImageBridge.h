#import <UIKit/UIKit.h>
#import <ValdiRuntime/SCValdiImage.h>
#import <ValdiRuntime/SCValdiPromise.h>
#import <ValdiRuntime/SCValdiUndefinedValue.h>

NS_ASSUME_NONNULL_BEGIN

/// Looks SCValdiImage's class up at runtime: written when the Valdi framework didn't export its class symbol, so Swift
/// couldn't name it. ValdiRuntime exports valdi_core's Objective-C API (valdi/.bazelrc); Swift could use it directly now.
@interface ValdiImageBridge : NSObject

+ (nullable SCValdiImage *)imageWithUIImage:(UIImage *)image;

@end

/// Promises of SCValdiUndefinedValue, which a host's Promise<void> resolves with: `start` gets `settle`, called once with
/// nil or an error. Made here because that class's symbol wasn't exported either, and Swift can't create a promise of a
/// class without its metadata; ValdiRuntime exports it now, so Swift could make them itself.
@interface ValdiVoidPromise : NSObject

+ (SCValdiPromise<SCValdiUndefinedValue *> *)promiseWithStart:(void (^)(void (^settle)(NSString *_Nullable error)))start
    NS_SWIFT_NAME(make(_:));

@end

NS_ASSUME_NONNULL_END
