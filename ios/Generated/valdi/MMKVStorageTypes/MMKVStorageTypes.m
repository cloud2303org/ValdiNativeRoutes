//
// VRMMKVNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "MMKVStorageTypes.h"


//
// VRMMKVNativeModuleFactory.m
//

#import "MMKVStorageTypes.h"

@implementation VRMMKVNativeModuleFactory

- (id<VRMMKVNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"mmkv/src/MMKV";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRMMKVNativeModule);
}

@end

//
// VRStorageHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "MMKVStorageTypes.h"

@implementation VRStorageHost

@dynamic get;
@dynamic set;
@dynamic remove;
@dynamic clear;

- (instancetype _Nonnull)initWithGet:(VRStorageHostGetBlock _Nonnull)get set:(VRStorageHostSetBlock _Nonnull)set remove:(VRStorageHostRemoveBlock _Nonnull)remove clear:(VRStorageHostClearBlock _Nonnull)clear
{
    return [super initWithFieldValues:nil, get, set, remove, clear];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "get", .selName = nil, .type = "f(s): r:'[0]'"},
        {.name = "set", .selName = nil, .type = "f(r:'[1]'): b"},
        {.name = "remove", .selName = nil, .type = "f(s)"},
        {.name = "clear", .selName = nil, .type = "f()"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRStorageReadReply",
        "VRStorageWriteRequest",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRStorageReadReply.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "MMKVStorageTypes.h"

@implementation VRStorageReadReply

@dynamic found;
@dynamic value;

- (instancetype _Nonnull)initWithFound:(BOOL)found value:(NSString * _Nonnull)value
{
    return [super initWithFieldValues:nil, found, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "found", .selName = nil, .type = "b"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRStorageWriteRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "MMKVStorageTypes.h"

@implementation VRStorageWriteRequest

@dynamic key;
@dynamic value;

- (instancetype _Nonnull)initWithKey:(NSString * _Nonnull)key value:(NSString * _Nonnull)value
{
    return [super initWithFieldValues:nil, key, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "key", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


