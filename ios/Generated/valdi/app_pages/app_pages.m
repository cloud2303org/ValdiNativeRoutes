//
// VRActionSheetRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRAppUIHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRAttachmentAsset.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRAttachmentSelection.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleAdapterState.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleCharacteristic.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleCharacteristicProperties.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleCharacteristicValue.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleConnectStateChange.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleConnectedDevice.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleDevice.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleHostEvents.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleMTUChange.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleNotifyParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePairParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralAdvertisingParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralBeacon.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralCharacteristic.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralConnectionState.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralDescriptor.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralManufacturerData.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralPermissions.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralProperties.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralReadRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralService.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralSubscriptionEvent.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralWriteParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBlePeripheralWriteRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleReadParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleScanParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleService.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleServiceData.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleWriteParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBottomSheetRequest.m
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
// VRDatePickerRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRImagePreviewRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRInstallAppUI.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallAppUI

+ (NSString *)modulePath
{
    return @"app_pages/src/AppUIHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installAppUIWithHost:(VRAppUIHost * _Nonnull)host{
    VRInstallAppUIBlock callBlock = (VRInstallAppUIBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(VRAppUIHost * _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallAppUI *function = [VRInstallAppUI functionWithJSRuntime:runtime];
        VRInstallAppUIBlock callBlock = (VRInstallAppUIBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/AppUIHost#installAppUI"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installAppUI", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRAppUIHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRInstallBleHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallBleHost

+ (NSString *)modulePath
{
    return @"app_pages/src/ble/BleHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installBleHostWithHost:(id<VRBleHost> _Nonnull)host{
    VRInstallBleHostBlock callBlock = (VRInstallBleHostBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(id<VRBleHost> _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallBleHost *function = [VRInstallBleHost functionWithJSRuntime:runtime];
        VRInstallBleHostBlock callBlock = (VRInstallBleHostBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/ble/BleHost#installBleHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installBleHost", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBleHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRInstallNfcHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallNfcHost

+ (NSString *)modulePath
{
    return @"app_pages/src/nfc/NfcHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installNfcHostWithHost:(id<VRNfcHost> _Nonnull)host{
    VRInstallNfcHostBlock callBlock = (VRInstallNfcHostBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(id<VRNfcHost> _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallNfcHost *function = [VRInstallNfcHost functionWithJSRuntime:runtime];
        VRInstallNfcHostBlock callBlock = (VRInstallNfcHostBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/nfc/NfcHost#installNfcHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installNfcHost", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNfcHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRInstallPermissionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOD_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetDouble(fields[2]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOOD_v(SCValdiBlockTrampoline trampoline) {
    return ^void(const void * p0, double p1) {
        trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakeDouble(p1));
    };
}

@implementation VRInstallPermissionHost

+ (NSString *)modulePath
{
    return @"app_pages/src/permissions/PermissionHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installPermissionHostWithHost:(id<VRPermissionHost> _Nonnull)host androidSdk:(double)androidSdk{
    VRInstallPermissionHostBlock callBlock = (VRInstallPermissionHostBlock)self.callBlock;
    callBlock(host, androidSdk);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(id<VRPermissionHost> _Nonnull)host androidSdk:(double)androidSdk completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallPermissionHost *function = [VRInstallPermissionHost functionWithJSRuntime:runtime];
        VRInstallPermissionHostBlock callBlock = (VRInstallPermissionHostBlock)function.callBlock;
        callBlock(host, androidSdk);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/permissions/PermissionHost#installPermissionHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "ood:v", .invoker = &SCValdiFunctionInvokeOOD_v, .factory = &SCValdiBlockCreateOOD_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installPermissionHost", .selName = nil, .type = "f(r:'[0]', d)"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPermissionHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRInstallStorageHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallStorageHost

+ (NSString *)modulePath
{
    return @"app_pages/src/storage";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installStorageHostWithHost:(VRStorageHost * _Nonnull)host{
    VRInstallStorageHostBlock callBlock = (VRInstallStorageHostBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(VRStorageHost * _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallStorageHost *function = [VRInstallStorageHost functionWithJSRuntime:runtime];
        VRInstallStorageHostBlock callBlock = (VRInstallStorageHostBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/storage#installStorageHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installStorageHost", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRStorageHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


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
// VRInstallWifiHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

@implementation VRInstallWifiHost

+ (NSString *)modulePath
{
    return @"app_pages/src/wifi/WifiHost";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (void)installWifiHostWithHost:(id<VRWifiHost> _Nonnull)host{
    VRInstallWifiHostBlock callBlock = (VRInstallWifiHostBlock)self.callBlock;
    callBlock(host);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider host:(id<VRWifiHost> _Nonnull)host completionHandler:(void (^ _Nonnull)(void))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRInstallWifiHost *function = [VRInstallWifiHost functionWithJSRuntime:runtime];
        VRInstallWifiHostBlock callBlock = (VRInstallWifiHostBlock)function.callBlock;
        callBlock(host);
        completionHandler();
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/wifi/WifiHost#installWifiHost"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "installWifiHost", .selName = nil, .type = "f(r:'[0]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWifiHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRLoadingRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRModalReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRModalRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNavigationHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNfcAvailability.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNfcHandle.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNfcHostEvents.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNfcRecord.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRNfcTag.m
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
// VRPermissionGrant.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPickerOption.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPickerRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRPresentationReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRScanCodeReply.m
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
- (NSString * _Nonnull)startAppWithDebug:(BOOL)debug navigation:(VRNavigationHost * _Nonnull)navigation tokens:(VRTokenStore * _Nonnull)tokens{
    VRStartAppBlock callBlock = (VRStartAppBlock)self.callBlock;
    return callBlock(debug, navigation, tokens);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider debug:(BOOL)debug navigation:(VRNavigationHost * _Nonnull)navigation tokens:(VRTokenStore * _Nonnull)tokens completionHandler:(void (^ _Nonnull)(NSString * _Nonnull))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRStartApp *function = [VRStartApp functionWithJSRuntime:runtime];
        VRStartAppBlock callBlock = (VRStartAppBlock)function.callBlock;
        NSString * _Nonnull result = callBlock(debug, navigation, tokens);
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
        {.name = "startApp", .selName = nil, .type = "f(b, r:'[0]', r:'[1]'): s"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNavigationHost",
        "VRTokenStore",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeFunction);
}

@end


//
// VRStorageHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRToastRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRTokenStore.m
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
// VRWifiConnectParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRWifiCredential.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRWifiHostEvents.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRWifiInfo.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRWifiPermissionState.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"


//
// VRBleHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOOD_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, const void *, const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetPtr(fields[2]), SCValdiFieldValueGetDouble(fields[3]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOOOD_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(const void * p0, const void * p1, double p2) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakePtr(p1), SCValdiFieldValueMakeDouble(p2)));
    };
}

@interface VRBleHost: SCValdiProxyMarshallableObject

@end

@implementation VRBleHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oood:o", .invoker = &SCValdiFunctionInvokeOOOD_o, .factory = &SCValdiBlockCreateOOOD_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "setEvents", .selName = "setEventsWithEvents:", .type = "f|m|(r:'[0]')"},
        {.name = "openBluetoothAdapter", .selName = "openBluetoothAdapterWithMode:", .type = "f|m|(s?): p<v>"},
        {.name = "closeBluetoothAdapter", .selName = "closeBluetoothAdapter", .type = "f|m|(): p<v>"},
        {.name = "getBluetoothAdapterState", .selName = "getBluetoothAdapterState", .type = "f|m|(): p<r:'[1]'>"},
        {.name = "startBluetoothDevicesDiscovery", .selName = "startBluetoothDevicesDiscoveryWithParams:", .type = "f|m|(r:'[2]'): p<v>"},
        {.name = "startBluetoothDevicesDiscoveryWithNames", .selName = "startBluetoothDevicesDiscoveryWithNamesWithNames:", .type = "f|m|(a<s>): p<v>"},
        {.name = "startBluetoothDevicesDiscoveryWithAddresses", .selName = "startBluetoothDevicesDiscoveryWithAddressesWithAddresses:", .type = "f|m|(a<s>): p<v>"},
        {.name = "stopBluetoothDevicesDiscovery", .selName = "stopBluetoothDevicesDiscovery", .type = "f|m|(): p<v>"},
        {.name = "getBluetoothDevices", .selName = "getBluetoothDevices", .type = "f|m|(): p<a<r:'[3]'>>"},
        {.name = "createBLEConnection", .selName = "createBLEConnectionWithDeviceId:timeout:", .type = "f|m|(s, d@?): p<v>"},
        {.name = "closeBLEConnection", .selName = "closeBLEConnectionWithDeviceId:", .type = "f|m|(s): p<v>"},
        {.name = "makeBluetoothPair", .selName = "makeBluetoothPairWithParams:", .type = "f|m|(r:'[4]'): p<v>"},
        {.name = "isBluetoothDevicePaired", .selName = "isBluetoothDevicePairedWithDeviceId:", .type = "f|m|(s): p<v>"},
        {.name = "getBLEDeviceServices", .selName = "getBLEDeviceServicesWithDeviceId:", .type = "f|m|(s): p<a<r:'[5]'>>"},
        {.name = "getBLEDeviceRSSI", .selName = "getBLEDeviceRSSIWithDeviceId:", .type = "f|m|(s): p<d@>"},
        {.name = "getBLEDeviceCharacteristics", .selName = "getBLEDeviceCharacteristicsWithDeviceId:serviceId:", .type = "f|m|(s, s): p<a<r:'[6]'>>"},
        {.name = "notifyBLECharacteristicValueChange", .selName = "notifyBLECharacteristicValueChangeWithParams:", .type = "f|m|(r:'[7]'): p<v>"},
        {.name = "writeBLECharacteristicValue", .selName = "writeBLECharacteristicValueWithParams:", .type = "f|m|(r:'[8]'): p<v>"},
        {.name = "readBLECharacteristicValue", .selName = "readBLECharacteristicValueWithParams:", .type = "f|m|(r:'[9]'): p<v>"},
        {.name = "setBLEMTU", .selName = "setBLEMTUWithDeviceId:mtu:", .type = "f|m|(s, d): p<d@>"},
        {.name = "getBLEMTU", .selName = "getBLEMTUWithDeviceId:writeType:", .type = "f|m|(s, s?): p<d@>"},
        {.name = "getConnectedBluetoothDevices", .selName = "getConnectedBluetoothDevicesWithServices:", .type = "f|m|(a<s>): p<a<r:'[10]'>>"},
        {.name = "createBLEPeripheralServer", .selName = "createBLEPeripheralServer", .type = "f|m|(): p<s>"},
        {.name = "addPeripheralService", .selName = "addPeripheralServiceWithServerId:service:", .type = "f|m|(s, r:'[11]'): p<v>"},
        {.name = "removePeripheralService", .selName = "removePeripheralServiceWithServerId:serviceId:", .type = "f|m|(s, s): p<v>"},
        {.name = "startPeripheralAdvertising", .selName = "startPeripheralAdvertisingWithParams:", .type = "f|m|(r:'[12]'): p<v>"},
        {.name = "stopPeripheralAdvertising", .selName = "stopPeripheralAdvertisingWithServerId:", .type = "f|m|(s): p<v>"},
        {.name = "writePeripheralCharacteristicValue", .selName = "writePeripheralCharacteristicValueWithParams:", .type = "f|m|(r:'[13]'): p<v>"},
        {.name = "closeBLEPeripheralServer", .selName = "closeBLEPeripheralServerWithServerId:", .type = "f|m|(s): p<v>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBleHostEvents",
        "VRBleAdapterState",
        "VRBleScanParams",
        "VRBleDevice",
        "VRBlePairParams",
        "VRBleService",
        "VRBleCharacteristic",
        "VRBleNotifyParams",
        "VRBleWriteParams",
        "VRBleReadParams",
        "VRBleConnectedDevice",
        "VRBlePeripheralService",
        "VRBlePeripheralAdvertisingParams",
        "VRBlePeripheralWriteParams",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRBleHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRBleHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRBleHost class]);
}


//
// VRNfcHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"



static SCValdiFieldValue SCValdiFunctionInvokeOOOOOO_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, const void *, const void *, const void *, const void *, const void * ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetPtr(fields[2]), SCValdiFieldValueGetPtr(fields[3]), SCValdiFieldValueGetPtr(fields[4]), SCValdiFieldValueGetPtr(fields[5]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOOOOOO_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(const void * p0, const void * p1, const void * p2, const void * p3, const void * p4) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakePtr(p1), SCValdiFieldValueMakePtr(p2), SCValdiFieldValueMakePtr(p3), SCValdiFieldValueMakePtr(p4)));
    };
}

@interface VRNfcHost: SCValdiProxyMarshallableObject

@end

@implementation VRNfcHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oood:o", .invoker = &SCValdiFunctionInvokeOOOD_o, .factory = &SCValdiBlockCreateOOOD_o },
        { .typeEncoding = "oooooo:o", .invoker = &SCValdiFunctionInvokeOOOOOO_o, .factory = &SCValdiBlockCreateOOOOOO_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "setEvents", .selName = "setEventsWithEvents:", .type = "f|m|(r:'[0]')"},
        {.name = "getAvailability", .selName = "getAvailability", .type = "f|m|(): p<r:'[1]'>"},
        {.name = "startDiscovery", .selName = "startDiscovery", .type = "f|m|(): p<v>"},
        {.name = "stopDiscovery", .selName = "stopDiscovery", .type = "f|m|(): p<v>"},
        {.name = "connect", .selName = "connectWithHandle:", .type = "f|m|(r:'[2]'): p<v>"},
        {.name = "close", .selName = "closeWithHandle:", .type = "f|m|(r:'[2]'): p<v>"},
        {.name = "isConnected", .selName = "isConnectedWithHandle:", .type = "f|m|(r:'[2]'): p<b@>"},
        {.name = "transceive", .selName = "transceiveWithHandle:data:", .type = "f|m|(r:'[2]', t): p<t>"},
        {.name = "getMaxTransceiveLength", .selName = "getMaxTransceiveLengthWithHandle:", .type = "f|m|(r:'[2]'): p<d@>"},
        {.name = "setTimeout", .selName = "setTimeoutWithHandle:timeout:", .type = "f|m|(r:'[2]', d): p<v>"},
        {.name = "getAtqa", .selName = "getAtqaWithHandle:", .type = "f|m|(r:'[2]'): p<t>"},
        {.name = "getSak", .selName = "getSakWithHandle:", .type = "f|m|(r:'[2]'): p<d@>"},
        {.name = "getHistoricalBytes", .selName = "getHistoricalBytesWithHandle:", .type = "f|m|(r:'[2]'): p<t>"},
        {.name = "writeNdefMessage", .selName = "writeNdefMessageWithHandle:records:uris:texts:", .type = "f|m|(r:'[2]', a<r:'[3]'>, a<s>, a<s>): p<v>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNfcHostEvents",
        "VRNfcAvailability",
        "VRNfcHandle",
        "VRNfcRecord",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRNfcHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRNfcHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRNfcHost class]);
}


//
// VRPermissionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

@interface VRPermissionHost: SCValdiProxyMarshallableObject

@end

@implementation VRPermissionHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "check", .selName = "checkWithPermission:", .type = "f|m|(s): p<b@>"},
        {.name = "requestMultiple", .selName = "requestMultipleWithPermissions:", .type = "f|m|(a<s>): p<a<r:'[0]'>>"},
        {.name = "openSettings", .selName = "openSettings", .type = "f|m|(): p<v>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPermissionGrant",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRPermissionHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRPermissionHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRPermissionHost class]);
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
// VRWifiHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_pages.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOB_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, const void *, BOOL ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetBool(fields[2]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOOB_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(const void * p0, BOOL p1) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakeBool(p1)));
    };
}

@interface VRWifiHost: SCValdiProxyMarshallableObject

@end

@implementation VRWifiHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oob:o", .invoker = &SCValdiFunctionInvokeOOB_o, .factory = &SCValdiBlockCreateOOB_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "setEvents", .selName = "setEventsWithEvents:", .type = "f|m|(r:'[0]')"},
        {.name = "startWifi", .selName = "startWifi", .type = "f|m|(): p<v>"},
        {.name = "stopWifi", .selName = "stopWifi", .type = "f|m|(): p<v>"},
        {.name = "connectWifi", .selName = "connectWifiWithParams:", .type = "f|m|(r:'[1]'): p<r:'[2]'>"},
        {.name = "getWifiList", .selName = "getWifiList", .type = "f|m|(): p<v>"},
        {.name = "getConnectedWifi", .selName = "getConnectedWifiWithPartialInfo:", .type = "f|m|(b): p<r:'[2]'>"},
        {.name = "setWifiList", .selName = "setWifiListWithWifiList:", .type = "f|m|(a<r:'[3]'>): p<v>"},
        {.name = "getLocationPermissionState", .selName = "getLocationPermissionState", .type = "f|m|(): p<r:'[4]'>"},
        {.name = "requestLocationPermission", .selName = "requestLocationPermission", .type = "f|m|(): p<r:'[4]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWifiHostEvents",
        "VRWifiConnectParams",
        "VRWifiInfo",
        "VRWifiCredential",
        "VRWifiPermissionState",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRWifiHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRWifiHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRWifiHost class]);
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


