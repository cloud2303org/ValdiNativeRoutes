//
// VRAppContextNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"

@interface VRAppContextNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRAppContextNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRAppContextHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAppContextNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAppContextNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAppContextNativeModule class]);
}


//
// VRAppContextNativeModuleFactory.m
//

#import "app_foundation.h"


//
// VRNavigationHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRPageContext.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRPageInsets.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRPageViewModel.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRRequestInitialContentDraw.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_foundation.h"

@implementation VRRequestInitialContentDraw

+ (NSString *)modulePath
{
    return @"app_foundation/src/splash/InitialContentDraw";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (BOOL)requestInitialContentDrawWithContextId:(NSString * _Nonnull)contextId ready:(VRRequestInitialContentDrawReadyBlock _Nonnull)ready{
    VRRequestInitialContentDrawBlock callBlock = (VRRequestInitialContentDrawBlock)self.callBlock;
    return callBlock(contextId, ready);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider contextId:(NSString * _Nonnull)contextId ready:(VRRequestInitialContentDrawReadyBlock _Nonnull)ready completionHandler:(void (^ _Nonnull)(BOOL))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRRequestInitialContentDraw *function = [VRRequestInitialContentDraw functionWithJSRuntime:runtime];
        VRRequestInitialContentDrawBlock callBlock = (VRRequestInitialContentDrawBlock)function.callBlock;
        BOOL result = callBlock(contextId, ready);
        completionHandler(result);
    } attribution:@"generated.invokeWithJSRuntime:app_foundation/src/splash/InitialContentDraw#requestInitialContentDraw"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "requestInitialContentDraw", .selName = nil, .type = "f(s, f()): b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRResolvedNavigation.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRRouteDeclaration.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRRouteEntry.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRRouteTab.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRRouteTabBar.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRSplashScreenNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"

@interface VRSplashScreenNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRSplashScreenNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRSplashScreenHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRSplashScreenNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRSplashScreenNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRSplashScreenNativeModule class]);
}


//
// VRSplashScreenNativeModuleFactory.m
//

#import "app_foundation.h"


//
// VRStackPage.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"


//
// VRAppContextHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"

@interface VRAppContextHost: SCValdiProxyMarshallableObject

@end

@implementation VRAppContextHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getNavigationHost", .selName = "getNavigationHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNavigationHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAppContextHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAppContextHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAppContextHost class]);
}


//
// VRSplashScreenHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_foundation.h"

@interface VRSplashScreenHost: SCValdiProxyMarshallableObject

@end

@implementation VRSplashScreenHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "preventAutoHide", .selName = "preventAutoHide", .type = "f|m|(): b"},
        {.name = "hide", .selName = "hide", .type = "f|m|()"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRSplashScreenHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRSplashScreenHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRSplashScreenHost class]);
}


