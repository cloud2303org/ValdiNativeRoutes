//
// VROtaInfo.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_ota.h"


//
// VROtaNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_ota.h"

@interface VROtaNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VROtaNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VROtaHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VROtaNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VROtaNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VROtaNativeModule class]);
}


//
// VROtaNativeModuleFactory.m
//

#import "app_ota.h"


//
// VROtaHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_ota.h"

@interface VROtaHost: SCValdiProxyMarshallableObject

@end

@implementation VROtaHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getInfo", .selName = "getInfo", .type = "f|m|(): p<r:'[0]'>"},
        {.name = "checkForUpdate", .selName = "checkForUpdate", .type = "f|m|(): p<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VROtaInfo",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VROtaHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VROtaHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VROtaHost class]);
}


