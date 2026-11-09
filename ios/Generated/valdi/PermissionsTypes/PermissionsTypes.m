//
// VRPermissionGrantResult.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "PermissionsTypes.h"

VRPermissionGrantResult VRPermissionGrantResultGranted = @"granted";
VRPermissionGrantResult VRPermissionGrantResultDenied = @"denied";
VRPermissionGrantResult VRPermissionGrantResultNeverAskAgain = @"never_ask_again";
VALDI_STRING_ENUM(VRPermissionGrantResult, VRPermissionGrantResultGranted, VRPermissionGrantResultDenied, VRPermissionGrantResultNeverAskAgain)
NSArray<NSString *> * _Nonnull VRPermissionGrantResultGetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[VRPermissionGrantResultGranted, VRPermissionGrantResultDenied, VRPermissionGrantResultNeverAskAgain];
    });
    return kAllCases;
}

//
// VRPermissionGrant.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "PermissionsTypes.h"

@implementation VRPermissionGrant

@dynamic permission;
@dynamic result;

- (instancetype _Nonnull)initWithPermission:(NSString * _Nonnull)permission result:(VRPermissionGrantResult _Nonnull)result
{
    return [super initWithFieldValues:nil, permission, result];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "permission", .selName = nil, .type = "s"},
        {.name = "result", .selName = nil, .type = "r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPermissionGrantResult",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
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


