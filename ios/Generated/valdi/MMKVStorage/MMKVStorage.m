//
// VRMMKVNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "MMKVStorage.h"

@interface VRMMKVNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRMMKVNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRStorageHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRMMKVNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRMMKVNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRMMKVNativeModule class]);
}


//
// VRMMKVNativeModuleFactory.m
//

#import "MMKVStorage.h"


//
// VRStorageHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "MMKVStorage.h"


//
// VRStorageReadReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "MMKVStorage.h"


//
// VRStorageWriteRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "MMKVStorage.h"


