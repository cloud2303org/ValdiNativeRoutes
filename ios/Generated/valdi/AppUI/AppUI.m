//
// VRActionSheetRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRAppUINativeModule.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"

@interface VRAppUINativeModule: SCValdiProxyMarshallableObject

@end

@implementation VRAppUINativeModule

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "getHost", .selName = "getHost", .type = "f|m|(): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRAppUIHost",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAppUINativeModuleMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAppUINativeModule> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAppUINativeModule class]);
}


//
// VRAppUINativeModuleFactory.m
//

#import "AppUI.h"


//
// VRAttachmentAsset.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRAttachmentSelection.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRBottomSheetRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRDatePickerRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRImagePreviewRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRLoadingRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRModalReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRModalRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRPickerOption.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRPickerRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRPresentationReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRScanCodeReply.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRToastRequest.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"


//
// VRAppUIHost.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>

#import "AppUI.h"

static SCValdiFieldValue SCValdiFunctionInvokeOOODO_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, const void *, const void *, double, const void * ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetPtr(fields[2]), SCValdiFieldValueGetDouble(fields[3]), SCValdiFieldValueGetPtr(fields[4]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOOODO_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(const void * p0, const void * p1, double p2, const void * p3) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakePtr(p1), SCValdiFieldValueMakeDouble(p2), SCValdiFieldValueMakePtr(p3)));
    };
}

@interface VRAppUIHost: SCValdiProxyMarshallableObject

@end

@implementation VRAppUIHost

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "ooodo:o", .invoker = &SCValdiFunctionInvokeOOODO_o, .factory = &SCValdiBlockCreateOOODO_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "showModal", .selName = "showModalWithRequest:", .type = "f|m|(r:'[0]'): p<r:'[1]'>"},
        {.name = "showActionSheet", .selName = "showActionSheetWithRequest:", .type = "f|m|(r:'[2]'): p<r:'[3]'>"},
        {.name = "showPicker", .selName = "showPickerWithRequest:", .type = "f|m|(r:'[4]'): p<r:'[3]'>"},
        {.name = "showDatePicker", .selName = "showDatePickerWithRequest:", .type = "f|m|(r:'[5]'): p<r:'[3]'>"},
        {.name = "showBottomSheet", .selName = "showBottomSheetWithRequest:", .type = "f|m|(r:'[6]'): p<r:'[3]'>"},
        {.name = "previewImage", .selName = "previewImageWithRequest:", .type = "f|m|(r:'[7]'): p<r:'[3]'>"},
        {.name = "scanCode", .selName = "scanCode", .type = "f|m|(): p<r:'[8]'>"},
        {.name = "pickAttachments", .selName = "pickAttachmentsWithSource:limit:mimeTypes:", .type = "f|m|(s, d, a<s>): p<r:'[9]'>"},
        {.name = "clearAttachmentCache", .selName = "clearAttachmentCache", .type = "f|m|(): p<v>"},
        {.name = "showToast", .selName = "showToastWithRequest:", .type = "f|m|(r:'[10]'): p<v>"},
        {.name = "hideToast", .selName = "hideToast", .type = "f|m|(): p<v>"},
        {.name = "showLoading", .selName = "showLoadingWithRequest:", .type = "f|m|(r:'[11]'): p<v>"},
        {.name = "hideLoading", .selName = "hideLoading", .type = "f|m|(): p<v>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRModalRequest",
        "VRModalReply",
        "VRActionSheetRequest",
        "VRPresentationReply",
        "VRPickerRequest",
        "VRDatePickerRequest",
        "VRBottomSheetRequest",
        "VRImagePreviewRequest",
        "VRScanCodeReply",
        "VRAttachmentSelection",
        "VRToastRequest",
        "VRLoadingRequest",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeProtocol);
}

@end

NSInteger VRAppUIHostMarshall(SCValdiMarshallerRef  _Nonnull marshaller, id<VRAppUIHost> _Nonnull instance) {
    return SCValdiMarshallableObjectMarshallInterface(marshaller, instance, [VRAppUIHost class]);
}


