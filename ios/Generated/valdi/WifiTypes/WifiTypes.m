//
// VRWifiConnectParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"

@implementation VRWifiConnectParams

@dynamic SSID;
@dynamic BSSID;
@dynamic password;
@dynamic maunal;
@dynamic partialInfo;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID BSSID:(NSString * _Nonnull)BSSID password:(NSString * _Nonnull)password maunal:(BOOL)maunal partialInfo:(BOOL)partialInfo
{
    return [super initWithFieldValues:nil, SSID, BSSID, password, maunal, partialInfo];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s"},
        {.name = "password", .selName = nil, .type = "s"},
        {.name = "maunal", .selName = nil, .type = "b"},
        {.name = "partialInfo", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiCredential.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"

@implementation VRWifiCredential

@dynamic SSID;
@dynamic BSSID;
@dynamic password;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID password:(NSString * _Nonnull)password
{
    return [super initWithFieldValues:nil, SSID, nil, password];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s?"},
        {.name = "password", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiHostEvents.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"

@implementation VRWifiHostEvents

@dynamic wifiConnected;
@dynamic wifiList;

- (instancetype _Nonnull)initWithWifiConnected:(VRWifiHostEventsWifiConnectedBlock _Nonnull)wifiConnected wifiList:(VRWifiHostEventsWifiListBlock _Nonnull)wifiList
{
    return [super initWithFieldValues:nil, wifiConnected, wifiList];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "wifiConnected", .selName = nil, .type = "f(r:'[0]')"},
        {.name = "wifiList", .selName = nil, .type = "f(a<r:'[0]'>)"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWifiInfo",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiInfo.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"

@implementation VRWifiInfo

@dynamic SSID;
@dynamic BSSID;
@dynamic secure;
@dynamic signalStrength;
@dynamic frequency;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID
{
    return [super initWithFieldValues:nil, SSID, nil, nil, nil, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s?"},
        {.name = "secure", .selName = nil, .type = "b@?"},
        {.name = "signalStrength", .selName = nil, .type = "d@?"},
        {.name = "frequency", .selName = nil, .type = "d@?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"


//
// VRWifiNativeModuleFactory.m
//

#import "WifiTypes.h"

@implementation VRWifiNativeModuleFactory

- (id<VRWifiNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"wifi/src/Wifi";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRWifiNativeModule);
}

@end

//
// VRWifiPermissionState.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"

@implementation VRWifiPermissionState

@dynamic status;
@dynamic canAskAgain;

- (instancetype _Nonnull)initWithStatus:(NSString * _Nonnull)status canAskAgain:(BOOL)canAskAgain
{
    return [super initWithFieldValues:nil, status, canAskAgain];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "status", .selName = nil, .type = "s"},
        {.name = "canAskAgain", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "WifiTypes.h"


