//
// VRNfcAvailability.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"


//
// VRNfcHandle.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"


//
// VRNfcHostEvents.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"


//
// VRNfcNativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"

@interface VRNfcNativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRNfcNativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNfcHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRNfcNativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRNfcNativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRNfcNativeModule class]);
}


//
// VRNfcNativeModuleFactory.m
//

#import "Nfc.h"


//
// VRNfcRecord.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"


//
// VRNfcTag.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"


//
// VRNfcHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "Nfc.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOOD_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, const void *, const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetPtr(fields[2]), SCValdiFieldValueGetDouble(fields[3]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOOOD_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(const void * p0, const void * p1, double p2) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakePtr(p1), SCValdiFieldValueMakeDouble(p2)));
    };
}

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


