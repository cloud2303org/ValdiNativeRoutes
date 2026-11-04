//
// VRPermissionGrant.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "PermissionsTypes.h"

@implementation VRPermissionGrant

@dynamic permission;
@dynamic result;

- (instancetype _Nonnull)initWithPermission:(NSString * _Nonnull)permission result:(NSString * _Nonnull)result
{
    return [super initWithFieldValues:nil, permission, result];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "permission", .selName = nil, .type = "s"},
        {.name = "result", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRPermissionsNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "PermissionsTypes.h"


//
// VRPermissionsNativeModuleFactory.m
//

#import "PermissionsTypes.h"

@implementation VRPermissionsNativeModuleFactory

- (id<VRPermissionsNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"permissions/src/Permissions";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRPermissionsNativeModule);
}

@end

//
// VRPermissionHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "PermissionsTypes.h"


