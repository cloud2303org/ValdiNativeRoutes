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
// VRBlePage.m
//

#import <app_pages/app_pages.h>
#import <ValdiRuntime/SCValdiRuntimeProtocol.h>
#import <ValdiRuntime/SCValdiContextProtocol.h>
@implementation VRBlePage

+ (NSString *)componentPath
{
    return @"BlePage@app_pages/src/features/bluetooth/BlePage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"DetailPage@app_pages/src/features/detail/DetailPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"DevicePage@app_pages/src/features/device/DevicePage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"FormPage@app_pages/src/features/form/FormPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"HomePage@app_pages/src/features/home/HomePage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"InputCheckPage@app_pages/src/features/inputs/InputCheckPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"LoginPage@app_pages/src/features/auth/LoginPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"LottiePage@app_pages/src/features/lottie/LottiePage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"PresentationPage@app_pages/src/features/presentation/PresentationPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"RouteAnimationPage@app_pages/src/features/navigation/RouteAnimationPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"VideoPage@app_pages/src/features/video/VideoPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"VisionPage@app_pages/src/features/vision/VisionPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"WebViewPage@app_pages/src/features/webview/WebViewPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
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
    return @"WheelPage@app_pages/src/features/wheels/WheelPage";
}

- (instancetype)initWithViewModel:(NSDictionary<NSString *, id> *)viewModel componentContext:(NSDictionary<NSString *, id> *)componentContext runtime:(id<SCValdiRuntimeProtocol>)runtime
{
    return [super initWithViewModelUntyped:viewModel componentContextUntyped:componentContext runtime:runtime];
}

- (void)setViewModel:(NSDictionary<NSString *, id> *)viewModel
{
    self.valdiContext.viewModel = viewModel;
}

- (NSDictionary<NSString *, id> *)viewModel
{
    return self.valdiContext.viewModel;
}

@end


