//
// VROtaInfo.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_otaTypes.h"

@implementation VROtaInfo

@dynamic enabled;
@dynamic appVersion;
@dynamic embeddedBundleVersion;
@dynamic bundleVersion;
@dynamic pendingBundleVersion;

- (instancetype _Nonnull)initWithEnabled:(BOOL)enabled appVersion:(NSString * _Nonnull)appVersion embeddedBundleVersion:(NSString * _Nonnull)embeddedBundleVersion bundleVersion:(NSString * _Nonnull)bundleVersion
{
    return [super initWithFieldValues:nil, enabled, appVersion, embeddedBundleVersion, bundleVersion, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "enabled", .selName = nil, .type = "b"},
        {.name = "appVersion", .selName = nil, .type = "s"},
        {.name = "embeddedBundleVersion", .selName = nil, .type = "s"},
        {.name = "bundleVersion", .selName = nil, .type = "s"},
        {.name = "pendingBundleVersion", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VROtaNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_otaTypes.h"


//
// VROtaNativeModuleFactory.m
//

#import "app_otaTypes.h"

@implementation VROtaNativeModuleFactory

- (id<VROtaNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_ota/src/Ota";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VROtaNativeModule);
}

@end

//
// VROtaHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_otaTypes.h"


