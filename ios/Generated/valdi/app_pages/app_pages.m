//
// VRAndroidSplashScreenNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRAndroidSplashScreenNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRAndroidSplashScreenNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRAndroidSplashScreenHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAndroidSplashScreenNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAndroidSplashScreenNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAndroidSplashScreenNativeModule class]);
}


//
// VRAndroidSplashScreenNativeModuleFactory.m
//

#import "app_pages.h"


//
// VRAppContextNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

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

#import "app_pages.h"


//
// VRColumnWheelConfig.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRCpp.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRCpp: SCValdiProxyMarshallableObject

@end

@implementation VRCpp

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "BUILD_INFO", .selName = nil, .type = "s"},
        {.name = "sha256", .selName = "sha256WithText:", .type = "f|m|(s): s"},
        {.name = "stats", .selName = "statsWithValues:", .type = "f|m|(a<d@>): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRCppStats",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRCppMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRCpp> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRCpp class]);
}


//
// VRCppFactory.m
//

#import "app_pages.h"


//
// VRCppStats.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNavigationHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPageContext.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPageInsets.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPageViewModel.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRRequestInitialContentDraw.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRRequestInitialContentDraw

+ (NSString *)modulePath
{
    return @"app_pages/src/splash/InitialContentDraw";
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
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/splash/InitialContentDraw#requestInitialContentDraw"];
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

#import "app_pages.h"


//
// VRRouteDeclaration.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRRouteEntry.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRRouteTab.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRRouteTabBar.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRStackPage.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRStartApp.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

static SCValdiFieldValue SCValdiFunctionInvokeOB_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, BOOL ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetBool(fields[1]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOB_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(BOOL p0) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakeBool(p0)));
    };
}

@implementation VRStartApp

+ (NSString *)modulePath
{
    return @"app_pages/src/app";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (VRRouteDeclaration * _Nonnull)startAppWithDebug:(BOOL)debug{
    VRStartAppBlock callBlock = (VRStartAppBlock)self.callBlock;
    return callBlock(debug);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider debug:(BOOL)debug completionHandler:(void (^ _Nonnull)(VRRouteDeclaration * _Nonnull))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRStartApp *function = [VRStartApp functionWithJSRuntime:runtime];
        VRStartAppBlock callBlock = (VRStartAppBlock)function.callBlock;
        VRRouteDeclaration * _Nonnull result = callBlock(debug);
        completionHandler(result);
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/app#startApp"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "ob:o", .invoker = &SCValdiFunctionInvokeOB_o, .factory = &SCValdiBlockCreateOB_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "startApp", .selName = nil, .type = "f(b): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRRouteDeclaration",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRTabBarContext.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRTabBarViewModel.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRTimeWheelConfig.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRTokenStore.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRTreeWheelConfig.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRVisionDemoResult.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRVisionNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRVisionNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRVisionNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRVisionHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRVisionNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRVisionNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRVisionNativeModule class]);
}


//
// VRVisionNativeModuleFactory.m
//

#import "app_pages.h"


//
// VRVisionPrediction.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRWheelTreeNode.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRAndroidSplashScreenHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRAndroidSplashScreenHost: SCValdiProxyMarshallableObject

@end

@implementation VRAndroidSplashScreenHost

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

NSInteger VRAndroidSplashScreenHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAndroidSplashScreenHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAndroidSplashScreenHost class]);
}


//
// VRAppContextHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRAppContextHost: SCValdiProxyMarshallableObject

@end

@implementation VRAppContextHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getNavigationHost", .selName = "getNavigationHost", .type = "f|m|(): r:'[0]'"},
        {.name = "getTokenStore", .selName = "getTokenStore", .type = "f|m|(): r:'[1]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNavigationHost",
        "VRTokenStore",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAppContextHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAppContextHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAppContextHost class]);
}


//
// VRVisionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRVisionHost: SCValdiProxyMarshallableObject

@end

@implementation VRVisionHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "runDemo", .selName = "runDemoWithDone:", .type = "f|m|(f(s, r?:'[0]'))"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRVisionDemoResult",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRVisionHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRVisionHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRVisionHost class]);
}


//
// VRBlePage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRBlePage

+ (NSString *)componentPath
{
    return @"BlePage@app_pages/src/BlePage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRDetailPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRDetailPage

+ (NSString *)componentPath
{
    return @"DetailPage@app_pages/src/DetailPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRDevicePage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRDevicePage

+ (NSString *)componentPath
{
    return @"DevicePage@app_pages/src/DevicePage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRFormPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRFormPage

+ (NSString *)componentPath
{
    return @"FormPage@app_pages/src/FormPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRHomePage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRHomePage

+ (NSString *)componentPath
{
    return @"HomePage@app_pages/src/HomePage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRInputCheckPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRInputCheckPage

+ (NSString *)componentPath
{
    return @"InputCheckPage@app_pages/src/InputCheckPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRLoginPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRLoginPage

+ (NSString *)componentPath
{
    return @"LoginPage@app_pages/src/LoginPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRLottiePage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRLottiePage

+ (NSString *)componentPath
{
    return @"LottiePage@app_pages/src/LottiePage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRPresentationPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRPresentationPage

+ (NSString *)componentPath
{
    return @"PresentationPage@app_pages/src/PresentationPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRRouteAnimationPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRRouteAnimationPage

+ (NSString *)componentPath
{
    return @"RouteAnimationPage@app_pages/src/RouteAnimationPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRVideoPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRVideoPage

+ (NSString *)componentPath
{
    return @"VideoPage@app_pages/src/VideoPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRVisionPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRVisionPage

+ (NSString *)componentPath
{
    return @"VisionPage@app_pages/src/VisionPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRWebViewPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRWebViewPage

+ (NSString *)componentPath
{
    return @"WebViewPage@app_pages/src/WebViewPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


//
// VRWheelPage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRWheelPage

+ (NSString *)componentPath
{
    return @"WheelPage@app_pages/src/WheelPage";
}

- (instancetype)initWithViewModel:(VRPageViewModel *)viewModel componentContext:(VRPageContext *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(VRPageViewModel *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (VRPageViewModel *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


