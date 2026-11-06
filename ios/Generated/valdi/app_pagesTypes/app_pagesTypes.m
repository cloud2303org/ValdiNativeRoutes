//
// VRAndroidSplashScreenNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRAndroidSplashScreenNativeModuleFactory.m
//

#import "app_pagesTypes.h"

@implementation VRAndroidSplashScreenNativeModuleFactory

- (id<VRAndroidSplashScreenNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_pages/src/splash/SplashScreenNative";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRAndroidSplashScreenNativeModule);
}

@end

//
// VRAppContextNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRAppContextNativeModuleFactory.m
//

#import "app_pagesTypes.h"

@implementation VRAppContextNativeModuleFactory

- (id<VRAppContextNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_pages/src/AppContext";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRAppContextNativeModule);
}

@end

//
// VRColumnWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRColumnWheelConfig

@dynamic options;
@dynamic value;

- (instancetype _Nonnull)initWithOptions:(NSArray<VRPickerOption *> * _Nonnull)options value:(NSString * _Nonnull)value
{
    return [super initWithFieldValues:nil, options, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "options", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPickerOption",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


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
// VRNavigationHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOB_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, const void *, BOOL ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetBool(fields[2]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOOB_v(SCValdiBlockTrampoline trampoline) {
    return ^void(const void * p0, BOOL p1) {
        trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakeBool(p1));
    };
}

static SCValdiFieldValue SCValdiFunctionInvokeOD_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetDouble(fields[1]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOD_v(SCValdiBlockTrampoline trampoline) {
    return ^void(double p0) {
        trampoline(nil, SCValdiFieldValueMakeDouble(p0));
    };
}

@implementation VRNavigationHost

@dynamic push;
@dynamic pushForResult;
@dynamic replace;
@dynamic back;
@dynamic popToRoot;
@dynamic reset;
@dynamic switchTab;
@dynamic setStatusBarStyle;
@dynamic currentPages;
@dynamic updateRoutes;

- (instancetype _Nonnull)initWithPush:(VRNavigationHostPushBlock _Nonnull)push pushForResult:(VRNavigationHostPushForResultBlock _Nonnull)pushForResult replace:(VRNavigationHostReplaceBlock _Nonnull)replace back:(VRNavigationHostBackBlock _Nonnull)back popToRoot:(VRNavigationHostPopToRootBlock _Nonnull)popToRoot reset:(VRNavigationHostResetBlock _Nonnull)reset switchTab:(VRNavigationHostSwitchTabBlock _Nonnull)switchTab setStatusBarStyle:(VRNavigationHostSetStatusBarStyleBlock _Nonnull)setStatusBarStyle currentPages:(VRNavigationHostCurrentPagesBlock _Nonnull)currentPages updateRoutes:(VRNavigationHostUpdateRoutesBlock _Nonnull)updateRoutes
{
    return [super initWithFieldValues:nil, push, pushForResult, replace, back, popToRoot, reset, switchTab, setStatusBarStyle, currentPages, updateRoutes];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oob:v", .invoker = &SCValdiFunctionInvokeOOB_v, .factory = &SCValdiBlockCreateOOB_v },
        { .typeEncoding = "od:v", .invoker = &SCValdiFunctionInvokeOD_v, .factory = &SCValdiBlockCreateOD_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "push", .selName = nil, .type = "f(s, m<s,u>, r:'[0]')"},
        {.name = "pushForResult", .selName = nil, .type = "f(s, m<s,u>, r:'[0]', f(m<s,u>, b))"},
        {.name = "replace", .selName = nil, .type = "f(s, m<s,u>, r:'[0]')"},
        {.name = "back", .selName = nil, .type = "f(d)"},
        {.name = "popToRoot", .selName = nil, .type = "f()"},
        {.name = "reset", .selName = nil, .type = "f(s, m<s,u>)"},
        {.name = "switchTab", .selName = nil, .type = "f(s)"},
        {.name = "setStatusBarStyle", .selName = nil, .type = "f(s)"},
        {.name = "currentPages", .selName = nil, .type = "f(f(a<r:'[1]'>))"},
        {.name = "updateRoutes", .selName = nil, .type = "f(r:'[2]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRResolvedNavigation",
        "VRStackPage",
        "VRRouteDeclaration",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRPageContext.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPageContext

@dynamic finish;
@dynamic back;

- (instancetype _Nonnull)initWithFinish:(VRPageContextFinishBlock _Nonnull)finish back:(VRPageContextBackBlock _Nonnull)back
{
    return [super initWithFieldValues:nil, finish, back];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "finish", .selName = nil, .type = "f(m<s,u>)"},
        {.name = "back", .selName = nil, .type = "f()"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRPageInsets.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPageInsets

@dynamic top;
@dynamic bottom;
@dynamic left;
@dynamic right;

- (instancetype _Nonnull)initWithTop:(double)top bottom:(double)bottom left:(double)left right:(double)right
{
    return [super initWithFieldValues:nil, top, bottom, left, right];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "top", .selName = nil, .type = "d"},
        {.name = "bottom", .selName = nil, .type = "d"},
        {.name = "left", .selName = nil, .type = "d"},
        {.name = "right", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRPageViewModel.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPageViewModel

@dynamic pageId;
@dynamic route;
@dynamic params;
@dynamic presentation;
@dynamic insets;
@dynamic visible;
@dynamic visibilityReason;

- (instancetype _Nonnull)initWithPageId:(NSString * _Nonnull)pageId route:(NSString * _Nonnull)route params:(NSDictionary <NSString *, id> * _Nonnull)params presentation:(NSString * _Nonnull)presentation insets:(VRPageInsets * _Nonnull)insets visible:(BOOL)visible visibilityReason:(NSString * _Nonnull)visibilityReason
{
    return [super initWithFieldValues:nil, pageId, route, params, presentation, insets, visible, visibilityReason];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "pageId", .selName = nil, .type = "s"},
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "params", .selName = nil, .type = "m<s,u>"},
        {.name = "presentation", .selName = nil, .type = "s"},
        {.name = "insets", .selName = nil, .type = "r:'[0]'"},
        {.name = "visible", .selName = nil, .type = "b"},
        {.name = "visibilityReason", .selName = nil, .type = "s"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRPageInsets",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRRequestInitialContentDraw.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRResolvedNavigation.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRResolvedNavigation

@dynamic animation;
@dynamic durationMs;
@dynamic presentation;

- (instancetype _Nonnull)initWithAnimation:(NSString * _Nonnull)animation durationMs:(double)durationMs presentation:(NSString * _Nonnull)presentation
{
    return [super initWithFieldValues:nil, animation, durationMs, presentation];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "animation", .selName = nil, .type = "s"},
        {.name = "durationMs", .selName = nil, .type = "d"},
        {.name = "presentation", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRRouteDeclaration.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRRouteDeclaration

@dynamic routes;
@dynamic tabBar;
@dynamic root;

- (instancetype _Nonnull)initWithRoutes:(NSArray<VRRouteEntry *> * _Nonnull)routes root:(NSString * _Nonnull)root
{
    return [super initWithFieldValues:nil, routes, nil, root];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "routes", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "tabBar", .selName = nil, .type = "r?:'[1]'"},
        {.name = "root", .selName = nil, .type = "s"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRRouteEntry",
        "VRRouteTabBar",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRRouteEntry.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRRouteEntry

@dynamic route;
@dynamic kind;
@dynamic title;
@dynamic component;
@dynamic nativeName;

- (instancetype _Nonnull)initWithRoute:(NSString * _Nonnull)route kind:(NSString * _Nonnull)kind title:(NSString * _Nonnull)title
{
    return [super initWithFieldValues:nil, route, kind, title, nil, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "kind", .selName = nil, .type = "s"},
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "component", .selName = nil, .type = "s?"},
        {.name = "nativeName", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRRouteTab.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRRouteTab

@dynamic route;
@dynamic text;
@dynamic icon;
@dynamic selectedIcon;
@dynamic iconData;
@dynamic selectedIconData;

- (instancetype _Nonnull)initWithRoute:(NSString * _Nonnull)route text:(NSString * _Nonnull)text icon:(NSString * _Nonnull)icon selectedIcon:(NSString * _Nonnull)selectedIcon
{
    return [super initWithFieldValues:nil, route, text, icon, selectedIcon, nil, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "text", .selName = nil, .type = "s"},
        {.name = "icon", .selName = nil, .type = "s"},
        {.name = "selectedIcon", .selName = nil, .type = "s"},
        {.name = "iconData", .selName = nil, .type = "s?"},
        {.name = "selectedIconData", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRRouteTabBar.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRRouteTabBar

@dynamic route;
@dynamic initial;
@dynamic tabs;
@dynamic mode;
@dynamic component;

- (instancetype _Nonnull)initWithRoute:(NSString * _Nonnull)route initial:(NSString * _Nonnull)initial tabs:(NSArray<VRRouteTab *> * _Nonnull)tabs
{
    return [super initWithFieldValues:nil, route, initial, tabs, nil, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "initial", .selName = nil, .type = "s"},
        {.name = "tabs", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "mode", .selName = nil, .type = "s?"},
        {.name = "component", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRRouteTab",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRStackPage.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRStackPage

@dynamic pageId;
@dynamic route;
@dynamic params;

- (instancetype _Nonnull)initWithPageId:(NSString * _Nonnull)pageId route:(NSString * _Nonnull)route params:(NSDictionary <NSString *, id> * _Nonnull)params
{
    return [super initWithFieldValues:nil, pageId, route, params];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "pageId", .selName = nil, .type = "s"},
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "params", .selName = nil, .type = "m<s,u>"},
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


//
// VRTimeWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRTimeWheelConfig

@dynamic mode;
@dynamic value;
@dynamic minYear;
@dynamic maxYear;

- (instancetype _Nonnull)initWithMode:(NSString * _Nonnull)mode value:(NSString * _Nonnull)value minYear:(double)minYear maxYear:(double)maxYear
{
    return [super initWithFieldValues:nil, mode, value, minYear, maxYear];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "mode", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "minYear", .selName = nil, .type = "d"},
        {.name = "maxYear", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRTokenStore.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRTokenStore

@dynamic has;
@dynamic read;
@dynamic write;
@dynamic clear;

- (instancetype _Nonnull)initWithHas:(VRTokenStoreHasBlock _Nonnull)has read:(VRTokenStoreReadBlock _Nonnull)read write:(VRTokenStoreWriteBlock _Nonnull)write clear:(VRTokenStoreClearBlock _Nonnull)clear
{
    return [super initWithFieldValues:nil, has, read, write, clear];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "has", .selName = nil, .type = "f(): b"},
        {.name = "read", .selName = nil, .type = "f(): s"},
        {.name = "write", .selName = nil, .type = "f(s)"},
        {.name = "clear", .selName = nil, .type = "f()"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRTreeWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRTreeWheelConfig

@dynamic data;
@dynamic value;
@dynamic columns;

- (instancetype _Nonnull)initWithData:(NSArray<VRWheelTreeNode *> * _Nonnull)data value:(NSArray<NSString *> * _Nonnull)value columns:(double)columns
{
    return [super initWithFieldValues:nil, data, value, columns];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "data", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "value", .selName = nil, .type = "a<s>"},
        {.name = "columns", .selName = nil, .type = "d"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWheelTreeNode",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRVisionDemoResult.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRVisionDemoResult

@dynamic opencvVersion;
@dynamic ncnnVersion;
@dynamic modelName;
@dynamic modelDescription;
@dynamic processingMs;
@dynamic inferenceMs;
@dynamic width;
@dynamic height;
@dynamic inferenceWidth;
@dynamic inferenceHeight;
@dynamic edgePixelCount;
@dynamic inputImageUrl;
@dynamic edgeImageUrl;
@dynamic predictions;

- (instancetype _Nonnull)initWithOpencvVersion:(NSString * _Nonnull)opencvVersion ncnnVersion:(NSString * _Nonnull)ncnnVersion modelName:(NSString * _Nonnull)modelName modelDescription:(NSString * _Nonnull)modelDescription processingMs:(double)processingMs inferenceMs:(double)inferenceMs width:(double)width height:(double)height inferenceWidth:(double)inferenceWidth inferenceHeight:(double)inferenceHeight edgePixelCount:(double)edgePixelCount inputImageUrl:(NSString * _Nonnull)inputImageUrl edgeImageUrl:(NSString * _Nonnull)edgeImageUrl predictions:(NSArray<VRVisionPrediction *> * _Nonnull)predictions
{
    return [super initWithFieldValues:nil, opencvVersion, ncnnVersion, modelName, modelDescription, processingMs, inferenceMs, width, height, inferenceWidth, inferenceHeight, edgePixelCount, inputImageUrl, edgeImageUrl, predictions];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "opencvVersion", .selName = nil, .type = "s"},
        {.name = "ncnnVersion", .selName = nil, .type = "s"},
        {.name = "modelName", .selName = nil, .type = "s"},
        {.name = "modelDescription", .selName = nil, .type = "s"},
        {.name = "processingMs", .selName = nil, .type = "d"},
        {.name = "inferenceMs", .selName = nil, .type = "d"},
        {.name = "width", .selName = nil, .type = "d"},
        {.name = "height", .selName = nil, .type = "d"},
        {.name = "inferenceWidth", .selName = nil, .type = "d"},
        {.name = "inferenceHeight", .selName = nil, .type = "d"},
        {.name = "edgePixelCount", .selName = nil, .type = "d"},
        {.name = "inputImageUrl", .selName = nil, .type = "s"},
        {.name = "edgeImageUrl", .selName = nil, .type = "s"},
        {.name = "predictions", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRVisionPrediction",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRVisionNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRVisionNativeModuleFactory.m
//

#import "app_pagesTypes.h"

@implementation VRVisionNativeModuleFactory

- (id<VRVisionNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_pages/src/vision/Vision";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRVisionNativeModule);
}

@end

//
// VRVisionPrediction.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRVisionPrediction

@dynamic label;
@dynamic score;

- (instancetype _Nonnull)initWithLabel:(NSString * _Nonnull)label score:(double)score
{
    return [super initWithFieldValues:nil, label, score];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "label", .selName = nil, .type = "s"},
        {.name = "score", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWheelTreeNode.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWheelTreeNode

@dynamic value;
@dynamic label;
@dynamic children;

- (instancetype _Nonnull)initWithValue:(NSString * _Nonnull)value label:(NSString * _Nonnull)label
{
    return [super initWithFieldValues:nil, value, label, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "label", .selName = nil, .type = "s"},
        {.name = "children", .selName = nil, .type = "a?<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWheelTreeNode",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRAndroidSplashScreenHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRAppContextHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRVisionHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


