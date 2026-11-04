//
// VRPermissionGrant.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Permissions.h"


//
// VRPermissionsNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Permissions.h"

@interface VRPermissionsNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRPermissionsNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = "getAndroidSdk", .selName = "getAndroidSdk", .type = "f|m|(): d"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPermissionHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRPermissionsNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRPermissionsNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRPermissionsNativeModule class]);
}


//
// VRPermissionsNativeModuleFactory.m
//

#import "Permissions.h"


//
// VRPermissionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Permissions.h"

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


