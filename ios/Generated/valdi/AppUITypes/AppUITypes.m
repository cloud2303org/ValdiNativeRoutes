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
// VRBottomSheetRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppUITypes.h"

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


