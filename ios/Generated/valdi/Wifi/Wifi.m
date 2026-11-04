//
// VRWifiConnectParams.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"


//
// VRWifiCredential.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"


//
// VRWifiHostEvents.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"


//
// VRWifiInfo.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"


//
// VRWifiNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"

@interface VRWifiNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRWifiNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWifiHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRWifiNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRWifiNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRWifiNativeModule class]);
}


//
// VRWifiNativeModuleFactory.m
//

#import "Wifi.h"


//
// VRWifiPermissionState.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"


//
// VRWifiHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Wifi.h"

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


