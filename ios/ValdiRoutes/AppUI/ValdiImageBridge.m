#import "ValdiImageBridge.h"
#import <ValdiRuntime/SCValdiResolvablePromise.h>

@implementation ValdiImageBridge

+ (nullable SCValdiImage *)imageWithUIImage:(UIImage *)image
{
    static Class imageClass;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ imageClass = NSClassFromString(@"SCValdiImage"); });
    return [imageClass imageWithUIImage:image];
}

@end

@implementation ValdiVoidPromise

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
