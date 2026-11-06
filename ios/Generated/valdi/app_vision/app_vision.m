//
// VRVisionDemoResult.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_vision.h"


//
// VRVisionNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_vision.h"

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

#import "app_vision.h"


//
// VRVisionPrediction.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_vision.h"


//
// VRVisionHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "app_vision.h"

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


