//
// VRCpp.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRCppFactory.m
//

#import "app_pagesTypes.h"

@implementation VRCppFactory

- (id<VRCpp>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_pages/src/cpp/Cpp";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRCpp);
}

@end

//
// VRCppStats.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRCppStats

@dynamic count;
@dynamic mean;
@dynamic min;
@dynamic max;

- (instancetype _Nonnull)initWithCount:(double)count mean:(double)mean min:(double)min max:(double)max
{
    return [super initWithFieldValues:nil, count, mean, min, max];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "count", .selName = nil, .type = "d"},
        {.name = "mean", .selName = nil, .type = "d"},
        {.name = "min", .selName = nil, .type = "d"},
        {.name = "max", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRStartApp.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRTabBarContext.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRTabBarContext

@dynamic selectTab;

- (instancetype _Nonnull)initWithSelectTab:(VRTabBarContextSelectTabBlock _Nonnull)selectTab
{
    return [super initWithFieldValues:nil, selectTab];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "selectTab", .selName = nil, .type = "f(s)"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRTabBarViewModel.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRTabBarViewModel

@dynamic items;
@dynamic selectedRoute;
@dynamic safeAreaBottom;

- (instancetype _Nonnull)initWithItems:(NSArray<VRRouteTab *> * _Nonnull)items selectedRoute:(NSString * _Nonnull)selectedRoute safeAreaBottom:(double)safeAreaBottom
{
    return [super initWithFieldValues:nil, items, selectedRoute, safeAreaBottom];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "items", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "selectedRoute", .selName = nil, .type = "s"},
        {.name = "safeAreaBottom", .selName = nil, .type = "d"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRRouteTab",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


