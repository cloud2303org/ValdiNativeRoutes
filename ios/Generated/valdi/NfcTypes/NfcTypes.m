//
// VRNfcAvailability.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"

@implementation VRNfcAvailability

@dynamic supported;
@dynamic enabled;
@dynamic foreground;
@dynamic permissionGranted;

- (instancetype _Nonnull)initWithSupported:(BOOL)supported enabled:(BOOL)enabled foreground:(BOOL)foreground permissionGranted:(BOOL)permissionGranted
{
    return [super initWithFieldValues:nil, supported, enabled, foreground, permissionGranted];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "supported", .selName = nil, .type = "b"},
        {.name = "enabled", .selName = nil, .type = "b"},
        {.name = "foreground", .selName = nil, .type = "b"},
        {.name = "permissionGranted", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRNfcHandle.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"

@implementation VRNfcHandle

@dynamic tagHandle;
@dynamic tech;

- (instancetype _Nonnull)initWithTagHandle:(NSString * _Nonnull)tagHandle tech:(NSString * _Nonnull)tech
{
    return [super initWithFieldValues:nil, tagHandle, tech];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "tagHandle", .selName = nil, .type = "s"},
        {.name = "tech", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRNfcHostEvents.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"

static SCValdiFieldValue SCValdiFunctionInvokeOB_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, BOOL ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetBool(fields[1]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOB_v(SCValdiBlockTrampoline trampoline) {
    return ^void(BOOL p0) {
        trampoline(nil, SCValdiFieldValueMakeBool(p0));
    };
}

@implementation VRNfcHostEvents

@dynamic discovered;
@dynamic discoveryStateChange;

- (instancetype _Nonnull)initWithDiscovered:(VRNfcHostEventsDiscoveredBlock _Nonnull)discovered discoveryStateChange:(VRNfcHostEventsDiscoveryStateChangeBlock _Nonnull)discoveryStateChange
{
    return [super initWithFieldValues:nil, discovered, discoveryStateChange];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "ob:v", .invoker = &SCValdiFunctionInvokeOB_v, .factory = &SCValdiBlockCreateOB_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "discovered", .selName = nil, .type = "f(r:'[0]')"},
        {.name = "discoveryStateChange", .selName = nil, .type = "f(b)"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNfcTag",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRNfcNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"


//
// VRNfcNativeModuleFactory.m
//

#import "NfcTypes.h"

@implementation VRNfcNativeModuleFactory

- (id<VRNfcNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"nfc/src/Nfc";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRNfcNativeModule);
}

@end

//
// VRNfcRecord.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"

@implementation VRNfcRecord

@dynamic id2;
@dynamic type;
@dynamic payload;
@dynamic tnf;

- (instancetype _Nonnull)initWithId2:(NSData * _Nonnull)id2 type:(NSData * _Nonnull)type payload:(NSData * _Nonnull)payload tnf:(double)tnf
{
    return [super initWithFieldValues:nil, id2, type, payload, tnf];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "id", .selName = "id2", .type = "t"},
        {.name = "type", .selName = nil, .type = "t"},
        {.name = "payload", .selName = nil, .type = "t"},
        {.name = "tnf", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRNfcTag.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"

@implementation VRNfcTag

@dynamic tagHandle;
@dynamic id2;
@dynamic techs;
@dynamic messages;

- (instancetype _Nonnull)initWithTagHandle:(NSString * _Nonnull)tagHandle id2:(NSData * _Nonnull)id2 techs:(NSArray<NSString *> * _Nonnull)techs messages:(NSArray<VRNfcRecord *> * _Nonnull)messages
{
    return [super initWithFieldValues:nil, tagHandle, id2, techs, messages];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "tagHandle", .selName = nil, .type = "s"},
        {.name = "id", .selName = "id2", .type = "t"},
        {.name = "techs", .selName = nil, .type = "a<s>"},
        {.name = "messages", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRNfcRecord",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRNfcHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "NfcTypes.h"


