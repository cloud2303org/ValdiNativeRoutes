//
// VRAttachmentSource.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "AppUITypes.h"

VRAttachmentSource VRAttachmentSourcePhotos = @"photos";
VRAttachmentSource VRAttachmentSourceCamera = @"camera";
VRAttachmentSource VRAttachmentSourceFiles = @"files";
VALDI_STRING_ENUM(VRAttachmentSource, VRAttachmentSourcePhotos, VRAttachmentSourceCamera, VRAttachmentSourceFiles)
NSArray<NSString *> * _Nonnull VRAttachmentSourceGetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[VRAttachmentSourcePhotos, VRAttachmentSourceCamera, VRAttachmentSourceFiles];
    });
    return kAllCases;
}

//
// VRDatePickerMode.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "AppUITypes.h"

VRDatePickerMode VRDatePickerModeYear = @"year";
VRDatePickerMode VRDatePickerModeYearMonth = @"year-month";
VRDatePickerMode VRDatePickerModeDate = @"date";
VRDatePickerMode VRDatePickerModeTime = @"time";
VRDatePickerMode VRDatePickerModeDateTime = @"datetime";
VALDI_STRING_ENUM(VRDatePickerMode, VRDatePickerModeYear, VRDatePickerModeYearMonth, VRDatePickerModeDate, VRDatePickerModeTime, VRDatePickerModeDateTime)
NSArray<NSString *> * _Nonnull VRDatePickerModeGetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[VRDatePickerModeYear, VRDatePickerModeYearMonth, VRDatePickerModeDate, VRDatePickerModeTime, VRDatePickerModeDateTime];
    });
    return kAllCases;
}

//
// VRToastRequestIcon.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "AppUITypes.h"

VRToastRequestIcon VRToastRequestIconSuccess = @"success";
VRToastRequestIcon VRToastRequestIconError = @"error";
VRToastRequestIcon VRToastRequestIconLoading = @"loading";
VRToastRequestIcon VRToastRequestIconNone = @"none";
VALDI_STRING_ENUM(VRToastRequestIcon, VRToastRequestIconSuccess, VRToastRequestIconError, VRToastRequestIconLoading, VRToastRequestIconNone)
NSArray<NSString *> * _Nonnull VRToastRequestIconGetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[VRToastRequestIconSuccess, VRToastRequestIconError, VRToastRequestIconLoading, VRToastRequestIconNone];
    });
    return kAllCases;
}

//
// VRActionSheetRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRAppSheetOverlayContext.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

static SCValdiFieldValue SCValdiFunctionInvokeOD_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetDouble(fields[1]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOD_v(SCValdiBlockTrampoline trampoline) {
    return ^void(double p0) {
        trampoline(nil, SCValdiFieldValueMakeDouble(p0));
    };
}

static SCValdiFieldValue SCValdiFunctionInvokeOOD_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, const void *, double ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetDouble(fields[2]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOOD_v(SCValdiBlockTrampoline trampoline) {
    return ^void(const void * p0, double p1) {
        trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakeDouble(p1));
    };
}

@implementation VRAppSheetOverlayContext

@dynamic onSelect;
@dynamic onConfirm;
@dynamic onCancel;
@dynamic onDismissed;

- (instancetype _Nonnull)initWithOnSelect:(VRAppSheetOverlayContextOnSelectBlock _Nonnull)onSelect onConfirm:(VRAppSheetOverlayContextOnConfirmBlock _Nonnull)onConfirm onCancel:(VRAppSheetOverlayContextOnCancelBlock _Nonnull)onCancel onDismissed:(VRAppSheetOverlayContextOnDismissedBlock _Nonnull)onDismissed
{
    return [super initWithFieldValues:nil, onSelect, onConfirm, onCancel, onDismissed];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "od:v", .invoker = &SCValdiFunctionInvokeOD_v, .factory = &SCValdiBlockCreateOD_v },
        { .typeEncoding = "ood:v", .invoker = &SCValdiFunctionInvokeOOD_v, .factory = &SCValdiBlockCreateOOD_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "onSelect", .selName = nil, .type = "f(d)"},
        {.name = "onConfirm", .selName = nil, .type = "f(s, d)"},
        {.name = "onCancel", .selName = nil, .type = "f()"},
        {.name = "onDismissed", .selName = nil, .type = "f()"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, kBlocks, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRAppSheetOverlayViewModel.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

@implementation VRAppSheetOverlayViewModel

@dynamic open;
@dynamic kind;
@dynamic title;
@dynamic confirmText;
@dynamic cancelText;
@dynamic items;
@dynamic options;
@dynamic value;
@dynamic dateMode;
@dynamic minYear;
@dynamic maxYear;
@dynamic bottomInset;

- (instancetype _Nonnull)initWithOpen:(BOOL)open kind:(NSString * _Nonnull)kind title:(NSString * _Nonnull)title confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText items:(NSArray<NSString *> * _Nonnull)items options:(NSArray<VRPickerOption *> * _Nonnull)options value:(NSString * _Nonnull)value dateMode:(NSString * _Nonnull)dateMode minYear:(double)minYear maxYear:(double)maxYear bottomInset:(double)bottomInset
{
    return [super initWithFieldValues:nil, open, kind, title, confirmText, cancelText, items, options, value, dateMode, minYear, maxYear, bottomInset];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "open", .selName = nil, .type = "b"},
        {.name = "kind", .selName = nil, .type = "s"},
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
        {.name = "items", .selName = nil, .type = "a<s>"},
        {.name = "options", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "dateMode", .selName = nil, .type = "s"},
        {.name = "minYear", .selName = nil, .type = "d"},
        {.name = "maxYear", .selName = nil, .type = "d"},
        {.name = "bottomInset", .selName = nil, .type = "d"},
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
// VRAppUINativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"


//
// VRAppUINativeModuleFactory.m
//

#import "AppUITypes.h"

@implementation VRAppUINativeModuleFactory

- (id<VRAppUINativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_ui/src/AppUI";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRAppUINativeModule);
}

@end

//
// VRAttachmentAsset.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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

#import "AppUITypes.h"

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
// VRColumnWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRDatePickerRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

@implementation VRDatePickerRequest

@dynamic title;
@dynamic mode;
@dynamic value;
@dynamic confirmText;
@dynamic cancelText;
@dynamic minYear;
@dynamic maxYear;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title mode:(VRDatePickerMode _Nonnull)mode value:(NSString * _Nonnull)value confirmText:(NSString * _Nonnull)confirmText cancelText:(NSString * _Nonnull)cancelText minYear:(double)minYear maxYear:(double)maxYear
{
    return [super initWithFieldValues:nil, title, mode, value, confirmText, cancelText, minYear, maxYear];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "mode", .selName = nil, .type = "r:'[0]'"},
        {.name = "value", .selName = nil, .type = "s"},
        {.name = "confirmText", .selName = nil, .type = "s"},
        {.name = "cancelText", .selName = nil, .type = "s"},
        {.name = "minYear", .selName = nil, .type = "d"},
        {.name = "maxYear", .selName = nil, .type = "d"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRDatePickerMode",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRImagePreviewRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRLoadingRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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

#import "AppUITypes.h"

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

#import "AppUITypes.h"

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
// VRPickerOption.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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

#import "AppUITypes.h"

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

#import "AppUITypes.h"

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
// VRScanCodeReply.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRTimeWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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

#import "AppUITypes.h"

@implementation VRToastRequest

@dynamic title;
@dynamic icon;
@dynamic duration;
@dynamic mask;

- (instancetype _Nonnull)initWithTitle:(NSString * _Nonnull)title icon:(VRToastRequestIcon _Nonnull)icon duration:(double)duration mask:(BOOL)mask
{
    return [super initWithFieldValues:nil, title, icon, duration, mask];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "title", .selName = nil, .type = "s"},
        {.name = "icon", .selName = nil, .type = "r:'[0]'"},
        {.name = "duration", .selName = nil, .type = "d"},
        {.name = "mask", .selName = nil, .type = "b"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRToastRequestIcon",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRTreeWheelConfig.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRWheelTreeNode.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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
// VRAppUIHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"


