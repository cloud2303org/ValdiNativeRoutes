#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCValdiPromise.h>
#import <ValdiRuntime/SCValdiUndefinedValue.h>
NS_ASSUME_NONNULL_BEGIN
@interface VRAppUIVoidPromise : NSObject

+ (SCValdiPromise<SCValdiUndefinedValue *> *)promiseWithStart:(void (^)(void (^settle)(NSString *_Nullable error)))start
    NS_SWIFT_NAME(make(_:));

@end

NS_ASSUME_NONNULL_END
