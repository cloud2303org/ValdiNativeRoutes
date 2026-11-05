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
// VRInstallVisionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallVisionHost

+ (NSString *)modulePath
{
    return @"app_pages/src/vision/VisionHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installVisionHostWithHost:(id<VRVisionHost> _Nonnull)host{
    VRInstallVisionHostBlock callBlock = (VRInstallVisionHostBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(id<VRVisionHost> _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallVisionHost *function = [VRInstallVisionHost functionWithJSRuntime:runtime];
        VRInstallVisionHostBlock callBlock = (VRInstallVisionHostBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/vision/VisionHost#installVisionHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installVisionHost", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRVisionHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


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

static SCValdiFieldValue SCValdiFunctionInvokeOBOO_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, BOOL, const void *, const void * ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetBool(fields[1]), SCValdiFieldValueGetPtr(fields[2]), SCValdiFieldValueGetPtr(fields[3]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOBOO_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(BOOL p0, const void * p1, const void * p2) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakeBool(p0), SCValdiFieldValueMakePtr(p1), SCValdiFieldValueMakePtr(p2)));
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
- (VRRouteDeclaration * _Nonnull)startAppWithDebug:(BOOL)debug navigation:(VRNavigationHost * _Nonnull)navigation tokens:(VRTokenStore * _Nonnull)tokens{
    VRStartAppBlock callBlock = (VRStartAppBlock)self.callBlock;
    return callBlock(debug, navigation, tokens);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider debug:(BOOL)debug navigation:(VRNavigationHost * _Nonnull)navigation tokens:(VRTokenStore * _Nonnull)tokens completionHandler:(void (^ _Nonnull)(VRRouteDeclaration * _Nonnull))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRStartApp *function = [VRStartApp functionWithJSRuntime:runtime];
        VRStartAppBlock callBlock = (VRStartAppBlock)function.callBlock;
        VRRouteDeclaration * _Nonnull result = callBlock(debug, navigation, tokens);
        completionHandler(result);
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/app#startApp"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oboo:o", .invoker = &SCValdiFunctionInvokeOBOO_o, .factory = &SCValdiBlockCreateOBOO_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "startApp", .selName = nil, .type = "f(b, r:'[0]', r:'[1]'): r:'[2]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNavigationHost",
        "VRTokenStore",
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


