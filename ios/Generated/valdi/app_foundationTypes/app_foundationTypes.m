//
// VRAppContextNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"


//
// VRAppContextNativeModuleFactory.m
//

#import "app_foundationTypes.h"

@implementation VRAppContextNativeModuleFactory

- (id<VRAppContextNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_foundation/src/host/AppContext";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRAppContextNativeModule);
}

@end

//
// VRNavigationHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"


//
// VRResolvedNavigation.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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

#import "app_foundationTypes.h"

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
// VRSplashScreenNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"


//
// VRSplashScreenNativeModuleFactory.m
//

#import "app_foundationTypes.h"

@implementation VRSplashScreenNativeModuleFactory

- (id<VRSplashScreenNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_foundation/src/splash/SplashScreenNative";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRSplashScreenNativeModule);
}

@end

//
// VRStackPage.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"

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
// VRAppContextHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"


//
// VRSplashScreenHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_foundationTypes.h"


