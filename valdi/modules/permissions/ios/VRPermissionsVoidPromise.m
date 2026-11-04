#import "VRPermissionsVoidPromise.h"
#import <ValdiRuntime/SCValdiResolvablePromise.h>

@implementation VRPermissionsVoidPromise

+ (SCValdiPromise<SCValdiUndefinedValue *> *)promiseWithStart:(void (^)(void (^settle)(NSString *_Nullable error)))start
{
    static SCValdiUndefinedValue *undefined;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ undefined = [NSClassFromString(@"SCValdiUndefinedValue") undefined]; });
    SCValdiResolvablePromise<SCValdiUndefinedValue *> *promise = [SCValdiResolvablePromise new];
    start(^(NSString *_Nullable error) {
        if (error != nil) {
            [promise fulfillWithError:[NSError errorWithDomain:@"ValdiRoutes" code:0 userInfo:@{NSLocalizedDescriptionKey: error}]];
        } else {
            [promise fulfillWithSuccessValue:undefined];
        }
    });
    return promise;
}

@end
