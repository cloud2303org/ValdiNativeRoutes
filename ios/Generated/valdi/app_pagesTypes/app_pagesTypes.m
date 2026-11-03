//
// VRActionSheetRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRActionSheetRequest

@dynamic title;
@dynamic itemList;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title itemList:(NSArray<NSString *> * _Nonnull)itemList
{
    return [super initWithFieldValues:nil, title, itemList];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "itemList", .selName = nil, .type = "a<s>"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRAttachmentAsset.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRAttachmentAsset

@dynamic id2;
@dynamic uri;
@dynamic name;
@dynamic mimeType;
@dynamic size;

- (instancetype _Nonnull)initWithId2:(NSString * _Nonnull)id2 uri:(NSString * _Nonnull)uri name:(NSString * _Nonnull)name mimeType:(NSString * _Nonnull)mimeType size:(double)size
{
    return [super initWithFieldValues:nil, id2, uri, name, mimeType, size];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "id", .selName = "id2", .type = "s"},
        {.name = "uri", .selName = nil, .type = "s"},
        {.name = "name", .selName = nil, .type = "s"},
        {.name = "mimeType", .selName = nil, .type = "s"},
        {.name = "size", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRAttachmentSelection.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRAttachmentSelection

@dynamic canceled;
@dynamic assets;

- (instancetype _Nonnull)initWithCanceled:(BOOL)canceled assets:(NSArray<VRAttachmentAsset *> * _Nonnull)assets
{
    return [super initWithFieldValues:nil, canceled, assets];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "canceled", .selName = nil, .type = "b"},
        {.name = "assets", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRAttachmentAsset",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBottomSheetRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBottomSheetRequest

@dynamic title;
@dynamic content;
@dynamic confirmText;
@dynamic cancelText;
@dynamic showCancel;
@dynamic dismissible;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title content:(NSString * _Nonnull)content confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText showCancel:(BOOL)showCancel dismissible:(BOOL)dismissible
{
    return [super initWithFieldValues:nil, title, content, confirmText, cancelText, showCancel, dismissible];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "content", .selName = nil, .type = "s"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
        {.name = "showCancel", .selName = nil, .type = "b"},
        {.name = "dismissible", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
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
// VRDatePickerRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRDatePickerRequest

@dynamic title;
@dynamic mode;
@dynamic value;
@dynamic confirmText;
@dynamic cancelText;
@dynamic minYear;
@dynamic maxYear;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title mode:(NSString * _Nonnull)mode value:(NSString * _Nonnull)value confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText minYear:(double)minYear maxYear:(double)maxYear
{
    return [super initWithFieldValues:nil, title, mode, value, confirmText, cancelText, minYear, maxYear];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "mode", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
        {.name = "minYear", .selName = nil, .type = "d"},
        {.name = "maxYear", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRImagePreviewRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRImagePreviewRequest

@dynamic urls;
@dynamic current;

- (instancetype _Nonnull)initWithUrls:(NSArray<NSString *> * _Nonnull)urls current:(NSString * _Nonnull)current
{
    return [super initWithFieldValues:nil, urls, current];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "urls", .selName = nil, .type = "a<s>"},
        {.name = "current", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRInstallAppUI.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRInstallNfcHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRInstallPermissionHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRInstallStorageHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRInstallVisionHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRInstallWifiHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>

#import "app_pagesTypes.h"


//
// VRLoadingRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRLoadingRequest

@dynamic title;
@dynamic mask;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title mask:(BOOL)mask
{
    return [super initWithFieldValues:nil, title, mask];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "mask", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRModalReply.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRModalReply

@dynamic confirm;
@dynamic cancel;
@dynamic content;

- (instancetype _Nonnull)initWithConfirm:(BOOL)confirm cancel:(BOOL)cancel content:(NSString * _Nonnull)content
{
    return [super initWithFieldValues:nil, confirm, cancel, content];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "confirm", .selName = nil, .type = "b"},
        {.name = "cancel", .selName = nil, .type = "b"},
        {.name = "content", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRModalRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRModalRequest

@dynamic title;
@dynamic content;
@dynamic showCancel;
@dynamic confirmText;
@dynamic cancelText;
@dynamic editable;
@dynamic placeholderText;
@dynamic defaultText;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title content:(NSString * _Nonnull)content showCancel:(BOOL)showCancel confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText editable:(BOOL)editable placeholderText:(NSString * _Nonnull)placeholderText defaultText:(NSString * _Nonnull)defaultText
{
    return [super initWithFieldValues:nil, title, content, showCancel, confirmText, cancelText, editable, placeholderText, defaultText];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "content", .selName = nil, .type = "s"},
        {.name = "showCancel", .selName = nil, .type = "b"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
        {.name = "editable", .selName = nil, .type = "b"},
        {.name = "placeholderText", .selName = nil, .type = "s"},
        {.name = "defaultText", .selName = nil, .type = "s"},
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
        {.name = "push", .selName = nil, .type = "f(s, m<s,u>, s, r:'[0]')"},
        {.name = "pushForResult", .selName = nil, .type = "f(s, m<s,u>, s, r:'[0]', f(m<s,u>, b))"},
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
// VRNfcAvailability.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

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

#import "app_pagesTypes.h"

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

#import "app_pagesTypes.h"

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
// VRNfcRecord.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

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

#import "app_pagesTypes.h"

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
// VRPermissionGrant.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

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
// VRPickerOption.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPickerOption

@dynamic value;
@dynamic label;

- (instancetype _Nonnull)initWithValue:(NSString * _Nonnull)value label:(NSString * _Nonnull)label
{
    return [super initWithFieldValues:nil, value, label];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "label", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRPickerRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPickerRequest

@dynamic title;
@dynamic confirmText;
@dynamic cancelText;
@dynamic options;
@dynamic value;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText options:(NSArray<VRPickerOption *> * _Nonnull)options value:(NSString * _Nonnull)value
{
    return [super initWithFieldValues:nil, title, confirmText, cancelText, options, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
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
// VRPresentationReply.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRPresentationReply

@dynamic confirm;
@dynamic cancel;
@dynamic value;
@dynamic index;

- (instancetype _Nonnull)initWithConfirm:(BOOL)confirm cancel:(BOOL)cancel value:(NSString * _Nonnull)value index:(double)index
{
    return [super initWithFieldValues:nil, confirm, cancel, value, index];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "confirm", .selName = nil, .type = "b"},
        {.name = "cancel", .selName = nil, .type = "b"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "index", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


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
// VRScanCodeReply.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRScanCodeReply

@dynamic result;
@dynamic scanType;

- (instancetype _Nonnull)initWithResult:(NSString * _Nonnull)result scanType:(NSString * _Nonnull)scanType
{
    return [super initWithFieldValues:nil, result, scanType];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "result", .selName = nil, .type = "s"},
        {.name = "scanType", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
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
// VRStorageHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

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

#import "app_pagesTypes.h"

@implementation VRStorageReadReply

@dynamic found;
@dynamic payload;
@dynamic error;

- (instancetype _Nonnull)initWithFound:(BOOL)found payload:(NSDictionary <NSString *, id> * _Nonnull)payload error:(NSString * _Nonnull)error
{
    return [super initWithFieldValues:nil, found, payload, error];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "found", .selName = nil, .type = "b"},
        {.name = "payload", .selName = nil, .type = "m<s,u>"},
        {.name = "error", .selName = nil, .type = "s"},
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

#import "app_pagesTypes.h"

@implementation VRStorageWriteRequest

@dynamic key;
@dynamic payload;

- (instancetype _Nonnull)initWithKey:(NSString * _Nonnull)key payload:(NSDictionary <NSString *, id> * _Nonnull)payload
{
    return [super initWithFieldValues:nil, key, payload];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "key", .selName = nil, .type = "s"},
        {.name = "payload", .selName = nil, .type = "m<s,u>"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


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
// VRToastRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRToastRequest

@dynamic title;
@dynamic icon;
@dynamic duration;
@dynamic mask;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title icon:(NSString * _Nonnull)icon duration:(double)duration mask:(BOOL)mask
{
    return [super initWithFieldValues:nil, title, icon, duration, mask];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "icon", .selName = nil, .type = "s"},
        {.name = "duration", .selName = nil, .type = "d"},
        {.name = "mask", .selName = nil, .type = "b"},
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
// VRWifiConnectParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWifiConnectParams

@dynamic SSID;
@dynamic BSSID;
@dynamic password;
@dynamic maunal;
@dynamic partialInfo;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID BSSID:(NSString * _Nonnull)BSSID password:(NSString * _Nonnull)password maunal:(BOOL)maunal partialInfo:(BOOL)partialInfo
{
    return [super initWithFieldValues:nil, SSID, BSSID, password, maunal, partialInfo];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s"},
        {.name = "password", .selName = nil, .type = "s"},
        {.name = "maunal", .selName = nil, .type = "b"},
        {.name = "partialInfo", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiCredential.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWifiCredential

@dynamic SSID;
@dynamic BSSID;
@dynamic password;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID password:(NSString * _Nonnull)password
{
    return [super initWithFieldValues:nil, SSID, nil, password];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s?"},
        {.name = "password", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiHostEvents.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWifiHostEvents

@dynamic wifiConnected;
@dynamic wifiList;

- (instancetype _Nonnull)initWithWifiConnected:(VRWifiHostEventsWifiConnectedBlock _Nonnull)wifiConnected wifiList:(VRWifiHostEventsWifiListBlock _Nonnull)wifiList
{
    return [super initWithFieldValues:nil, wifiConnected, wifiList];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "wifiConnected", .selName = nil, .type = "f(r:'[0]')"},
        {.name = "wifiList", .selName = nil, .type = "f(a<r:'[0]'>)"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRWifiInfo",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiInfo.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWifiInfo

@dynamic SSID;
@dynamic BSSID;
@dynamic secure;
@dynamic signalStrength;
@dynamic frequency;

- (instancetype _Nonnull)initWithSSID:(NSString * _Nonnull)SSID
{
    return [super initWithFieldValues:nil, SSID, nil, nil, nil, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "SSID", .selName = nil, .type = "s"},
        {.name = "BSSID", .selName = nil, .type = "s?"},
        {.name = "secure", .selName = nil, .type = "b@?"},
        {.name = "signalStrength", .selName = nil, .type = "d@?"},
        {.name = "frequency", .selName = nil, .type = "d@?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRWifiPermissionState.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRWifiPermissionState

@dynamic status;
@dynamic canAskAgain;

- (instancetype _Nonnull)initWithStatus:(NSString * _Nonnull)status canAskAgain:(BOOL)canAskAgain
{
    return [super initWithFieldValues:nil, status, canAskAgain];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "status", .selName = nil, .type = "s"},
        {.name = "canAskAgain", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRAppUIHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRNfcHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


//
// VRPermissionHost.m
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


//
// VRWifiHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"


