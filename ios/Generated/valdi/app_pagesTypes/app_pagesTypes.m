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
// VRAppUIHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

static SCValdiFieldValue SCValdiFunctionInvokeOODOO_v(const void *function, SCValdiFieldValue* fields) {
    ((void (*) (const void *, const void *, double, const void *, const void * ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetPtr(fields[1]), SCValdiFieldValueGetDouble(fields[2]), SCValdiFieldValueGetPtr(fields[3]), SCValdiFieldValueGetPtr(fields[4]));
    return SCValdiFieldValueMakeNull();
}

static id SCValdiBlockCreateOODOO_v(SCValdiBlockTrampoline trampoline) {
    return ^void(const void * p0, double p1, const void * p2, const void * p3) {
        trampoline(nil, SCValdiFieldValueMakePtr(p0), SCValdiFieldValueMakeDouble(p1), SCValdiFieldValueMakePtr(p2), SCValdiFieldValueMakePtr(p3));
    };
}

@implementation VRAppUIHost

@dynamic showModal;
@dynamic showActionSheet;
@dynamic showPicker;
@dynamic showDatePicker;
@dynamic showBottomSheet;
@dynamic previewImage;
@dynamic scanCode;
@dynamic pickAttachments;
@dynamic clearAttachmentCache;
@dynamic showToast;
@dynamic hideToast;
@dynamic showLoading;
@dynamic hideLoading;

- (instancetype _Nonnull)initWithShowModal:(VRAppUIHostShowModalBlock _Nonnull)showModal showActionSheet:(VRAppUIHostShowActionSheetBlock _Nonnull)showActionSheet showPicker:(VRAppUIHostShowPickerBlock _Nonnull)showPicker showDatePicker:(VRAppUIHostShowDatePickerBlock _Nonnull)showDatePicker showBottomSheet:(VRAppUIHostShowBottomSheetBlock _Nonnull)showBottomSheet previewImage:(VRAppUIHostPreviewImageBlock _Nonnull)previewImage scanCode:(VRAppUIHostScanCodeBlock _Nonnull)scanCode pickAttachments:(VRAppUIHostPickAttachmentsBlock _Nonnull)pickAttachments clearAttachmentCache:(VRAppUIHostClearAttachmentCacheBlock _Nonnull)clearAttachmentCache showToast:(VRAppUIHostShowToastBlock _Nonnull)showToast hideToast:(VRAppUIHostHideToastBlock _Nonnull)hideToast showLoading:(VRAppUIHostShowLoadingBlock _Nonnull)showLoading hideLoading:(VRAppUIHostHideLoadingBlock _Nonnull)hideLoading
{
    return [super initWithFieldValues:nil, showModal, showActionSheet, showPicker, showDatePicker, showBottomSheet, previewImage, scanCode, pickAttachments, clearAttachmentCache, showToast, hideToast, showLoading, hideLoading];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oodoo:v", .invoker = &SCValdiFunctionInvokeOODOO_v, .factory = &SCValdiBlockCreateOODOO_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "showModal", .selName = nil, .type = "f(r:'[0]', f(s, r:'[1]'))"},
        {.name = "showActionSheet", .selName = nil, .type = "f(r:'[2]', f(s, r:'[3]'))"},
        {.name = "showPicker", .selName = nil, .type = "f(r:'[4]', f(s, r:'[3]'))"},
        {.name = "showDatePicker", .selName = nil, .type = "f(r:'[5]', f(s, r:'[3]'))"},
        {.name = "showBottomSheet", .selName = nil, .type = "f(r:'[6]', f(s, r:'[3]'))"},
        {.name = "previewImage", .selName = nil, .type = "f(r:'[7]', f(s, r:'[3]'))"},
        {.name = "scanCode", .selName = nil, .type = "f(f(s, r:'[8]'))"},
        {.name = "pickAttachments", .selName = nil, .type = "f(s, d, a<s>, f(s, r:'[9]'))"},
        {.name = "clearAttachmentCache", .selName = nil, .type = "f(f(s))"},
        {.name = "showToast", .selName = nil, .type = "f(r:'[10]', f(s))"},
        {.name = "hideToast", .selName = nil, .type = "f(f(s))"},
        {.name = "showLoading", .selName = nil, .type = "f(r:'[11]', f(s))"},
        {.name = "hideLoading", .selName = nil, .type = "f(f(s))"},
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
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeClass);
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
// VRBleAdapterState.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleAdapterState

@dynamic available;
@dynamic discovering;
@dynamic peripheralAvailable;

- (instancetype _Nonnull)initWithAvailable:(BOOL)available discovering:(BOOL)discovering
{
    return [super initWithFieldValues:nil, available, discovering, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "available", .selName = nil, .type = "b"},
        {.name = "discovering", .selName = nil, .type = "b"},
        {.name = "peripheralAvailable", .selName = nil, .type = "b@?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleCharacteristic.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleCharacteristic

@dynamic uuid;
@dynamic properties;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid properties:(VRBleCharacteristicProperties * _Nonnull)properties
{
    return [super initWithFieldValues:nil, uuid, properties];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "properties", .selName = nil, .type = "r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBleCharacteristicProperties",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleCharacteristicProperties.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleCharacteristicProperties

@dynamic read;
@dynamic write;
@dynamic writeDefault;
@dynamic writeNoResponse;
@dynamic notify;
@dynamic indicate;

- (instancetype _Nonnull)initWithRead:(BOOL)read write:(BOOL)write writeDefault:(BOOL)writeDefault writeNoResponse:(BOOL)writeNoResponse notify:(BOOL)notify indicate:(BOOL)indicate
{
    return [super initWithFieldValues:nil, read, write, writeDefault, writeNoResponse, notify, indicate];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "read", .selName = nil, .type = "b"},
        {.name = "write", .selName = nil, .type = "b"},
        {.name = "writeDefault", .selName = nil, .type = "b"},
        {.name = "writeNoResponse", .selName = nil, .type = "b"},
        {.name = "notify", .selName = nil, .type = "b"},
        {.name = "indicate", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleCharacteristicValue.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleCharacteristicValue

@dynamic deviceId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic value;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId value:(NSData * _Nonnull)value
{
    return [super initWithFieldValues:nil, deviceId, serviceId, characteristicId, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleConnectStateChange.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleConnectStateChange

@dynamic deviceId;
@dynamic connected;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId connected:(BOOL)connected
{
    return [super initWithFieldValues:nil, deviceId, connected];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "connected", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleConnectedDevice.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleConnectedDevice

@dynamic deviceId;
@dynamic name;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId name:(NSString * _Nonnull)name
{
    return [super initWithFieldValues:nil, deviceId, name];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "name", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleDevice.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleDevice

@dynamic RSSI;
@dynamic advertisData;
@dynamic advertisServiceUUIDs;
@dynamic deviceId;
@dynamic localName;
@dynamic name;
@dynamic serviceData;
@dynamic connectable;

- (instancetype _Nonnull)initWithRSSI:(double)RSSI advertisData:(NSData * _Nonnull)advertisData advertisServiceUUIDs:(NSArray<NSString *> * _Nonnull)advertisServiceUUIDs deviceId:(NSString * _Nonnull)deviceId localName:(NSString * _Nonnull)localName name:(NSString * _Nonnull)name serviceData:(NSArray<VRBleServiceData *> * _Nonnull)serviceData
{
    return [super initWithFieldValues:nil, RSSI, advertisData, advertisServiceUUIDs, deviceId, localName, name, serviceData, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "RSSI", .selName = nil, .type = "d"},
        {.name = "advertisData", .selName = nil, .type = "t"},
        {.name = "advertisServiceUUIDs", .selName = nil, .type = "a<s>"},
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "localName", .selName = nil, .type = "s"},
        {.name = "name", .selName = nil, .type = "s"},
        {.name = "serviceData", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "connectable", .selName = nil, .type = "b@?"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBleServiceData",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleHostEvents.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleHostEvents

@dynamic deviceFound;
@dynamic adapterStateChange;
@dynamic connectStateChange;
@dynamic characteristicUpdate;
@dynamic mtuChange;
@dynamic peripheralReadRequest;
@dynamic peripheralWriteRequest;
@dynamic peripheralSubscribed;
@dynamic peripheralUnsubscribed;
@dynamic peripheralConnectionStateChange;

- (instancetype _Nonnull)initWithDeviceFound:(VRBleHostEventsDeviceFoundBlock _Nonnull)deviceFound adapterStateChange:(VRBleHostEventsAdapterStateChangeBlock _Nonnull)adapterStateChange connectStateChange:(VRBleHostEventsConnectStateChangeBlock _Nonnull)connectStateChange characteristicUpdate:(VRBleHostEventsCharacteristicUpdateBlock _Nonnull)characteristicUpdate mtuChange:(VRBleHostEventsMtuChangeBlock _Nonnull)mtuChange peripheralReadRequest:(VRBleHostEventsPeripheralReadRequestBlock _Nonnull)peripheralReadRequest peripheralWriteRequest:(VRBleHostEventsPeripheralWriteRequestBlock _Nonnull)peripheralWriteRequest peripheralSubscribed:(VRBleHostEventsPeripheralSubscribedBlock _Nonnull)peripheralSubscribed peripheralUnsubscribed:(VRBleHostEventsPeripheralUnsubscribedBlock _Nonnull)peripheralUnsubscribed peripheralConnectionStateChange:(VRBleHostEventsPeripheralConnectionStateChangeBlock _Nonnull)peripheralConnectionStateChange
{
    return [super initWithFieldValues:nil, deviceFound, adapterStateChange, connectStateChange, characteristicUpdate, mtuChange, peripheralReadRequest, peripheralWriteRequest, peripheralSubscribed, peripheralUnsubscribed, peripheralConnectionStateChange];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceFound", .selName = nil, .type = "f(r:'[0]')"},
        {.name = "adapterStateChange", .selName = nil, .type = "f(r:'[1]')"},
        {.name = "connectStateChange", .selName = nil, .type = "f(r:'[2]')"},
        {.name = "characteristicUpdate", .selName = nil, .type = "f(r:'[3]')"},
        {.name = "mtuChange", .selName = nil, .type = "f(r:'[4]')"},
        {.name = "peripheralReadRequest", .selName = nil, .type = "f(r:'[5]')"},
        {.name = "peripheralWriteRequest", .selName = nil, .type = "f(r:'[6]')"},
        {.name = "peripheralSubscribed", .selName = nil, .type = "f(r:'[7]')"},
        {.name = "peripheralUnsubscribed", .selName = nil, .type = "f(r:'[7]')"},
        {.name = "peripheralConnectionStateChange", .selName = nil, .type = "f(r:'[8]')"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBleDevice",
        "VRBleAdapterState",
        "VRBleConnectStateChange",
        "VRBleCharacteristicValue",
        "VRBleMTUChange",
        "VRBlePeripheralReadRequest",
        "VRBlePeripheralWriteRequest",
        "VRBlePeripheralSubscriptionEvent",
        "VRBlePeripheralConnectionState",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleMTUChange.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleMTUChange

@dynamic deviceId;
@dynamic mtu;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId mtu:(double)mtu
{
    return [super initWithFieldValues:nil, deviceId, mtu];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "mtu", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleNotifyParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleNotifyParams

@dynamic deviceId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic state;
@dynamic type;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId state:(BOOL)state
{
    return [super initWithFieldValues:nil, deviceId, serviceId, characteristicId, state, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "state", .selName = nil, .type = "b"},
        {.name = "type", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePairParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePairParams

@dynamic deviceId;
@dynamic pin;
@dynamic timeout;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId pin:(NSString * _Nonnull)pin timeout:(double)timeout
{
    return [super initWithFieldValues:nil, deviceId, pin, timeout];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "pin", .selName = nil, .type = "s"},
        {.name = "timeout", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralAdvertisingParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralAdvertisingParams

@dynamic serverId;
@dynamic connectable;
@dynamic deviceName;
@dynamic serviceUuids;
@dynamic manufacturerData;
@dynamic powerLevel;
@dynamic beacon;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId connectable:(BOOL)connectable deviceName:(NSString * _Nonnull)deviceName serviceUuids:(NSArray<NSString *> * _Nonnull)serviceUuids manufacturerData:(NSArray<VRBlePeripheralManufacturerData *> * _Nonnull)manufacturerData powerLevel:(NSString * _Nonnull)powerLevel
{
    return [super initWithFieldValues:nil, serverId, connectable, deviceName, serviceUuids, manufacturerData, powerLevel, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "connectable", .selName = nil, .type = "b"},
        {.name = "deviceName", .selName = nil, .type = "s"},
        {.name = "serviceUuids", .selName = nil, .type = "a<s>"},
        {.name = "manufacturerData", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = "powerLevel", .selName = nil, .type = "s"},
        {.name = "beacon", .selName = nil, .type = "r?:'[1]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBlePeripheralManufacturerData",
        "VRBlePeripheralBeacon",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralBeacon.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralBeacon

@dynamic uuid;
@dynamic major;
@dynamic minor;
@dynamic measuredPower;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid major:(double)major minor:(double)minor measuredPower:(double)measuredPower
{
    return [super initWithFieldValues:nil, uuid, major, minor, measuredPower];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "major", .selName = nil, .type = "d"},
        {.name = "minor", .selName = nil, .type = "d"},
        {.name = "measuredPower", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralCharacteristic.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralCharacteristic

@dynamic uuid;
@dynamic properties;
@dynamic permission;
@dynamic value;
@dynamic descriptors;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid properties:(VRBlePeripheralProperties * _Nonnull)properties permission:(VRBlePeripheralPermissions * _Nonnull)permission value:(NSData * _Nonnull)value descriptors:(NSArray<VRBlePeripheralDescriptor *> * _Nonnull)descriptors
{
    return [super initWithFieldValues:nil, uuid, properties, permission, value, descriptors];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "properties", .selName = nil, .type = "r:'[0]'"},
        {.name = "permission", .selName = nil, .type = "r:'[1]'"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = "descriptors", .selName = nil, .type = "a<r:'[2]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBlePeripheralProperties",
        "VRBlePeripheralPermissions",
        "VRBlePeripheralDescriptor",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralConnectionState.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralConnectionState

@dynamic serverId;
@dynamic deviceId;
@dynamic connected;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId deviceId:(NSString * _Nonnull)deviceId connected:(BOOL)connected
{
    return [super initWithFieldValues:nil, serverId, deviceId, connected];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "connected", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralDescriptor.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralDescriptor

@dynamic uuid;
@dynamic read;
@dynamic write;
@dynamic value;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid read:(BOOL)read write:(BOOL)write value:(NSData * _Nonnull)value
{
    return [super initWithFieldValues:nil, uuid, read, write, value];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "read", .selName = nil, .type = "b"},
        {.name = "write", .selName = nil, .type = "b"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralManufacturerData.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralManufacturerData

@dynamic manufacturerId;
@dynamic manufacturerSpecificData;

- (instancetype _Nonnull)initWithManufacturerId:(double)manufacturerId manufacturerSpecificData:(NSData * _Nonnull)manufacturerSpecificData
{
    return [super initWithFieldValues:nil, manufacturerId, manufacturerSpecificData];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "manufacturerId", .selName = nil, .type = "d"},
        {.name = "manufacturerSpecificData", .selName = nil, .type = "t"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralPermissions.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralPermissions

@dynamic readable;
@dynamic writeable;
@dynamic readEncryptionRequired;
@dynamic writeEncryptionRequired;

- (instancetype _Nonnull)initWithReadable:(BOOL)readable writeable:(BOOL)writeable readEncryptionRequired:(BOOL)readEncryptionRequired writeEncryptionRequired:(BOOL)writeEncryptionRequired
{
    return [super initWithFieldValues:nil, readable, writeable, readEncryptionRequired, writeEncryptionRequired];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "readable", .selName = nil, .type = "b"},
        {.name = "writeable", .selName = nil, .type = "b"},
        {.name = "readEncryptionRequired", .selName = nil, .type = "b"},
        {.name = "writeEncryptionRequired", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralProperties.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralProperties

@dynamic read;
@dynamic write;
@dynamic writeNoResponse;
@dynamic notify;
@dynamic indicate;

- (instancetype _Nonnull)initWithRead:(BOOL)read write:(BOOL)write writeNoResponse:(BOOL)writeNoResponse notify:(BOOL)notify indicate:(BOOL)indicate
{
    return [super initWithFieldValues:nil, read, write, writeNoResponse, notify, indicate];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "read", .selName = nil, .type = "b"},
        {.name = "write", .selName = nil, .type = "b"},
        {.name = "writeNoResponse", .selName = nil, .type = "b"},
        {.name = "notify", .selName = nil, .type = "b"},
        {.name = "indicate", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralReadRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralReadRequest

@dynamic serverId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic callbackId;
@dynamic deviceId;
@dynamic offset;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId callbackId:(double)callbackId deviceId:(NSString * _Nonnull)deviceId offset:(double)offset
{
    return [super initWithFieldValues:nil, serverId, serviceId, characteristicId, callbackId, deviceId, offset];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "callbackId", .selName = nil, .type = "d"},
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "offset", .selName = nil, .type = "d"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralService.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralService

@dynamic uuid;
@dynamic characteristics;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid characteristics:(NSArray<VRBlePeripheralCharacteristic *> * _Nonnull)characteristics
{
    return [super initWithFieldValues:nil, uuid, characteristics];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "characteristics", .selName = nil, .type = "a<r:'[0]'>"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRBlePeripheralCharacteristic",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralSubscriptionEvent.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralSubscriptionEvent

@dynamic serverId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic deviceId;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId deviceId:(NSString * _Nonnull)deviceId
{
    return [super initWithFieldValues:nil, serverId, serviceId, characteristicId, deviceId];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralWriteParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralWriteParams

@dynamic serverId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic value;
@dynamic needNotify;
@dynamic callbackId;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId value:(NSData * _Nonnull)value needNotify:(BOOL)needNotify
{
    return [super initWithFieldValues:nil, serverId, serviceId, characteristicId, value, needNotify, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = "needNotify", .selName = nil, .type = "b"},
        {.name = "callbackId", .selName = nil, .type = "d@?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBlePeripheralWriteRequest.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBlePeripheralWriteRequest

@dynamic serverId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic callbackId;
@dynamic deviceId;
@dynamic offset;
@dynamic value;
@dynamic needResponse;

- (instancetype _Nonnull)initWithServerId:(NSString * _Nonnull)serverId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId callbackId:(double)callbackId deviceId:(NSString * _Nonnull)deviceId offset:(double)offset value:(NSData * _Nonnull)value needResponse:(BOOL)needResponse
{
    return [super initWithFieldValues:nil, serverId, serviceId, characteristicId, callbackId, deviceId, offset, value, needResponse];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "serverId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "callbackId", .selName = nil, .type = "d"},
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "offset", .selName = nil, .type = "d"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = "needResponse", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleReadParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleReadParams

@dynamic deviceId;
@dynamic serviceId;
@dynamic characteristicId;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId
{
    return [super initWithFieldValues:nil, deviceId, serviceId, characteristicId];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleScanParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleScanParams

@dynamic services;
@dynamic allowDuplicatesKey;
@dynamic interval;
@dynamic powerLevel;

- (instancetype _Nonnull)init
{
    return [super init];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "services", .selName = nil, .type = "a?<s>"},
        {.name = "allowDuplicatesKey", .selName = nil, .type = "b@?"},
        {.name = "interval", .selName = nil, .type = "d@?"},
        {.name = "powerLevel", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleService.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleService

@dynamic uuid;
@dynamic isPrimary;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid isPrimary:(BOOL)isPrimary
{
    return [super initWithFieldValues:nil, uuid, isPrimary];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "isPrimary", .selName = nil, .type = "b"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleServiceData.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleServiceData

@dynamic uuid;
@dynamic data;

- (instancetype _Nonnull)initWithUuid:(NSString * _Nonnull)uuid data:(NSData * _Nonnull)data
{
    return [super initWithFieldValues:nil, uuid, data];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "uuid", .selName = nil, .type = "s"},
        {.name = "data", .selName = nil, .type = "t"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRBleWriteParams.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_pagesTypes.h"

@implementation VRBleWriteParams

@dynamic deviceId;
@dynamic serviceId;
@dynamic characteristicId;
@dynamic value;
@dynamic writeType;

- (instancetype _Nonnull)initWithDeviceId:(NSString * _Nonnull)deviceId serviceId:(NSString * _Nonnull)serviceId characteristicId:(NSString * _Nonnull)characteristicId value:(NSData * _Nonnull)value
{
    return [super initWithFieldValues:nil, deviceId, serviceId, characteristicId, value, nil];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "deviceId", .selName = nil, .type = "s"},
        {.name = "serviceId", .selName = nil, .type = "s"},
        {.name = "characteristicId", .selName = nil, .type = "s"},
        {.name = "value", .selName = nil, .type = "t"},
        {.name = "writeType", .selName = nil, .type = "s?"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, nil, SCValdiMarshallableObjectTypeClass);
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
// VRInstallBleHost.m
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

- (instancetype _Nonnull)initWithPush:(VRNavigationHostPushBlock _Nonnull)push pushForResult:(VRNavigationHostPushForResultBlock _Nonnull)pushForResult replace:(VRNavigationHostReplaceBlock _Nonnull)replace back:(VRNavigationHostBackBlock _Nonnull)back popToRoot:(VRNavigationHostPopToRootBlock _Nonnull)popToRoot reset:(VRNavigationHostResetBlock _Nonnull)reset switchTab:(VRNavigationHostSwitchTabBlock _Nonnull)switchTab setStatusBarStyle:(VRNavigationHostSetStatusBarStyleBlock _Nonnull)setStatusBarStyle currentPages:(VRNavigationHostCurrentPagesBlock _Nonnull)currentPages
{
    return [super initWithFieldValues:nil, push, pushForResult, replace, back, popToRoot, reset, switchTab, setStatusBarStyle, currentPages];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "oob:v", .invoker = &SCValdiFunctionInvokeOOB_v, .factory = &SCValdiBlockCreateOOB_v },
        { .typeEncoding = "od:v", .invoker = &SCValdiFunctionInvokeOD_v, .factory = &SCValdiBlockCreateOD_v },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "push", .selName = nil, .type = "f(s, s, s, s)"},
        {.name = "pushForResult", .selName = nil, .type = "f(s, s, s, s, f(s, b))"},
        {.name = "replace", .selName = nil, .type = "f(s, s, s)"},
        {.name = "back", .selName = nil, .type = "f(d)"},
        {.name = "popToRoot", .selName = nil, .type = "f()"},
        {.name = "reset", .selName = nil, .type = "f(s, s)"},
        {.name = "switchTab", .selName = nil, .type = "f(s)"},
        {.name = "setStatusBarStyle", .selName = nil, .type = "f(s)"},
        {.name = "currentPages", .selName = nil, .type = "f(f(s))"},
        {.name = nil},
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, nil, kBlocks, SCValdiMarshallableObjectTypeClass);
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
        {.name = "finish", .selName = nil, .type = "f(s)"},
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
@dynamic paramsJson;
@dynamic presentation;
@dynamic insets;
@dynamic visible;
@dynamic visibilityReason;

- (instancetype _Nonnull)initWithPageId:(NSString * _Nonnull)pageId route:(NSString * _Nonnull)route paramsJson:(NSString * _Nonnull)paramsJson presentation:(NSString * _Nonnull)presentation insets:(VRPageInsets * _Nonnull)insets visible:(BOOL)visible visibilityReason:(NSString * _Nonnull)visibilityReason
{
    return [super initWithFieldValues:nil, pageId, route, paramsJson, presentation, insets, visible, visibilityReason];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "pageId", .selName = nil, .type = "s"},
        {.name = "route", .selName = nil, .type = "s"},
        {.name = "paramsJson", .selName = nil, .type = "s"},
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
        {.name = "get", .selName = nil, .type = "f(s): s"},
        {.name = "set", .selName = nil, .type = "f(s, s): b"},
        {.name = "remove", .selName = nil, .type = "f(s)"},
        {.name = "clear", .selName = nil, .type = "f()"},
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
// VRBleHost.m
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


