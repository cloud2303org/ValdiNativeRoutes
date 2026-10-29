//
// ActionSheetRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ActionSheetRequest::ActionSheetRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ActionSheetRequest::ActionSheetRequest(const Valdi::StringBox &title, const std::vector<Valdi::StringBox> &itemList): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _itemList(std::move(itemList)) {
  }

  const Valdi::StringBox &ActionSheetRequest::getTitle() const {
    return _title;
  }

  void ActionSheetRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void ActionSheetRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const std::vector<Valdi::StringBox> &ActionSheetRequest::getItemList() const {
    return _itemList;
  }

  void ActionSheetRequest::setItemList(const std::vector<Valdi::StringBox> &value) {
    _itemList = value;
  }

  void ActionSheetRequest::setItemList(std::vector<Valdi::StringBox> &&value) {
    _itemList = std::move(value);
  }

  void ActionSheetRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ActionSheetRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._itemList);
  }

  void ActionSheetRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const ActionSheetRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._itemList);
  }

  Valdi::RegisteredCppGeneratedClass *ActionSheetRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ActionSheetRequest'{'title':s, 'itemList':a<s>}");

    return kRegisteredClass;
  }

}

//
// AppUIHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  AppUIHost::AppUIHost(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  AppUIHost::AppUIHost(const AppUIHost::ShowModalFn &showModal, const AppUIHost::ShowActionSheetFn &showActionSheet, const AppUIHost::ShowPickerFn &showPicker, const AppUIHost::ShowDatePickerFn &showDatePicker, const AppUIHost::ShowBottomSheetFn &showBottomSheet, const AppUIHost::PreviewImageFn &previewImage, const AppUIHost::ScanCodeFn &scanCode, const AppUIHost::PickAttachmentsFn &pickAttachments, const AppUIHost::ClearAttachmentCacheFn &clearAttachmentCache, const AppUIHost::ShowToastFn &showToast, const AppUIHost::HideToastFn &hideToast, const AppUIHost::ShowLoadingFn &showLoading, const AppUIHost::HideLoadingFn &hideLoading): Valdi::CppGeneratedModel(getRegisteredClass()),
  _showModal(std::move(showModal)),
  _showActionSheet(std::move(showActionSheet)),
  _showPicker(std::move(showPicker)),
  _showDatePicker(std::move(showDatePicker)),
  _showBottomSheet(std::move(showBottomSheet)),
  _previewImage(std::move(previewImage)),
  _scanCode(std::move(scanCode)),
  _pickAttachments(std::move(pickAttachments)),
  _clearAttachmentCache(std::move(clearAttachmentCache)),
  _showToast(std::move(showToast)),
  _hideToast(std::move(hideToast)),
  _showLoading(std::move(showLoading)),
  _hideLoading(std::move(hideLoading)) {
  }

  const AppUIHost::ShowModalFn &AppUIHost::getShowModal() const {
    return _showModal;
  }

  void AppUIHost::setShowModal(const AppUIHost::ShowModalFn &value) {
    _showModal = value;
  }

  void AppUIHost::setShowModal(AppUIHost::ShowModalFn &&value) {
    _showModal = std::move(value);
  }

  const AppUIHost::ShowActionSheetFn &AppUIHost::getShowActionSheet() const {
    return _showActionSheet;
  }

  void AppUIHost::setShowActionSheet(const AppUIHost::ShowActionSheetFn &value) {
    _showActionSheet = value;
  }

  void AppUIHost::setShowActionSheet(AppUIHost::ShowActionSheetFn &&value) {
    _showActionSheet = std::move(value);
  }

  const AppUIHost::ShowPickerFn &AppUIHost::getShowPicker() const {
    return _showPicker;
  }

  void AppUIHost::setShowPicker(const AppUIHost::ShowPickerFn &value) {
    _showPicker = value;
  }

  void AppUIHost::setShowPicker(AppUIHost::ShowPickerFn &&value) {
    _showPicker = std::move(value);
  }

  const AppUIHost::ShowDatePickerFn &AppUIHost::getShowDatePicker() const {
    return _showDatePicker;
  }

  void AppUIHost::setShowDatePicker(const AppUIHost::ShowDatePickerFn &value) {
    _showDatePicker = value;
  }

  void AppUIHost::setShowDatePicker(AppUIHost::ShowDatePickerFn &&value) {
    _showDatePicker = std::move(value);
  }

  const AppUIHost::ShowBottomSheetFn &AppUIHost::getShowBottomSheet() const {
    return _showBottomSheet;
  }

  void AppUIHost::setShowBottomSheet(const AppUIHost::ShowBottomSheetFn &value) {
    _showBottomSheet = value;
  }

  void AppUIHost::setShowBottomSheet(AppUIHost::ShowBottomSheetFn &&value) {
    _showBottomSheet = std::move(value);
  }

  const AppUIHost::PreviewImageFn &AppUIHost::getPreviewImage() const {
    return _previewImage;
  }

  void AppUIHost::setPreviewImage(const AppUIHost::PreviewImageFn &value) {
    _previewImage = value;
  }

  void AppUIHost::setPreviewImage(AppUIHost::PreviewImageFn &&value) {
    _previewImage = std::move(value);
  }

  const AppUIHost::ScanCodeFn &AppUIHost::getScanCode() const {
    return _scanCode;
  }

  void AppUIHost::setScanCode(const AppUIHost::ScanCodeFn &value) {
    _scanCode = value;
  }

  void AppUIHost::setScanCode(AppUIHost::ScanCodeFn &&value) {
    _scanCode = std::move(value);
  }

  const AppUIHost::PickAttachmentsFn &AppUIHost::getPickAttachments() const {
    return _pickAttachments;
  }

  void AppUIHost::setPickAttachments(const AppUIHost::PickAttachmentsFn &value) {
    _pickAttachments = value;
  }

  void AppUIHost::setPickAttachments(AppUIHost::PickAttachmentsFn &&value) {
    _pickAttachments = std::move(value);
  }

  const AppUIHost::ClearAttachmentCacheFn &AppUIHost::getClearAttachmentCache() const {
    return _clearAttachmentCache;
  }

  void AppUIHost::setClearAttachmentCache(const AppUIHost::ClearAttachmentCacheFn &value) {
    _clearAttachmentCache = value;
  }

  void AppUIHost::setClearAttachmentCache(AppUIHost::ClearAttachmentCacheFn &&value) {
    _clearAttachmentCache = std::move(value);
  }

  const AppUIHost::ShowToastFn &AppUIHost::getShowToast() const {
    return _showToast;
  }

  void AppUIHost::setShowToast(const AppUIHost::ShowToastFn &value) {
    _showToast = value;
  }

  void AppUIHost::setShowToast(AppUIHost::ShowToastFn &&value) {
    _showToast = std::move(value);
  }

  const AppUIHost::HideToastFn &AppUIHost::getHideToast() const {
    return _hideToast;
  }

  void AppUIHost::setHideToast(const AppUIHost::HideToastFn &value) {
    _hideToast = value;
  }

  void AppUIHost::setHideToast(AppUIHost::HideToastFn &&value) {
    _hideToast = std::move(value);
  }

  const AppUIHost::ShowLoadingFn &AppUIHost::getShowLoading() const {
    return _showLoading;
  }

  void AppUIHost::setShowLoading(const AppUIHost::ShowLoadingFn &value) {
    _showLoading = value;
  }

  void AppUIHost::setShowLoading(AppUIHost::ShowLoadingFn &&value) {
    _showLoading = std::move(value);
  }

  const AppUIHost::HideLoadingFn &AppUIHost::getHideLoading() const {
    return _hideLoading;
  }

  void AppUIHost::setHideLoading(const AppUIHost::HideLoadingFn &value) {
    _hideLoading = value;
  }

  void AppUIHost::setHideLoading(AppUIHost::HideLoadingFn &&value) {
    _hideLoading = std::move(value);
  }

  void AppUIHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, AppUIHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._showModal, self._showActionSheet, self._showPicker, self._showDatePicker, self._showBottomSheet, self._previewImage, self._scanCode, self._pickAttachments, self._clearAttachmentCache, self._showToast, self._hideToast, self._showLoading, self._hideLoading);
  }

  void AppUIHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const AppUIHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._showModal, self._showActionSheet, self._showPicker, self._showDatePicker, self._showBottomSheet, self._previewImage, self._scanCode, self._pickAttachments, self._clearAttachmentCache, self._showToast, self._hideToast, self._showLoading, self._hideLoading);
  }

  Valdi::RegisteredCppGeneratedClass *AppUIHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::AppUIHost'{'showModal':f(r:'[0]', f(s, r:'[1]')), 'showActionSheet':f(r:'[2]', f(s, r:'[3]')), 'showPicker':f(r:'[4]', f(s, r:'[3]')), 'showDatePicker':f(r:'[5]', f(s, r:'[3]')), 'showBottomSheet':f(r:'[6]', f(s, r:'[3]')), 'previewImage':f(r:'[7]', f(s, r:'[3]')), 'scanCode':f(f(s, r:'[8]')), 'pickAttachments':f(s, d, a<s>, f(s, r:'[9]')), 'clearAttachmentCache':f(f(s)), 'showToast':f(r:'[10]', f(s)), 'hideToast':f(f(s)), 'showLoading':f(r:'[11]', f(s)), 'hideLoading':f(f(s))}", []() -> Valdi::TypeReferencesVec {
      return {ModalRequest::getRegisteredClass(), ModalReply::getRegisteredClass(), ActionSheetRequest::getRegisteredClass(), PresentationReply::getRegisteredClass(), PickerRequest::getRegisteredClass(), DatePickerRequest::getRegisteredClass(), BottomSheetRequest::getRegisteredClass(), ImagePreviewRequest::getRegisteredClass(), ScanCodeReply::getRegisteredClass(), AttachmentSelection::getRegisteredClass(), ToastRequest::getRegisteredClass(), LoadingRequest::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AttachmentAsset.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  AttachmentAsset::AttachmentAsset(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  AttachmentAsset::AttachmentAsset(const Valdi::StringBox &id, const Valdi::StringBox &uri, const Valdi::StringBox &name, const Valdi::StringBox &mimeType, double size): Valdi::CppGeneratedModel(getRegisteredClass()),
  _id(std::move(id)),
  _uri(std::move(uri)),
  _name(std::move(name)),
  _mimeType(std::move(mimeType)),
  _size(size) {
  }

  const Valdi::StringBox &AttachmentAsset::getId() const {
    return _id;
  }

  void AttachmentAsset::setId(const Valdi::StringBox &value) {
    _id = value;
  }

  void AttachmentAsset::setId(Valdi::StringBox &&value) {
    _id = std::move(value);
  }

  const Valdi::StringBox &AttachmentAsset::getUri() const {
    return _uri;
  }

  void AttachmentAsset::setUri(const Valdi::StringBox &value) {
    _uri = value;
  }

  void AttachmentAsset::setUri(Valdi::StringBox &&value) {
    _uri = std::move(value);
  }

  const Valdi::StringBox &AttachmentAsset::getName() const {
    return _name;
  }

  void AttachmentAsset::setName(const Valdi::StringBox &value) {
    _name = value;
  }

  void AttachmentAsset::setName(Valdi::StringBox &&value) {
    _name = std::move(value);
  }

  const Valdi::StringBox &AttachmentAsset::getMimeType() const {
    return _mimeType;
  }

  void AttachmentAsset::setMimeType(const Valdi::StringBox &value) {
    _mimeType = value;
  }

  void AttachmentAsset::setMimeType(Valdi::StringBox &&value) {
    _mimeType = std::move(value);
  }

  double AttachmentAsset::getSize() const {
    return _size;
  }

  void AttachmentAsset::setSize(double value) {
    _size = value;
  }

  void AttachmentAsset::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, AttachmentAsset &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._id, self._uri, self._name, self._mimeType, self._size);
  }

  void AttachmentAsset::marshall(Valdi::ExceptionTracker &exceptionTracker, const AttachmentAsset &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._id, self._uri, self._name, self._mimeType, self._size);
  }

  Valdi::RegisteredCppGeneratedClass *AttachmentAsset::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::AttachmentAsset'{'id':s, 'uri':s, 'name':s, 'mimeType':s, 'size':d}");

    return kRegisteredClass;
  }

}

//
// AttachmentSelection.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  AttachmentSelection::AttachmentSelection(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  AttachmentSelection::AttachmentSelection(bool canceled, const std::vector<AttachmentAsset> &assets): Valdi::CppGeneratedModel(getRegisteredClass()),
  _canceled(canceled),
  _assets(std::move(assets)) {
  }

  bool AttachmentSelection::getCanceled() const {
    return _canceled;
  }

  void AttachmentSelection::setCanceled(bool value) {
    _canceled = value;
  }

  const std::vector<AttachmentAsset> &AttachmentSelection::getAssets() const {
    return _assets;
  }

  void AttachmentSelection::setAssets(const std::vector<AttachmentAsset> &value) {
    _assets = value;
  }

  void AttachmentSelection::setAssets(std::vector<AttachmentAsset> &&value) {
    _assets = std::move(value);
  }

  void AttachmentSelection::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, AttachmentSelection &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._canceled, self._assets);
  }

  void AttachmentSelection::marshall(Valdi::ExceptionTracker &exceptionTracker, const AttachmentSelection &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._canceled, self._assets);
  }

  Valdi::RegisteredCppGeneratedClass *AttachmentSelection::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::AttachmentSelection'{'canceled':b, 'assets':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {AttachmentAsset::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BleAdapterState.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleAdapterState::BleAdapterState(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleAdapterState::BleAdapterState(bool available, bool discovering, std::optional<bool> peripheralAvailable): Valdi::CppGeneratedModel(getRegisteredClass()),
  _available(available),
  _discovering(discovering),
  _peripheralAvailable(peripheralAvailable) {
  }

  bool BleAdapterState::getAvailable() const {
    return _available;
  }

  void BleAdapterState::setAvailable(bool value) {
    _available = value;
  }

  bool BleAdapterState::getDiscovering() const {
    return _discovering;
  }

  void BleAdapterState::setDiscovering(bool value) {
    _discovering = value;
  }

  std::optional<bool> BleAdapterState::getPeripheralAvailable() const {
    return _peripheralAvailable;
  }

  void BleAdapterState::setPeripheralAvailable(std::optional<bool> value) {
    _peripheralAvailable = value;
  }

  void BleAdapterState::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleAdapterState &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._available, self._discovering, self._peripheralAvailable);
  }

  void BleAdapterState::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleAdapterState &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._available, self._discovering, self._peripheralAvailable);
  }

  Valdi::RegisteredCppGeneratedClass *BleAdapterState::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleAdapterState'{'available':b, 'discovering':b, 'peripheralAvailable':b@?}");

    return kRegisteredClass;
  }

}

//
// BleCharacteristic.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleCharacteristic::BleCharacteristic(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleCharacteristic::BleCharacteristic(const Valdi::StringBox &uuid, const BleCharacteristicProperties &properties): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _properties(std::move(properties)) {
  }

  const Valdi::StringBox &BleCharacteristic::getUuid() const {
    return _uuid;
  }

  void BleCharacteristic::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BleCharacteristic::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  const BleCharacteristicProperties &BleCharacteristic::getProperties() const {
    return _properties;
  }

  void BleCharacteristic::setProperties(const BleCharacteristicProperties &value) {
    _properties = value;
  }

  void BleCharacteristic::setProperties(BleCharacteristicProperties &&value) {
    _properties = std::move(value);
  }

  void BleCharacteristic::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleCharacteristic &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._properties);
  }

  void BleCharacteristic::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleCharacteristic &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._properties);
  }

  Valdi::RegisteredCppGeneratedClass *BleCharacteristic::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleCharacteristic'{'uuid':s, 'properties':r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {BleCharacteristicProperties::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BleCharacteristicProperties.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleCharacteristicProperties::BleCharacteristicProperties(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleCharacteristicProperties::BleCharacteristicProperties(bool read, bool write, bool writeDefault, bool writeNoResponse, bool notify, bool indicate): Valdi::CppGeneratedModel(getRegisteredClass()),
  _read(read),
  _write(write),
  _writeDefault(writeDefault),
  _writeNoResponse(writeNoResponse),
  _notify(notify),
  _indicate(indicate) {
  }

  bool BleCharacteristicProperties::getRead() const {
    return _read;
  }

  void BleCharacteristicProperties::setRead(bool value) {
    _read = value;
  }

  bool BleCharacteristicProperties::getWrite() const {
    return _write;
  }

  void BleCharacteristicProperties::setWrite(bool value) {
    _write = value;
  }

  bool BleCharacteristicProperties::getWriteDefault() const {
    return _writeDefault;
  }

  void BleCharacteristicProperties::setWriteDefault(bool value) {
    _writeDefault = value;
  }

  bool BleCharacteristicProperties::getWriteNoResponse() const {
    return _writeNoResponse;
  }

  void BleCharacteristicProperties::setWriteNoResponse(bool value) {
    _writeNoResponse = value;
  }

  bool BleCharacteristicProperties::getNotify() const {
    return _notify;
  }

  void BleCharacteristicProperties::setNotify(bool value) {
    _notify = value;
  }

  bool BleCharacteristicProperties::getIndicate() const {
    return _indicate;
  }

  void BleCharacteristicProperties::setIndicate(bool value) {
    _indicate = value;
  }

  void BleCharacteristicProperties::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleCharacteristicProperties &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._read, self._write, self._writeDefault, self._writeNoResponse, self._notify, self._indicate);
  }

  void BleCharacteristicProperties::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleCharacteristicProperties &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._read, self._write, self._writeDefault, self._writeNoResponse, self._notify, self._indicate);
  }

  Valdi::RegisteredCppGeneratedClass *BleCharacteristicProperties::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleCharacteristicProperties'{'read':b, 'write':b, 'writeDefault':b, 'writeNoResponse':b, 'notify':b, 'indicate':b}");

    return kRegisteredClass;
  }

}

//
// BleCharacteristicValue.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleCharacteristicValue::BleCharacteristicValue(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleCharacteristicValue::BleCharacteristicValue(const Valdi::StringBox &deviceId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, const Valdi::BytesView &value): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _value(std::move(value)) {
  }

  const Valdi::StringBox &BleCharacteristicValue::getDeviceId() const {
    return _deviceId;
  }

  void BleCharacteristicValue::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleCharacteristicValue::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleCharacteristicValue::getServiceId() const {
    return _serviceId;
  }

  void BleCharacteristicValue::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BleCharacteristicValue::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BleCharacteristicValue::getCharacteristicId() const {
    return _characteristicId;
  }

  void BleCharacteristicValue::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BleCharacteristicValue::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  const Valdi::BytesView &BleCharacteristicValue::getValue() const {
    return _value;
  }

  void BleCharacteristicValue::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BleCharacteristicValue::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  void BleCharacteristicValue::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleCharacteristicValue &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._serviceId, self._characteristicId, self._value);
  }

  void BleCharacteristicValue::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleCharacteristicValue &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._serviceId, self._characteristicId, self._value);
  }

  Valdi::RegisteredCppGeneratedClass *BleCharacteristicValue::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleCharacteristicValue'{'deviceId':s, 'serviceId':s, 'characteristicId':s, 'value':t}");

    return kRegisteredClass;
  }

}

//
// BleConnectStateChange.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleConnectStateChange::BleConnectStateChange(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleConnectStateChange::BleConnectStateChange(const Valdi::StringBox &deviceId, bool connected): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _connected(connected) {
  }

  const Valdi::StringBox &BleConnectStateChange::getDeviceId() const {
    return _deviceId;
  }

  void BleConnectStateChange::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleConnectStateChange::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  bool BleConnectStateChange::getConnected() const {
    return _connected;
  }

  void BleConnectStateChange::setConnected(bool value) {
    _connected = value;
  }

  void BleConnectStateChange::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleConnectStateChange &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._connected);
  }

  void BleConnectStateChange::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleConnectStateChange &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._connected);
  }

  Valdi::RegisteredCppGeneratedClass *BleConnectStateChange::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleConnectStateChange'{'deviceId':s, 'connected':b}");

    return kRegisteredClass;
  }

}

//
// BleConnectedDevice.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleConnectedDevice::BleConnectedDevice(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleConnectedDevice::BleConnectedDevice(const Valdi::StringBox &deviceId, const Valdi::StringBox &name): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _name(std::move(name)) {
  }

  const Valdi::StringBox &BleConnectedDevice::getDeviceId() const {
    return _deviceId;
  }

  void BleConnectedDevice::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleConnectedDevice::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleConnectedDevice::getName() const {
    return _name;
  }

  void BleConnectedDevice::setName(const Valdi::StringBox &value) {
    _name = value;
  }

  void BleConnectedDevice::setName(Valdi::StringBox &&value) {
    _name = std::move(value);
  }

  void BleConnectedDevice::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleConnectedDevice &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._name);
  }

  void BleConnectedDevice::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleConnectedDevice &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._name);
  }

  Valdi::RegisteredCppGeneratedClass *BleConnectedDevice::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleConnectedDevice'{'deviceId':s, 'name':s}");

    return kRegisteredClass;
  }

}

//
// BleDevice.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleDevice::BleDevice(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleDevice::BleDevice(double RSSI, const Valdi::BytesView &advertisData, const std::vector<Valdi::StringBox> &advertisServiceUUIDs, const Valdi::StringBox &deviceId, const Valdi::StringBox &localName, const Valdi::StringBox &name, const std::vector<BleServiceData> &serviceData, std::optional<bool> connectable): Valdi::CppGeneratedModel(getRegisteredClass()),
  _RSSI(RSSI),
  _advertisData(std::move(advertisData)),
  _advertisServiceUUIDs(std::move(advertisServiceUUIDs)),
  _deviceId(std::move(deviceId)),
  _localName(std::move(localName)),
  _name(std::move(name)),
  _serviceData(std::move(serviceData)),
  _connectable(connectable) {
  }

  double BleDevice::getRSSI() const {
    return _RSSI;
  }

  void BleDevice::setRSSI(double value) {
    _RSSI = value;
  }

  const Valdi::BytesView &BleDevice::getAdvertisData() const {
    return _advertisData;
  }

  void BleDevice::setAdvertisData(const Valdi::BytesView &value) {
    _advertisData = value;
  }

  void BleDevice::setAdvertisData(Valdi::BytesView &&value) {
    _advertisData = std::move(value);
  }

  const std::vector<Valdi::StringBox> &BleDevice::getAdvertisServiceUUIDs() const {
    return _advertisServiceUUIDs;
  }

  void BleDevice::setAdvertisServiceUUIDs(const std::vector<Valdi::StringBox> &value) {
    _advertisServiceUUIDs = value;
  }

  void BleDevice::setAdvertisServiceUUIDs(std::vector<Valdi::StringBox> &&value) {
    _advertisServiceUUIDs = std::move(value);
  }

  const Valdi::StringBox &BleDevice::getDeviceId() const {
    return _deviceId;
  }

  void BleDevice::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleDevice::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleDevice::getLocalName() const {
    return _localName;
  }

  void BleDevice::setLocalName(const Valdi::StringBox &value) {
    _localName = value;
  }

  void BleDevice::setLocalName(Valdi::StringBox &&value) {
    _localName = std::move(value);
  }

  const Valdi::StringBox &BleDevice::getName() const {
    return _name;
  }

  void BleDevice::setName(const Valdi::StringBox &value) {
    _name = value;
  }

  void BleDevice::setName(Valdi::StringBox &&value) {
    _name = std::move(value);
  }

  const std::vector<BleServiceData> &BleDevice::getServiceData() const {
    return _serviceData;
  }

  void BleDevice::setServiceData(const std::vector<BleServiceData> &value) {
    _serviceData = value;
  }

  void BleDevice::setServiceData(std::vector<BleServiceData> &&value) {
    _serviceData = std::move(value);
  }

  std::optional<bool> BleDevice::getConnectable() const {
    return _connectable;
  }

  void BleDevice::setConnectable(std::optional<bool> value) {
    _connectable = value;
  }

  void BleDevice::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleDevice &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._RSSI, self._advertisData, self._advertisServiceUUIDs, self._deviceId, self._localName, self._name, self._serviceData, self._connectable);
  }

  void BleDevice::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleDevice &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._RSSI, self._advertisData, self._advertisServiceUUIDs, self._deviceId, self._localName, self._name, self._serviceData, self._connectable);
  }

  Valdi::RegisteredCppGeneratedClass *BleDevice::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleDevice'{'RSSI':d, 'advertisData':t, 'advertisServiceUUIDs':a<s>, 'deviceId':s, 'localName':s, 'name':s, 'serviceData':a<r:'[0]'>, 'connectable':b@?}", []() -> Valdi::TypeReferencesVec {
      return {BleServiceData::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BleHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class BleHostProxy: public BleHost {
    public:
    using SetEventsFn = Valdi::Function<void(BleHostEvents)>;
    using OpenBluetoothAdapterFn = Valdi::Function<Valdi::Future<void>(std::optional<Valdi::StringBox>)>;
    using CloseBluetoothAdapterFn = Valdi::Function<Valdi::Future<void>()>;
    using GetBluetoothAdapterStateFn = Valdi::Function<Valdi::Future<BleAdapterState>()>;
    using StartBluetoothDevicesDiscoveryFn = Valdi::Function<Valdi::Future<void>(BleScanParams)>;
    using StartBluetoothDevicesDiscoveryWithNamesFn = Valdi::Function<Valdi::Future<void>(std::vector<Valdi::StringBox>)>;
    using StartBluetoothDevicesDiscoveryWithAddressesFn = Valdi::Function<Valdi::Future<void>(std::vector<Valdi::StringBox>)>;
    using StopBluetoothDevicesDiscoveryFn = Valdi::Function<Valdi::Future<void>()>;
    using GetBluetoothDevicesFn = Valdi::Function<Valdi::Future<std::vector<BleDevice>>()>;
    using CreateBLEConnectionFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox, std::optional<double>)>;
    using CloseBLEConnectionFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox)>;
    using MakeBluetoothPairFn = Valdi::Function<Valdi::Future<void>(BlePairParams)>;
    using IsBluetoothDevicePairedFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox)>;
    using GetBLEDeviceServicesFn = Valdi::Function<Valdi::Future<std::vector<BleService>>(Valdi::StringBox)>;
    using GetBLEDeviceRSSIFn = Valdi::Function<Valdi::Future<double>(Valdi::StringBox)>;
    using GetBLEDeviceCharacteristicsFn = Valdi::Function<Valdi::Future<std::vector<BleCharacteristic>>(Valdi::StringBox, Valdi::StringBox)>;
    using NotifyBLECharacteristicValueChangeFn = Valdi::Function<Valdi::Future<void>(BleNotifyParams)>;
    using WriteBLECharacteristicValueFn = Valdi::Function<Valdi::Future<void>(BleWriteParams)>;
    using ReadBLECharacteristicValueFn = Valdi::Function<Valdi::Future<void>(BleReadParams)>;
    using SetBLEMTUFn = Valdi::Function<Valdi::Future<double>(Valdi::StringBox, double)>;
    using GetBLEMTUFn = Valdi::Function<Valdi::Future<double>(Valdi::StringBox, std::optional<Valdi::StringBox>)>;
    using GetConnectedBluetoothDevicesFn = Valdi::Function<Valdi::Future<std::vector<BleConnectedDevice>>(std::vector<Valdi::StringBox>)>;
    using CreateBLEPeripheralServerFn = Valdi::Function<Valdi::Future<Valdi::StringBox>()>;
    using AddPeripheralServiceFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox, BlePeripheralService)>;
    using RemovePeripheralServiceFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox, Valdi::StringBox)>;
    using StartPeripheralAdvertisingFn = Valdi::Function<Valdi::Future<void>(BlePeripheralAdvertisingParams)>;
    using StopPeripheralAdvertisingFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox)>;
    using WritePeripheralCharacteristicValueFn = Valdi::Function<Valdi::Future<void>(BlePeripheralWriteParams)>;
    using CloseBLEPeripheralServerFn = Valdi::Function<Valdi::Future<void>(Valdi::StringBox)>;

    BleHostProxy() = default;
    ~BleHostProxy() override = default;

    void setEvents(BleHostEvents events) final {
      _setEvents(events);
    }

    Valdi::Future<void> openBluetoothAdapter(std::optional<Valdi::StringBox> mode) final {
      return _openBluetoothAdapter(mode);
    }

    Valdi::Future<void> closeBluetoothAdapter() final {
      return _closeBluetoothAdapter();
    }

    Valdi::Future<BleAdapterState> getBluetoothAdapterState() final {
      return _getBluetoothAdapterState();
    }

    Valdi::Future<void> startBluetoothDevicesDiscovery(BleScanParams params) final {
      return _startBluetoothDevicesDiscovery(params);
    }

    Valdi::Future<void> startBluetoothDevicesDiscoveryWithNames(std::vector<Valdi::StringBox> names) final {
      return _startBluetoothDevicesDiscoveryWithNames(names);
    }

    Valdi::Future<void> startBluetoothDevicesDiscoveryWithAddresses(std::vector<Valdi::StringBox> addresses) final {
      return _startBluetoothDevicesDiscoveryWithAddresses(addresses);
    }

    Valdi::Future<void> stopBluetoothDevicesDiscovery() final {
      return _stopBluetoothDevicesDiscovery();
    }

    Valdi::Future<std::vector<BleDevice>> getBluetoothDevices() final {
      return _getBluetoothDevices();
    }

    Valdi::Future<void> createBLEConnection(Valdi::StringBox deviceId, std::optional<double> timeout) final {
      return _createBLEConnection(deviceId, timeout);
    }

    Valdi::Future<void> closeBLEConnection(Valdi::StringBox deviceId) final {
      return _closeBLEConnection(deviceId);
    }

    Valdi::Future<void> makeBluetoothPair(BlePairParams params) final {
      return _makeBluetoothPair(params);
    }

    Valdi::Future<void> isBluetoothDevicePaired(Valdi::StringBox deviceId) final {
      return _isBluetoothDevicePaired(deviceId);
    }

    Valdi::Future<std::vector<BleService>> getBLEDeviceServices(Valdi::StringBox deviceId) final {
      return _getBLEDeviceServices(deviceId);
    }

    Valdi::Future<double> getBLEDeviceRSSI(Valdi::StringBox deviceId) final {
      return _getBLEDeviceRSSI(deviceId);
    }

    Valdi::Future<std::vector<BleCharacteristic>> getBLEDeviceCharacteristics(Valdi::StringBox deviceId, Valdi::StringBox serviceId) final {
      return _getBLEDeviceCharacteristics(deviceId, serviceId);
    }

    Valdi::Future<void> notifyBLECharacteristicValueChange(BleNotifyParams params) final {
      return _notifyBLECharacteristicValueChange(params);
    }

    Valdi::Future<void> writeBLECharacteristicValue(BleWriteParams params) final {
      return _writeBLECharacteristicValue(params);
    }

    Valdi::Future<void> readBLECharacteristicValue(BleReadParams params) final {
      return _readBLECharacteristicValue(params);
    }

    Valdi::Future<double> setBLEMTU(Valdi::StringBox deviceId, double mtu) final {
      return _setBLEMTU(deviceId, mtu);
    }

    Valdi::Future<double> getBLEMTU(Valdi::StringBox deviceId, std::optional<Valdi::StringBox> writeType) final {
      return _getBLEMTU(deviceId, writeType);
    }

    Valdi::Future<std::vector<BleConnectedDevice>> getConnectedBluetoothDevices(std::vector<Valdi::StringBox> services) final {
      return _getConnectedBluetoothDevices(services);
    }

    Valdi::Future<Valdi::StringBox> createBLEPeripheralServer() final {
      return _createBLEPeripheralServer();
    }

    Valdi::Future<void> addPeripheralService(Valdi::StringBox serverId, BlePeripheralService service) final {
      return _addPeripheralService(serverId, service);
    }

    Valdi::Future<void> removePeripheralService(Valdi::StringBox serverId, Valdi::StringBox serviceId) final {
      return _removePeripheralService(serverId, serviceId);
    }

    Valdi::Future<void> startPeripheralAdvertising(BlePeripheralAdvertisingParams params) final {
      return _startPeripheralAdvertising(params);
    }

    Valdi::Future<void> stopPeripheralAdvertising(Valdi::StringBox serverId) final {
      return _stopPeripheralAdvertising(serverId);
    }

    Valdi::Future<void> writePeripheralCharacteristicValue(BlePeripheralWriteParams params) final {
      return _writePeripheralCharacteristicValue(params);
    }

    Valdi::Future<void> closeBLEPeripheralServer(Valdi::StringBox serverId) final {
      return _closeBLEPeripheralServer(serverId);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<BleHostProxy> &out) {
      out = Valdi::makeShared<BleHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._setEvents, self._openBluetoothAdapter, self._closeBluetoothAdapter, self._getBluetoothAdapterState, self._startBluetoothDevicesDiscovery, self._startBluetoothDevicesDiscoveryWithNames, self._startBluetoothDevicesDiscoveryWithAddresses, self._stopBluetoothDevicesDiscovery, self._getBluetoothDevices, self._createBLEConnection, self._closeBLEConnection, self._makeBluetoothPair, self._isBluetoothDevicePaired, self._getBLEDeviceServices, self._getBLEDeviceRSSI, self._getBLEDeviceCharacteristics, self._notifyBLECharacteristicValueChange, self._writeBLECharacteristicValue, self._readBLECharacteristicValue, self._setBLEMTU, self._getBLEMTU, self._getConnectedBluetoothDevices, self._createBLEPeripheralServer, self._addPeripheralService, self._removePeripheralService, self._startPeripheralAdvertising, self._stopPeripheralAdvertising, self._writePeripheralCharacteristicValue, self._closeBLEPeripheralServer);
    }

    private:
    SetEventsFn _setEvents;
    OpenBluetoothAdapterFn _openBluetoothAdapter;
    CloseBluetoothAdapterFn _closeBluetoothAdapter;
    GetBluetoothAdapterStateFn _getBluetoothAdapterState;
    StartBluetoothDevicesDiscoveryFn _startBluetoothDevicesDiscovery;
    StartBluetoothDevicesDiscoveryWithNamesFn _startBluetoothDevicesDiscoveryWithNames;
    StartBluetoothDevicesDiscoveryWithAddressesFn _startBluetoothDevicesDiscoveryWithAddresses;
    StopBluetoothDevicesDiscoveryFn _stopBluetoothDevicesDiscovery;
    GetBluetoothDevicesFn _getBluetoothDevices;
    CreateBLEConnectionFn _createBLEConnection;
    CloseBLEConnectionFn _closeBLEConnection;
    MakeBluetoothPairFn _makeBluetoothPair;
    IsBluetoothDevicePairedFn _isBluetoothDevicePaired;
    GetBLEDeviceServicesFn _getBLEDeviceServices;
    GetBLEDeviceRSSIFn _getBLEDeviceRSSI;
    GetBLEDeviceCharacteristicsFn _getBLEDeviceCharacteristics;
    NotifyBLECharacteristicValueChangeFn _notifyBLECharacteristicValueChange;
    WriteBLECharacteristicValueFn _writeBLECharacteristicValue;
    ReadBLECharacteristicValueFn _readBLECharacteristicValue;
    SetBLEMTUFn _setBLEMTU;
    GetBLEMTUFn _getBLEMTU;
    GetConnectedBluetoothDevicesFn _getConnectedBluetoothDevices;
    CreateBLEPeripheralServerFn _createBLEPeripheralServer;
    AddPeripheralServiceFn _addPeripheralService;
    RemovePeripheralServiceFn _removePeripheralService;
    StartPeripheralAdvertisingFn _startPeripheralAdvertising;
    StopPeripheralAdvertisingFn _stopPeripheralAdvertising;
    WritePeripheralCharacteristicValueFn _writePeripheralCharacteristicValue;
    CloseBLEPeripheralServerFn _closeBLEPeripheralServer;
  };

  BleHost::BleHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void BleHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<BleHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<BleHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void BleHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<BleHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::setEvents>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::openBluetoothAdapter>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::closeBluetoothAdapter>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBluetoothAdapterState>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::startBluetoothDevicesDiscovery>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::startBluetoothDevicesDiscoveryWithNames>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::startBluetoothDevicesDiscoveryWithAddresses>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::stopBluetoothDevicesDiscovery>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBluetoothDevices>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::createBLEConnection>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::closeBLEConnection>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::makeBluetoothPair>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::isBluetoothDevicePaired>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBLEDeviceServices>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBLEDeviceRSSI>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBLEDeviceCharacteristics>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::notifyBLECharacteristicValueChange>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::writeBLECharacteristicValue>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::readBLECharacteristicValue>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::setBLEMTU>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getBLEMTU>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::getConnectedBluetoothDevices>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::createBLEPeripheralServer>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::addPeripheralService>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::removePeripheralService>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::startPeripheralAdvertising>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::stopPeripheralAdvertising>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::writePeripheralCharacteristicValue>(value), Valdi::CppMarshaller::methodToFunction<BleHost, &BleHost::closeBLEPeripheralServer>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *BleHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::BleHost'{'setEvents':f|m|(r:'[0]'), 'openBluetoothAdapter':f|m|(s?): p<v>, 'closeBluetoothAdapter':f|m|(): p<v>, 'getBluetoothAdapterState':f|m|(): p<r:'[1]'>, 'startBluetoothDevicesDiscovery':f|m|(r:'[2]'): p<v>, 'startBluetoothDevicesDiscoveryWithNames':f|m|(a<s>): p<v>, 'startBluetoothDevicesDiscoveryWithAddresses':f|m|(a<s>): p<v>, 'stopBluetoothDevicesDiscovery':f|m|(): p<v>, 'getBluetoothDevices':f|m|(): p<a<r:'[3]'>>, 'createBLEConnection':f|m|(s, d@?): p<v>, 'closeBLEConnection':f|m|(s): p<v>, 'makeBluetoothPair':f|m|(r:'[4]'): p<v>, 'isBluetoothDevicePaired':f|m|(s): p<v>, 'getBLEDeviceServices':f|m|(s): p<a<r:'[5]'>>, 'getBLEDeviceRSSI':f|m|(s): p<d@>, 'getBLEDeviceCharacteristics':f|m|(s, s): p<a<r:'[6]'>>, 'notifyBLECharacteristicValueChange':f|m|(r:'[7]'): p<v>, 'writeBLECharacteristicValue':f|m|(r:'[8]'): p<v>, 'readBLECharacteristicValue':f|m|(r:'[9]'): p<v>, 'setBLEMTU':f|m|(s, d): p<d@>, 'getBLEMTU':f|m|(s, s?): p<d@>, 'getConnectedBluetoothDevices':f|m|(a<s>): p<a<r:'[10]'>>, 'createBLEPeripheralServer':f|m|(): p<s>, 'addPeripheralService':f|m|(s, r:'[11]'): p<v>, 'removePeripheralService':f|m|(s, s): p<v>, 'startPeripheralAdvertising':f|m|(r:'[12]'): p<v>, 'stopPeripheralAdvertising':f|m|(s): p<v>, 'writePeripheralCharacteristicValue':f|m|(r:'[13]'): p<v>, 'closeBLEPeripheralServer':f|m|(s): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {BleHostEvents::getRegisteredClass(), BleAdapterState::getRegisteredClass(), BleScanParams::getRegisteredClass(), BleDevice::getRegisteredClass(), BlePairParams::getRegisteredClass(), BleService::getRegisteredClass(), BleCharacteristic::getRegisteredClass(), BleNotifyParams::getRegisteredClass(), BleWriteParams::getRegisteredClass(), BleReadParams::getRegisteredClass(), BleConnectedDevice::getRegisteredClass(), BlePeripheralService::getRegisteredClass(), BlePeripheralAdvertisingParams::getRegisteredClass(), BlePeripheralWriteParams::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BleHostEvents.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleHostEvents::BleHostEvents(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleHostEvents::BleHostEvents(const BleHostEvents::DeviceFoundFn &deviceFound, const BleHostEvents::AdapterStateChangeFn &adapterStateChange, const BleHostEvents::ConnectStateChangeFn &connectStateChange, const BleHostEvents::CharacteristicUpdateFn &characteristicUpdate, const BleHostEvents::MtuChangeFn &mtuChange, const BleHostEvents::PeripheralReadRequestFn &peripheralReadRequest, const BleHostEvents::PeripheralWriteRequestFn &peripheralWriteRequest, const BleHostEvents::PeripheralSubscribedFn &peripheralSubscribed, const BleHostEvents::PeripheralUnsubscribedFn &peripheralUnsubscribed, const BleHostEvents::PeripheralConnectionStateChangeFn &peripheralConnectionStateChange): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceFound(std::move(deviceFound)),
  _adapterStateChange(std::move(adapterStateChange)),
  _connectStateChange(std::move(connectStateChange)),
  _characteristicUpdate(std::move(characteristicUpdate)),
  _mtuChange(std::move(mtuChange)),
  _peripheralReadRequest(std::move(peripheralReadRequest)),
  _peripheralWriteRequest(std::move(peripheralWriteRequest)),
  _peripheralSubscribed(std::move(peripheralSubscribed)),
  _peripheralUnsubscribed(std::move(peripheralUnsubscribed)),
  _peripheralConnectionStateChange(std::move(peripheralConnectionStateChange)) {
  }

  const BleHostEvents::DeviceFoundFn &BleHostEvents::getDeviceFound() const {
    return _deviceFound;
  }

  void BleHostEvents::setDeviceFound(const BleHostEvents::DeviceFoundFn &value) {
    _deviceFound = value;
  }

  void BleHostEvents::setDeviceFound(BleHostEvents::DeviceFoundFn &&value) {
    _deviceFound = std::move(value);
  }

  const BleHostEvents::AdapterStateChangeFn &BleHostEvents::getAdapterStateChange() const {
    return _adapterStateChange;
  }

  void BleHostEvents::setAdapterStateChange(const BleHostEvents::AdapterStateChangeFn &value) {
    _adapterStateChange = value;
  }

  void BleHostEvents::setAdapterStateChange(BleHostEvents::AdapterStateChangeFn &&value) {
    _adapterStateChange = std::move(value);
  }

  const BleHostEvents::ConnectStateChangeFn &BleHostEvents::getConnectStateChange() const {
    return _connectStateChange;
  }

  void BleHostEvents::setConnectStateChange(const BleHostEvents::ConnectStateChangeFn &value) {
    _connectStateChange = value;
  }

  void BleHostEvents::setConnectStateChange(BleHostEvents::ConnectStateChangeFn &&value) {
    _connectStateChange = std::move(value);
  }

  const BleHostEvents::CharacteristicUpdateFn &BleHostEvents::getCharacteristicUpdate() const {
    return _characteristicUpdate;
  }

  void BleHostEvents::setCharacteristicUpdate(const BleHostEvents::CharacteristicUpdateFn &value) {
    _characteristicUpdate = value;
  }

  void BleHostEvents::setCharacteristicUpdate(BleHostEvents::CharacteristicUpdateFn &&value) {
    _characteristicUpdate = std::move(value);
  }

  const BleHostEvents::MtuChangeFn &BleHostEvents::getMtuChange() const {
    return _mtuChange;
  }

  void BleHostEvents::setMtuChange(const BleHostEvents::MtuChangeFn &value) {
    _mtuChange = value;
  }

  void BleHostEvents::setMtuChange(BleHostEvents::MtuChangeFn &&value) {
    _mtuChange = std::move(value);
  }

  const BleHostEvents::PeripheralReadRequestFn &BleHostEvents::getPeripheralReadRequest() const {
    return _peripheralReadRequest;
  }

  void BleHostEvents::setPeripheralReadRequest(const BleHostEvents::PeripheralReadRequestFn &value) {
    _peripheralReadRequest = value;
  }

  void BleHostEvents::setPeripheralReadRequest(BleHostEvents::PeripheralReadRequestFn &&value) {
    _peripheralReadRequest = std::move(value);
  }

  const BleHostEvents::PeripheralWriteRequestFn &BleHostEvents::getPeripheralWriteRequest() const {
    return _peripheralWriteRequest;
  }

  void BleHostEvents::setPeripheralWriteRequest(const BleHostEvents::PeripheralWriteRequestFn &value) {
    _peripheralWriteRequest = value;
  }

  void BleHostEvents::setPeripheralWriteRequest(BleHostEvents::PeripheralWriteRequestFn &&value) {
    _peripheralWriteRequest = std::move(value);
  }

  const BleHostEvents::PeripheralSubscribedFn &BleHostEvents::getPeripheralSubscribed() const {
    return _peripheralSubscribed;
  }

  void BleHostEvents::setPeripheralSubscribed(const BleHostEvents::PeripheralSubscribedFn &value) {
    _peripheralSubscribed = value;
  }

  void BleHostEvents::setPeripheralSubscribed(BleHostEvents::PeripheralSubscribedFn &&value) {
    _peripheralSubscribed = std::move(value);
  }

  const BleHostEvents::PeripheralUnsubscribedFn &BleHostEvents::getPeripheralUnsubscribed() const {
    return _peripheralUnsubscribed;
  }

  void BleHostEvents::setPeripheralUnsubscribed(const BleHostEvents::PeripheralUnsubscribedFn &value) {
    _peripheralUnsubscribed = value;
  }

  void BleHostEvents::setPeripheralUnsubscribed(BleHostEvents::PeripheralUnsubscribedFn &&value) {
    _peripheralUnsubscribed = std::move(value);
  }

  const BleHostEvents::PeripheralConnectionStateChangeFn &BleHostEvents::getPeripheralConnectionStateChange() const {
    return _peripheralConnectionStateChange;
  }

  void BleHostEvents::setPeripheralConnectionStateChange(const BleHostEvents::PeripheralConnectionStateChangeFn &value) {
    _peripheralConnectionStateChange = value;
  }

  void BleHostEvents::setPeripheralConnectionStateChange(BleHostEvents::PeripheralConnectionStateChangeFn &&value) {
    _peripheralConnectionStateChange = std::move(value);
  }

  void BleHostEvents::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleHostEvents &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceFound, self._adapterStateChange, self._connectStateChange, self._characteristicUpdate, self._mtuChange, self._peripheralReadRequest, self._peripheralWriteRequest, self._peripheralSubscribed, self._peripheralUnsubscribed, self._peripheralConnectionStateChange);
  }

  void BleHostEvents::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleHostEvents &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceFound, self._adapterStateChange, self._connectStateChange, self._characteristicUpdate, self._mtuChange, self._peripheralReadRequest, self._peripheralWriteRequest, self._peripheralSubscribed, self._peripheralUnsubscribed, self._peripheralConnectionStateChange);
  }

  Valdi::RegisteredCppGeneratedClass *BleHostEvents::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleHostEvents'{'deviceFound':f(r:'[0]'), 'adapterStateChange':f(r:'[1]'), 'connectStateChange':f(r:'[2]'), 'characteristicUpdate':f(r:'[3]'), 'mtuChange':f(r:'[4]'), 'peripheralReadRequest':f(r:'[5]'), 'peripheralWriteRequest':f(r:'[6]'), 'peripheralSubscribed':f(r:'[7]'), 'peripheralUnsubscribed':f(r:'[7]'), 'peripheralConnectionStateChange':f(r:'[8]')}", []() -> Valdi::TypeReferencesVec {
      return {BleDevice::getRegisteredClass(), BleAdapterState::getRegisteredClass(), BleConnectStateChange::getRegisteredClass(), BleCharacteristicValue::getRegisteredClass(), BleMTUChange::getRegisteredClass(), BlePeripheralReadRequest::getRegisteredClass(), BlePeripheralWriteRequest::getRegisteredClass(), BlePeripheralSubscriptionEvent::getRegisteredClass(), BlePeripheralConnectionState::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BleMTUChange.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleMTUChange::BleMTUChange(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleMTUChange::BleMTUChange(const Valdi::StringBox &deviceId, double mtu): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _mtu(mtu) {
  }

  const Valdi::StringBox &BleMTUChange::getDeviceId() const {
    return _deviceId;
  }

  void BleMTUChange::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleMTUChange::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  double BleMTUChange::getMtu() const {
    return _mtu;
  }

  void BleMTUChange::setMtu(double value) {
    _mtu = value;
  }

  void BleMTUChange::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleMTUChange &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._mtu);
  }

  void BleMTUChange::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleMTUChange &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._mtu);
  }

  Valdi::RegisteredCppGeneratedClass *BleMTUChange::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleMTUChange'{'deviceId':s, 'mtu':d}");

    return kRegisteredClass;
  }

}

//
// BleNotifyParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleNotifyParams::BleNotifyParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleNotifyParams::BleNotifyParams(const Valdi::StringBox &deviceId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, bool state, const std::optional<Valdi::StringBox> &type): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _state(state),
  _type(std::move(type)) {
  }

  const Valdi::StringBox &BleNotifyParams::getDeviceId() const {
    return _deviceId;
  }

  void BleNotifyParams::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleNotifyParams::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleNotifyParams::getServiceId() const {
    return _serviceId;
  }

  void BleNotifyParams::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BleNotifyParams::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BleNotifyParams::getCharacteristicId() const {
    return _characteristicId;
  }

  void BleNotifyParams::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BleNotifyParams::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  bool BleNotifyParams::getState() const {
    return _state;
  }

  void BleNotifyParams::setState(bool value) {
    _state = value;
  }

  const std::optional<Valdi::StringBox> &BleNotifyParams::getType() const {
    return _type;
  }

  void BleNotifyParams::setType(const std::optional<Valdi::StringBox> &value) {
    _type = value;
  }

  void BleNotifyParams::setType(std::optional<Valdi::StringBox> &&value) {
    _type = std::move(value);
  }

  void BleNotifyParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleNotifyParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._serviceId, self._characteristicId, self._state, self._type);
  }

  void BleNotifyParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleNotifyParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._serviceId, self._characteristicId, self._state, self._type);
  }

  Valdi::RegisteredCppGeneratedClass *BleNotifyParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleNotifyParams'{'deviceId':s, 'serviceId':s, 'characteristicId':s, 'state':b, 'type':s?}");

    return kRegisteredClass;
  }

}

//
// BlePairParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePairParams::BlePairParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePairParams::BlePairParams(const Valdi::StringBox &deviceId, const Valdi::StringBox &pin, double timeout): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _pin(std::move(pin)),
  _timeout(timeout) {
  }

  const Valdi::StringBox &BlePairParams::getDeviceId() const {
    return _deviceId;
  }

  void BlePairParams::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BlePairParams::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BlePairParams::getPin() const {
    return _pin;
  }

  void BlePairParams::setPin(const Valdi::StringBox &value) {
    _pin = value;
  }

  void BlePairParams::setPin(Valdi::StringBox &&value) {
    _pin = std::move(value);
  }

  double BlePairParams::getTimeout() const {
    return _timeout;
  }

  void BlePairParams::setTimeout(double value) {
    _timeout = value;
  }

  void BlePairParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePairParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._pin, self._timeout);
  }

  void BlePairParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePairParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._pin, self._timeout);
  }

  Valdi::RegisteredCppGeneratedClass *BlePairParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePairParams'{'deviceId':s, 'pin':s, 'timeout':d}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralAdvertisingParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralAdvertisingParams::BlePeripheralAdvertisingParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralAdvertisingParams::BlePeripheralAdvertisingParams(const Valdi::StringBox &serverId, bool connectable, const Valdi::StringBox &deviceName, const std::vector<Valdi::StringBox> &serviceUuids, const std::vector<BlePeripheralManufacturerData> &manufacturerData, const Valdi::StringBox &powerLevel, const Valdi::Ref<BlePeripheralBeacon> &beacon): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _connectable(connectable),
  _deviceName(std::move(deviceName)),
  _serviceUuids(std::move(serviceUuids)),
  _manufacturerData(std::move(manufacturerData)),
  _powerLevel(std::move(powerLevel)),
  _beacon(std::move(beacon)) {
  }

  const Valdi::StringBox &BlePeripheralAdvertisingParams::getServerId() const {
    return _serverId;
  }

  void BlePeripheralAdvertisingParams::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralAdvertisingParams::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  bool BlePeripheralAdvertisingParams::getConnectable() const {
    return _connectable;
  }

  void BlePeripheralAdvertisingParams::setConnectable(bool value) {
    _connectable = value;
  }

  const Valdi::StringBox &BlePeripheralAdvertisingParams::getDeviceName() const {
    return _deviceName;
  }

  void BlePeripheralAdvertisingParams::setDeviceName(const Valdi::StringBox &value) {
    _deviceName = value;
  }

  void BlePeripheralAdvertisingParams::setDeviceName(Valdi::StringBox &&value) {
    _deviceName = std::move(value);
  }

  const std::vector<Valdi::StringBox> &BlePeripheralAdvertisingParams::getServiceUuids() const {
    return _serviceUuids;
  }

  void BlePeripheralAdvertisingParams::setServiceUuids(const std::vector<Valdi::StringBox> &value) {
    _serviceUuids = value;
  }

  void BlePeripheralAdvertisingParams::setServiceUuids(std::vector<Valdi::StringBox> &&value) {
    _serviceUuids = std::move(value);
  }

  const std::vector<BlePeripheralManufacturerData> &BlePeripheralAdvertisingParams::getManufacturerData() const {
    return _manufacturerData;
  }

  void BlePeripheralAdvertisingParams::setManufacturerData(const std::vector<BlePeripheralManufacturerData> &value) {
    _manufacturerData = value;
  }

  void BlePeripheralAdvertisingParams::setManufacturerData(std::vector<BlePeripheralManufacturerData> &&value) {
    _manufacturerData = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralAdvertisingParams::getPowerLevel() const {
    return _powerLevel;
  }

  void BlePeripheralAdvertisingParams::setPowerLevel(const Valdi::StringBox &value) {
    _powerLevel = value;
  }

  void BlePeripheralAdvertisingParams::setPowerLevel(Valdi::StringBox &&value) {
    _powerLevel = std::move(value);
  }

  const Valdi::Ref<BlePeripheralBeacon> &BlePeripheralAdvertisingParams::getBeacon() const {
    return _beacon;
  }

  void BlePeripheralAdvertisingParams::setBeacon(const Valdi::Ref<BlePeripheralBeacon> &value) {
    _beacon = value;
  }

  void BlePeripheralAdvertisingParams::setBeacon(Valdi::Ref<BlePeripheralBeacon> &&value) {
    _beacon = std::move(value);
  }

  void BlePeripheralAdvertisingParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralAdvertisingParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._connectable, self._deviceName, self._serviceUuids, self._manufacturerData, self._powerLevel, self._beacon);
  }

  void BlePeripheralAdvertisingParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralAdvertisingParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._connectable, self._deviceName, self._serviceUuids, self._manufacturerData, self._powerLevel, self._beacon);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralAdvertisingParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralAdvertisingParams'{'serverId':s, 'connectable':b, 'deviceName':s, 'serviceUuids':a<s>, 'manufacturerData':a<r:'[0]'>, 'powerLevel':s, 'beacon':r?:'[1]'}", []() -> Valdi::TypeReferencesVec {
      return {BlePeripheralManufacturerData::getRegisteredClass(), BlePeripheralBeacon::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BlePeripheralBeacon.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralBeacon::BlePeripheralBeacon(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralBeacon::BlePeripheralBeacon(const Valdi::StringBox &uuid, double major, double minor, double measuredPower): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _major(major),
  _minor(minor),
  _measuredPower(measuredPower) {
  }

  const Valdi::StringBox &BlePeripheralBeacon::getUuid() const {
    return _uuid;
  }

  void BlePeripheralBeacon::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BlePeripheralBeacon::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  double BlePeripheralBeacon::getMajor() const {
    return _major;
  }

  void BlePeripheralBeacon::setMajor(double value) {
    _major = value;
  }

  double BlePeripheralBeacon::getMinor() const {
    return _minor;
  }

  void BlePeripheralBeacon::setMinor(double value) {
    _minor = value;
  }

  double BlePeripheralBeacon::getMeasuredPower() const {
    return _measuredPower;
  }

  void BlePeripheralBeacon::setMeasuredPower(double value) {
    _measuredPower = value;
  }

  void BlePeripheralBeacon::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralBeacon &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._major, self._minor, self._measuredPower);
  }

  void BlePeripheralBeacon::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralBeacon &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._major, self._minor, self._measuredPower);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralBeacon::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralBeacon'{'uuid':s, 'major':d, 'minor':d, 'measuredPower':d}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralCharacteristic.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralCharacteristic::BlePeripheralCharacteristic(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralCharacteristic::BlePeripheralCharacteristic(const Valdi::StringBox &uuid, const BlePeripheralProperties &properties, const BlePeripheralPermissions &permission, const Valdi::BytesView &value, const std::vector<BlePeripheralDescriptor> &descriptors): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _properties(std::move(properties)),
  _permission(std::move(permission)),
  _value(std::move(value)),
  _descriptors(std::move(descriptors)) {
  }

  const Valdi::StringBox &BlePeripheralCharacteristic::getUuid() const {
    return _uuid;
  }

  void BlePeripheralCharacteristic::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BlePeripheralCharacteristic::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  const BlePeripheralProperties &BlePeripheralCharacteristic::getProperties() const {
    return _properties;
  }

  void BlePeripheralCharacteristic::setProperties(const BlePeripheralProperties &value) {
    _properties = value;
  }

  void BlePeripheralCharacteristic::setProperties(BlePeripheralProperties &&value) {
    _properties = std::move(value);
  }

  const BlePeripheralPermissions &BlePeripheralCharacteristic::getPermission() const {
    return _permission;
  }

  void BlePeripheralCharacteristic::setPermission(const BlePeripheralPermissions &value) {
    _permission = value;
  }

  void BlePeripheralCharacteristic::setPermission(BlePeripheralPermissions &&value) {
    _permission = std::move(value);
  }

  const Valdi::BytesView &BlePeripheralCharacteristic::getValue() const {
    return _value;
  }

  void BlePeripheralCharacteristic::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BlePeripheralCharacteristic::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  const std::vector<BlePeripheralDescriptor> &BlePeripheralCharacteristic::getDescriptors() const {
    return _descriptors;
  }

  void BlePeripheralCharacteristic::setDescriptors(const std::vector<BlePeripheralDescriptor> &value) {
    _descriptors = value;
  }

  void BlePeripheralCharacteristic::setDescriptors(std::vector<BlePeripheralDescriptor> &&value) {
    _descriptors = std::move(value);
  }

  void BlePeripheralCharacteristic::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralCharacteristic &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._properties, self._permission, self._value, self._descriptors);
  }

  void BlePeripheralCharacteristic::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralCharacteristic &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._properties, self._permission, self._value, self._descriptors);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralCharacteristic::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralCharacteristic'{'uuid':s, 'properties':r:'[0]', 'permission':r:'[1]', 'value':t, 'descriptors':a<r:'[2]'>}", []() -> Valdi::TypeReferencesVec {
      return {BlePeripheralProperties::getRegisteredClass(), BlePeripheralPermissions::getRegisteredClass(), BlePeripheralDescriptor::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BlePeripheralConnectionState.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralConnectionState::BlePeripheralConnectionState(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralConnectionState::BlePeripheralConnectionState(const Valdi::StringBox &serverId, const Valdi::StringBox &deviceId, bool connected): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _deviceId(std::move(deviceId)),
  _connected(connected) {
  }

  const Valdi::StringBox &BlePeripheralConnectionState::getServerId() const {
    return _serverId;
  }

  void BlePeripheralConnectionState::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralConnectionState::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralConnectionState::getDeviceId() const {
    return _deviceId;
  }

  void BlePeripheralConnectionState::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BlePeripheralConnectionState::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  bool BlePeripheralConnectionState::getConnected() const {
    return _connected;
  }

  void BlePeripheralConnectionState::setConnected(bool value) {
    _connected = value;
  }

  void BlePeripheralConnectionState::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralConnectionState &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._deviceId, self._connected);
  }

  void BlePeripheralConnectionState::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralConnectionState &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._deviceId, self._connected);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralConnectionState::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralConnectionState'{'serverId':s, 'deviceId':s, 'connected':b}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralDescriptor.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralDescriptor::BlePeripheralDescriptor(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralDescriptor::BlePeripheralDescriptor(const Valdi::StringBox &uuid, bool read, bool write, const Valdi::BytesView &value): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _read(read),
  _write(write),
  _value(std::move(value)) {
  }

  const Valdi::StringBox &BlePeripheralDescriptor::getUuid() const {
    return _uuid;
  }

  void BlePeripheralDescriptor::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BlePeripheralDescriptor::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  bool BlePeripheralDescriptor::getRead() const {
    return _read;
  }

  void BlePeripheralDescriptor::setRead(bool value) {
    _read = value;
  }

  bool BlePeripheralDescriptor::getWrite() const {
    return _write;
  }

  void BlePeripheralDescriptor::setWrite(bool value) {
    _write = value;
  }

  const Valdi::BytesView &BlePeripheralDescriptor::getValue() const {
    return _value;
  }

  void BlePeripheralDescriptor::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BlePeripheralDescriptor::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  void BlePeripheralDescriptor::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralDescriptor &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._read, self._write, self._value);
  }

  void BlePeripheralDescriptor::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralDescriptor &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._read, self._write, self._value);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralDescriptor::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralDescriptor'{'uuid':s, 'read':b, 'write':b, 'value':t}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralManufacturerData.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralManufacturerData::BlePeripheralManufacturerData(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralManufacturerData::BlePeripheralManufacturerData(double manufacturerId, const Valdi::BytesView &manufacturerSpecificData): Valdi::CppGeneratedModel(getRegisteredClass()),
  _manufacturerId(manufacturerId),
  _manufacturerSpecificData(std::move(manufacturerSpecificData)) {
  }

  double BlePeripheralManufacturerData::getManufacturerId() const {
    return _manufacturerId;
  }

  void BlePeripheralManufacturerData::setManufacturerId(double value) {
    _manufacturerId = value;
  }

  const Valdi::BytesView &BlePeripheralManufacturerData::getManufacturerSpecificData() const {
    return _manufacturerSpecificData;
  }

  void BlePeripheralManufacturerData::setManufacturerSpecificData(const Valdi::BytesView &value) {
    _manufacturerSpecificData = value;
  }

  void BlePeripheralManufacturerData::setManufacturerSpecificData(Valdi::BytesView &&value) {
    _manufacturerSpecificData = std::move(value);
  }

  void BlePeripheralManufacturerData::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralManufacturerData &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._manufacturerId, self._manufacturerSpecificData);
  }

  void BlePeripheralManufacturerData::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralManufacturerData &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._manufacturerId, self._manufacturerSpecificData);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralManufacturerData::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralManufacturerData'{'manufacturerId':d, 'manufacturerSpecificData':t}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralPermissions.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralPermissions::BlePeripheralPermissions(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralPermissions::BlePeripheralPermissions(bool readable, bool writeable, bool readEncryptionRequired, bool writeEncryptionRequired): Valdi::CppGeneratedModel(getRegisteredClass()),
  _readable(readable),
  _writeable(writeable),
  _readEncryptionRequired(readEncryptionRequired),
  _writeEncryptionRequired(writeEncryptionRequired) {
  }

  bool BlePeripheralPermissions::getReadable() const {
    return _readable;
  }

  void BlePeripheralPermissions::setReadable(bool value) {
    _readable = value;
  }

  bool BlePeripheralPermissions::getWriteable() const {
    return _writeable;
  }

  void BlePeripheralPermissions::setWriteable(bool value) {
    _writeable = value;
  }

  bool BlePeripheralPermissions::getReadEncryptionRequired() const {
    return _readEncryptionRequired;
  }

  void BlePeripheralPermissions::setReadEncryptionRequired(bool value) {
    _readEncryptionRequired = value;
  }

  bool BlePeripheralPermissions::getWriteEncryptionRequired() const {
    return _writeEncryptionRequired;
  }

  void BlePeripheralPermissions::setWriteEncryptionRequired(bool value) {
    _writeEncryptionRequired = value;
  }

  void BlePeripheralPermissions::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralPermissions &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._readable, self._writeable, self._readEncryptionRequired, self._writeEncryptionRequired);
  }

  void BlePeripheralPermissions::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralPermissions &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._readable, self._writeable, self._readEncryptionRequired, self._writeEncryptionRequired);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralPermissions::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralPermissions'{'readable':b, 'writeable':b, 'readEncryptionRequired':b, 'writeEncryptionRequired':b}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralProperties.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralProperties::BlePeripheralProperties(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralProperties::BlePeripheralProperties(bool read, bool write, bool writeNoResponse, bool notify, bool indicate): Valdi::CppGeneratedModel(getRegisteredClass()),
  _read(read),
  _write(write),
  _writeNoResponse(writeNoResponse),
  _notify(notify),
  _indicate(indicate) {
  }

  bool BlePeripheralProperties::getRead() const {
    return _read;
  }

  void BlePeripheralProperties::setRead(bool value) {
    _read = value;
  }

  bool BlePeripheralProperties::getWrite() const {
    return _write;
  }

  void BlePeripheralProperties::setWrite(bool value) {
    _write = value;
  }

  bool BlePeripheralProperties::getWriteNoResponse() const {
    return _writeNoResponse;
  }

  void BlePeripheralProperties::setWriteNoResponse(bool value) {
    _writeNoResponse = value;
  }

  bool BlePeripheralProperties::getNotify() const {
    return _notify;
  }

  void BlePeripheralProperties::setNotify(bool value) {
    _notify = value;
  }

  bool BlePeripheralProperties::getIndicate() const {
    return _indicate;
  }

  void BlePeripheralProperties::setIndicate(bool value) {
    _indicate = value;
  }

  void BlePeripheralProperties::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralProperties &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._read, self._write, self._writeNoResponse, self._notify, self._indicate);
  }

  void BlePeripheralProperties::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralProperties &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._read, self._write, self._writeNoResponse, self._notify, self._indicate);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralProperties::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralProperties'{'read':b, 'write':b, 'writeNoResponse':b, 'notify':b, 'indicate':b}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralReadRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralReadRequest::BlePeripheralReadRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralReadRequest::BlePeripheralReadRequest(const Valdi::StringBox &serverId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, double callbackId, const Valdi::StringBox &deviceId, double offset): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _callbackId(callbackId),
  _deviceId(std::move(deviceId)),
  _offset(offset) {
  }

  const Valdi::StringBox &BlePeripheralReadRequest::getServerId() const {
    return _serverId;
  }

  void BlePeripheralReadRequest::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralReadRequest::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralReadRequest::getServiceId() const {
    return _serviceId;
  }

  void BlePeripheralReadRequest::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BlePeripheralReadRequest::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralReadRequest::getCharacteristicId() const {
    return _characteristicId;
  }

  void BlePeripheralReadRequest::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BlePeripheralReadRequest::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  double BlePeripheralReadRequest::getCallbackId() const {
    return _callbackId;
  }

  void BlePeripheralReadRequest::setCallbackId(double value) {
    _callbackId = value;
  }

  const Valdi::StringBox &BlePeripheralReadRequest::getDeviceId() const {
    return _deviceId;
  }

  void BlePeripheralReadRequest::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BlePeripheralReadRequest::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  double BlePeripheralReadRequest::getOffset() const {
    return _offset;
  }

  void BlePeripheralReadRequest::setOffset(double value) {
    _offset = value;
  }

  void BlePeripheralReadRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralReadRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._serviceId, self._characteristicId, self._callbackId, self._deviceId, self._offset);
  }

  void BlePeripheralReadRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralReadRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._serviceId, self._characteristicId, self._callbackId, self._deviceId, self._offset);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralReadRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralReadRequest'{'serverId':s, 'serviceId':s, 'characteristicId':s, 'callbackId':d, 'deviceId':s, 'offset':d}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralService.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralService::BlePeripheralService(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralService::BlePeripheralService(const Valdi::StringBox &uuid, const std::vector<BlePeripheralCharacteristic> &characteristics): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _characteristics(std::move(characteristics)) {
  }

  const Valdi::StringBox &BlePeripheralService::getUuid() const {
    return _uuid;
  }

  void BlePeripheralService::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BlePeripheralService::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  const std::vector<BlePeripheralCharacteristic> &BlePeripheralService::getCharacteristics() const {
    return _characteristics;
  }

  void BlePeripheralService::setCharacteristics(const std::vector<BlePeripheralCharacteristic> &value) {
    _characteristics = value;
  }

  void BlePeripheralService::setCharacteristics(std::vector<BlePeripheralCharacteristic> &&value) {
    _characteristics = std::move(value);
  }

  void BlePeripheralService::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralService &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._characteristics);
  }

  void BlePeripheralService::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralService &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._characteristics);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralService::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralService'{'uuid':s, 'characteristics':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {BlePeripheralCharacteristic::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BlePeripheralSubscriptionEvent.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralSubscriptionEvent::BlePeripheralSubscriptionEvent(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralSubscriptionEvent::BlePeripheralSubscriptionEvent(const Valdi::StringBox &serverId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, const Valdi::StringBox &deviceId): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _deviceId(std::move(deviceId)) {
  }

  const Valdi::StringBox &BlePeripheralSubscriptionEvent::getServerId() const {
    return _serverId;
  }

  void BlePeripheralSubscriptionEvent::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralSubscriptionEvent::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralSubscriptionEvent::getServiceId() const {
    return _serviceId;
  }

  void BlePeripheralSubscriptionEvent::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BlePeripheralSubscriptionEvent::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralSubscriptionEvent::getCharacteristicId() const {
    return _characteristicId;
  }

  void BlePeripheralSubscriptionEvent::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BlePeripheralSubscriptionEvent::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralSubscriptionEvent::getDeviceId() const {
    return _deviceId;
  }

  void BlePeripheralSubscriptionEvent::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BlePeripheralSubscriptionEvent::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  void BlePeripheralSubscriptionEvent::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralSubscriptionEvent &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._serviceId, self._characteristicId, self._deviceId);
  }

  void BlePeripheralSubscriptionEvent::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralSubscriptionEvent &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._serviceId, self._characteristicId, self._deviceId);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralSubscriptionEvent::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralSubscriptionEvent'{'serverId':s, 'serviceId':s, 'characteristicId':s, 'deviceId':s}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralWriteParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralWriteParams::BlePeripheralWriteParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralWriteParams::BlePeripheralWriteParams(const Valdi::StringBox &serverId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, const Valdi::BytesView &value, bool needNotify, std::optional<double> callbackId): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _value(std::move(value)),
  _needNotify(needNotify),
  _callbackId(callbackId) {
  }

  const Valdi::StringBox &BlePeripheralWriteParams::getServerId() const {
    return _serverId;
  }

  void BlePeripheralWriteParams::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralWriteParams::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralWriteParams::getServiceId() const {
    return _serviceId;
  }

  void BlePeripheralWriteParams::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BlePeripheralWriteParams::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralWriteParams::getCharacteristicId() const {
    return _characteristicId;
  }

  void BlePeripheralWriteParams::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BlePeripheralWriteParams::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  const Valdi::BytesView &BlePeripheralWriteParams::getValue() const {
    return _value;
  }

  void BlePeripheralWriteParams::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BlePeripheralWriteParams::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  bool BlePeripheralWriteParams::getNeedNotify() const {
    return _needNotify;
  }

  void BlePeripheralWriteParams::setNeedNotify(bool value) {
    _needNotify = value;
  }

  std::optional<double> BlePeripheralWriteParams::getCallbackId() const {
    return _callbackId;
  }

  void BlePeripheralWriteParams::setCallbackId(std::optional<double> value) {
    _callbackId = value;
  }

  void BlePeripheralWriteParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralWriteParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._serviceId, self._characteristicId, self._value, self._needNotify, self._callbackId);
  }

  void BlePeripheralWriteParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralWriteParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._serviceId, self._characteristicId, self._value, self._needNotify, self._callbackId);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralWriteParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralWriteParams'{'serverId':s, 'serviceId':s, 'characteristicId':s, 'value':t, 'needNotify':b, 'callbackId':d@?}");

    return kRegisteredClass;
  }

}

//
// BlePeripheralWriteRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BlePeripheralWriteRequest::BlePeripheralWriteRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BlePeripheralWriteRequest::BlePeripheralWriteRequest(const Valdi::StringBox &serverId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, double callbackId, const Valdi::StringBox &deviceId, double offset, const Valdi::BytesView &value, bool needResponse): Valdi::CppGeneratedModel(getRegisteredClass()),
  _serverId(std::move(serverId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _callbackId(callbackId),
  _deviceId(std::move(deviceId)),
  _offset(offset),
  _value(std::move(value)),
  _needResponse(needResponse) {
  }

  const Valdi::StringBox &BlePeripheralWriteRequest::getServerId() const {
    return _serverId;
  }

  void BlePeripheralWriteRequest::setServerId(const Valdi::StringBox &value) {
    _serverId = value;
  }

  void BlePeripheralWriteRequest::setServerId(Valdi::StringBox &&value) {
    _serverId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralWriteRequest::getServiceId() const {
    return _serviceId;
  }

  void BlePeripheralWriteRequest::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BlePeripheralWriteRequest::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BlePeripheralWriteRequest::getCharacteristicId() const {
    return _characteristicId;
  }

  void BlePeripheralWriteRequest::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BlePeripheralWriteRequest::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  double BlePeripheralWriteRequest::getCallbackId() const {
    return _callbackId;
  }

  void BlePeripheralWriteRequest::setCallbackId(double value) {
    _callbackId = value;
  }

  const Valdi::StringBox &BlePeripheralWriteRequest::getDeviceId() const {
    return _deviceId;
  }

  void BlePeripheralWriteRequest::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BlePeripheralWriteRequest::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  double BlePeripheralWriteRequest::getOffset() const {
    return _offset;
  }

  void BlePeripheralWriteRequest::setOffset(double value) {
    _offset = value;
  }

  const Valdi::BytesView &BlePeripheralWriteRequest::getValue() const {
    return _value;
  }

  void BlePeripheralWriteRequest::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BlePeripheralWriteRequest::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  bool BlePeripheralWriteRequest::getNeedResponse() const {
    return _needResponse;
  }

  void BlePeripheralWriteRequest::setNeedResponse(bool value) {
    _needResponse = value;
  }

  void BlePeripheralWriteRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BlePeripheralWriteRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._serverId, self._serviceId, self._characteristicId, self._callbackId, self._deviceId, self._offset, self._value, self._needResponse);
  }

  void BlePeripheralWriteRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const BlePeripheralWriteRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._serverId, self._serviceId, self._characteristicId, self._callbackId, self._deviceId, self._offset, self._value, self._needResponse);
  }

  Valdi::RegisteredCppGeneratedClass *BlePeripheralWriteRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BlePeripheralWriteRequest'{'serverId':s, 'serviceId':s, 'characteristicId':s, 'callbackId':d, 'deviceId':s, 'offset':d, 'value':t, 'needResponse':b}");

    return kRegisteredClass;
  }

}

//
// BleReadParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleReadParams::BleReadParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleReadParams::BleReadParams(const Valdi::StringBox &deviceId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)) {
  }

  const Valdi::StringBox &BleReadParams::getDeviceId() const {
    return _deviceId;
  }

  void BleReadParams::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleReadParams::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleReadParams::getServiceId() const {
    return _serviceId;
  }

  void BleReadParams::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BleReadParams::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BleReadParams::getCharacteristicId() const {
    return _characteristicId;
  }

  void BleReadParams::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BleReadParams::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  void BleReadParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleReadParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._serviceId, self._characteristicId);
  }

  void BleReadParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleReadParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._serviceId, self._characteristicId);
  }

  Valdi::RegisteredCppGeneratedClass *BleReadParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleReadParams'{'deviceId':s, 'serviceId':s, 'characteristicId':s}");

    return kRegisteredClass;
  }

}

//
// BleScanParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleScanParams::BleScanParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleScanParams::BleScanParams(const std::optional<std::vector<Valdi::StringBox>> &services, std::optional<bool> allowDuplicatesKey, std::optional<double> interval, const std::optional<Valdi::StringBox> &powerLevel): Valdi::CppGeneratedModel(getRegisteredClass()),
  _services(std::move(services)),
  _allowDuplicatesKey(allowDuplicatesKey),
  _interval(interval),
  _powerLevel(std::move(powerLevel)) {
  }

  const std::optional<std::vector<Valdi::StringBox>> &BleScanParams::getServices() const {
    return _services;
  }

  void BleScanParams::setServices(const std::optional<std::vector<Valdi::StringBox>> &value) {
    _services = value;
  }

  void BleScanParams::setServices(std::optional<std::vector<Valdi::StringBox>> &&value) {
    _services = std::move(value);
  }

  std::optional<bool> BleScanParams::getAllowDuplicatesKey() const {
    return _allowDuplicatesKey;
  }

  void BleScanParams::setAllowDuplicatesKey(std::optional<bool> value) {
    _allowDuplicatesKey = value;
  }

  std::optional<double> BleScanParams::getInterval() const {
    return _interval;
  }

  void BleScanParams::setInterval(std::optional<double> value) {
    _interval = value;
  }

  const std::optional<Valdi::StringBox> &BleScanParams::getPowerLevel() const {
    return _powerLevel;
  }

  void BleScanParams::setPowerLevel(const std::optional<Valdi::StringBox> &value) {
    _powerLevel = value;
  }

  void BleScanParams::setPowerLevel(std::optional<Valdi::StringBox> &&value) {
    _powerLevel = std::move(value);
  }

  void BleScanParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleScanParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._services, self._allowDuplicatesKey, self._interval, self._powerLevel);
  }

  void BleScanParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleScanParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._services, self._allowDuplicatesKey, self._interval, self._powerLevel);
  }

  Valdi::RegisteredCppGeneratedClass *BleScanParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleScanParams'{'services':a?<s>, 'allowDuplicatesKey':b@?, 'interval':d@?, 'powerLevel':s?}");

    return kRegisteredClass;
  }

}

//
// BleService.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleService::BleService(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleService::BleService(const Valdi::StringBox &uuid, bool isPrimary): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _isPrimary(isPrimary) {
  }

  const Valdi::StringBox &BleService::getUuid() const {
    return _uuid;
  }

  void BleService::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BleService::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  bool BleService::getIsPrimary() const {
    return _isPrimary;
  }

  void BleService::setIsPrimary(bool value) {
    _isPrimary = value;
  }

  void BleService::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleService &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._isPrimary);
  }

  void BleService::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleService &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._isPrimary);
  }

  Valdi::RegisteredCppGeneratedClass *BleService::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleService'{'uuid':s, 'isPrimary':b}");

    return kRegisteredClass;
  }

}

//
// BleServiceData.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleServiceData::BleServiceData(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleServiceData::BleServiceData(const Valdi::StringBox &uuid, const Valdi::BytesView &data): Valdi::CppGeneratedModel(getRegisteredClass()),
  _uuid(std::move(uuid)),
  _data(std::move(data)) {
  }

  const Valdi::StringBox &BleServiceData::getUuid() const {
    return _uuid;
  }

  void BleServiceData::setUuid(const Valdi::StringBox &value) {
    _uuid = value;
  }

  void BleServiceData::setUuid(Valdi::StringBox &&value) {
    _uuid = std::move(value);
  }

  const Valdi::BytesView &BleServiceData::getData() const {
    return _data;
  }

  void BleServiceData::setData(const Valdi::BytesView &value) {
    _data = value;
  }

  void BleServiceData::setData(Valdi::BytesView &&value) {
    _data = std::move(value);
  }

  void BleServiceData::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleServiceData &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._uuid, self._data);
  }

  void BleServiceData::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleServiceData &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._uuid, self._data);
  }

  Valdi::RegisteredCppGeneratedClass *BleServiceData::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleServiceData'{'uuid':s, 'data':t}");

    return kRegisteredClass;
  }

}

//
// BleWriteParams.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BleWriteParams::BleWriteParams(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BleWriteParams::BleWriteParams(const Valdi::StringBox &deviceId, const Valdi::StringBox &serviceId, const Valdi::StringBox &characteristicId, const Valdi::BytesView &value, const std::optional<Valdi::StringBox> &writeType): Valdi::CppGeneratedModel(getRegisteredClass()),
  _deviceId(std::move(deviceId)),
  _serviceId(std::move(serviceId)),
  _characteristicId(std::move(characteristicId)),
  _value(std::move(value)),
  _writeType(std::move(writeType)) {
  }

  const Valdi::StringBox &BleWriteParams::getDeviceId() const {
    return _deviceId;
  }

  void BleWriteParams::setDeviceId(const Valdi::StringBox &value) {
    _deviceId = value;
  }

  void BleWriteParams::setDeviceId(Valdi::StringBox &&value) {
    _deviceId = std::move(value);
  }

  const Valdi::StringBox &BleWriteParams::getServiceId() const {
    return _serviceId;
  }

  void BleWriteParams::setServiceId(const Valdi::StringBox &value) {
    _serviceId = value;
  }

  void BleWriteParams::setServiceId(Valdi::StringBox &&value) {
    _serviceId = std::move(value);
  }

  const Valdi::StringBox &BleWriteParams::getCharacteristicId() const {
    return _characteristicId;
  }

  void BleWriteParams::setCharacteristicId(const Valdi::StringBox &value) {
    _characteristicId = value;
  }

  void BleWriteParams::setCharacteristicId(Valdi::StringBox &&value) {
    _characteristicId = std::move(value);
  }

  const Valdi::BytesView &BleWriteParams::getValue() const {
    return _value;
  }

  void BleWriteParams::setValue(const Valdi::BytesView &value) {
    _value = value;
  }

  void BleWriteParams::setValue(Valdi::BytesView &&value) {
    _value = std::move(value);
  }

  const std::optional<Valdi::StringBox> &BleWriteParams::getWriteType() const {
    return _writeType;
  }

  void BleWriteParams::setWriteType(const std::optional<Valdi::StringBox> &value) {
    _writeType = value;
  }

  void BleWriteParams::setWriteType(std::optional<Valdi::StringBox> &&value) {
    _writeType = std::move(value);
  }

  void BleWriteParams::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BleWriteParams &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._deviceId, self._serviceId, self._characteristicId, self._value, self._writeType);
  }

  void BleWriteParams::marshall(Valdi::ExceptionTracker &exceptionTracker, const BleWriteParams &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._deviceId, self._serviceId, self._characteristicId, self._value, self._writeType);
  }

  Valdi::RegisteredCppGeneratedClass *BleWriteParams::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BleWriteParams'{'deviceId':s, 'serviceId':s, 'characteristicId':s, 'value':t, 'writeType':s?}");

    return kRegisteredClass;
  }

}

//
// BottomSheetRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  BottomSheetRequest::BottomSheetRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  BottomSheetRequest::BottomSheetRequest(const Valdi::StringBox &title, const Valdi::StringBox &content, const Valdi::StringBox &confirmText, const Valdi::StringBox &cancelText, bool showCancel, bool dismissible): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _content(std::move(content)),
  _confirmText(std::move(confirmText)),
  _cancelText(std::move(cancelText)),
  _showCancel(showCancel),
  _dismissible(dismissible) {
  }

  const Valdi::StringBox &BottomSheetRequest::getTitle() const {
    return _title;
  }

  void BottomSheetRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void BottomSheetRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const Valdi::StringBox &BottomSheetRequest::getContent() const {
    return _content;
  }

  void BottomSheetRequest::setContent(const Valdi::StringBox &value) {
    _content = value;
  }

  void BottomSheetRequest::setContent(Valdi::StringBox &&value) {
    _content = std::move(value);
  }

  const Valdi::StringBox &BottomSheetRequest::getConfirmText() const {
    return _confirmText;
  }

  void BottomSheetRequest::setConfirmText(const Valdi::StringBox &value) {
    _confirmText = value;
  }

  void BottomSheetRequest::setConfirmText(Valdi::StringBox &&value) {
    _confirmText = std::move(value);
  }

  const Valdi::StringBox &BottomSheetRequest::getCancelText() const {
    return _cancelText;
  }

  void BottomSheetRequest::setCancelText(const Valdi::StringBox &value) {
    _cancelText = value;
  }

  void BottomSheetRequest::setCancelText(Valdi::StringBox &&value) {
    _cancelText = std::move(value);
  }

  bool BottomSheetRequest::getShowCancel() const {
    return _showCancel;
  }

  void BottomSheetRequest::setShowCancel(bool value) {
    _showCancel = value;
  }

  bool BottomSheetRequest::getDismissible() const {
    return _dismissible;
  }

  void BottomSheetRequest::setDismissible(bool value) {
    _dismissible = value;
  }

  void BottomSheetRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, BottomSheetRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._content, self._confirmText, self._cancelText, self._showCancel, self._dismissible);
  }

  void BottomSheetRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const BottomSheetRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._content, self._confirmText, self._cancelText, self._showCancel, self._dismissible);
  }

  Valdi::RegisteredCppGeneratedClass *BottomSheetRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::BottomSheetRequest'{'title':s, 'content':s, 'confirmText':s, 'cancelText':s, 'showCancel':b, 'dismissible':b}");

    return kRegisteredClass;
  }

}

//
// CppModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class CppModuleProxy: public CppModule {
    public:
    using Sha256Fn = Valdi::Function<Valdi::StringBox(Valdi::StringBox)>;
    using StatsFn = Valdi::Function<CppStats(std::vector<double>)>;

    CppModuleProxy() = default;
    ~CppModuleProxy() override = default;

    Valdi::StringBox BUILD_INFO() final {
      return _BUILD_INFO;
    }

    Valdi::StringBox sha256(Valdi::StringBox text) final {
      return _sha256(text);
    }

    CppStats stats(std::vector<double> values) final {
      return _stats(values);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<CppModuleProxy> &out) {
      out = Valdi::makeShared<CppModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._BUILD_INFO, self._sha256, self._stats);
    }

    private:
    Valdi::StringBox _BUILD_INFO;
    Sha256Fn _sha256;
    StatsFn _stats;
  };

  CppModule::CppModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void CppModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<CppModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<CppModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void CppModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<CppModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, value->BUILD_INFO(), Valdi::CppMarshaller::methodToFunction<CppModule, &CppModule::sha256>(value), Valdi::CppMarshaller::methodToFunction<CppModule, &CppModule::stats>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *CppModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::CppModule'{'BUILD_INFO':s, 'sha256':f|m|(s): s, 'stats':f|m|(a<d@>): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {CppStats::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// CppModuleFactory.cpp
//

#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  CppModuleFactory::CppModuleFactory() = default;
  CppModuleFactory::~CppModuleFactory() = default;

  Valdi::StringBox CppModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_pages/src/cpp/Cpp");
  }
}

//
// CppStats.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  CppStats::CppStats(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  CppStats::CppStats(double count, double mean, double min, double max): Valdi::CppGeneratedModel(getRegisteredClass()),
  _count(count),
  _mean(mean),
  _min(min),
  _max(max) {
  }

  double CppStats::getCount() const {
    return _count;
  }

  void CppStats::setCount(double value) {
    _count = value;
  }

  double CppStats::getMean() const {
    return _mean;
  }

  void CppStats::setMean(double value) {
    _mean = value;
  }

  double CppStats::getMin() const {
    return _min;
  }

  void CppStats::setMin(double value) {
    _min = value;
  }

  double CppStats::getMax() const {
    return _max;
  }

  void CppStats::setMax(double value) {
    _max = value;
  }

  void CppStats::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, CppStats &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._count, self._mean, self._min, self._max);
  }

  void CppStats::marshall(Valdi::ExceptionTracker &exceptionTracker, const CppStats &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._count, self._mean, self._min, self._max);
  }

  Valdi::RegisteredCppGeneratedClass *CppStats::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::CppStats'{'count':d, 'mean':d, 'min':d, 'max':d}");

    return kRegisteredClass;
  }

}

//
// DatePickerRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  DatePickerRequest::DatePickerRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  DatePickerRequest::DatePickerRequest(const Valdi::StringBox &title, const Valdi::StringBox &mode, const Valdi::StringBox &value, const Valdi::StringBox &confirmText, const Valdi::StringBox &cancelText, double minYear, double maxYear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _mode(std::move(mode)),
  _value(std::move(value)),
  _confirmText(std::move(confirmText)),
  _cancelText(std::move(cancelText)),
  _minYear(minYear),
  _maxYear(maxYear) {
  }

  const Valdi::StringBox &DatePickerRequest::getTitle() const {
    return _title;
  }

  void DatePickerRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void DatePickerRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const Valdi::StringBox &DatePickerRequest::getMode() const {
    return _mode;
  }

  void DatePickerRequest::setMode(const Valdi::StringBox &value) {
    _mode = value;
  }

  void DatePickerRequest::setMode(Valdi::StringBox &&value) {
    _mode = std::move(value);
  }

  const Valdi::StringBox &DatePickerRequest::getValue() const {
    return _value;
  }

  void DatePickerRequest::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void DatePickerRequest::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  const Valdi::StringBox &DatePickerRequest::getConfirmText() const {
    return _confirmText;
  }

  void DatePickerRequest::setConfirmText(const Valdi::StringBox &value) {
    _confirmText = value;
  }

  void DatePickerRequest::setConfirmText(Valdi::StringBox &&value) {
    _confirmText = std::move(value);
  }

  const Valdi::StringBox &DatePickerRequest::getCancelText() const {
    return _cancelText;
  }

  void DatePickerRequest::setCancelText(const Valdi::StringBox &value) {
    _cancelText = value;
  }

  void DatePickerRequest::setCancelText(Valdi::StringBox &&value) {
    _cancelText = std::move(value);
  }

  double DatePickerRequest::getMinYear() const {
    return _minYear;
  }

  void DatePickerRequest::setMinYear(double value) {
    _minYear = value;
  }

  double DatePickerRequest::getMaxYear() const {
    return _maxYear;
  }

  void DatePickerRequest::setMaxYear(double value) {
    _maxYear = value;
  }

  void DatePickerRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, DatePickerRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._mode, self._value, self._confirmText, self._cancelText, self._minYear, self._maxYear);
  }

  void DatePickerRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const DatePickerRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._mode, self._value, self._confirmText, self._cancelText, self._minYear, self._maxYear);
  }

  Valdi::RegisteredCppGeneratedClass *DatePickerRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::DatePickerRequest'{'title':s, 'mode':s, 'value':s, 'confirmText':s, 'cancelText':s, 'minYear':d, 'maxYear':d}");

    return kRegisteredClass;
  }

}

//
// ImagePreviewRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ImagePreviewRequest::ImagePreviewRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ImagePreviewRequest::ImagePreviewRequest(const std::vector<Valdi::StringBox> &urls, const Valdi::StringBox &current): Valdi::CppGeneratedModel(getRegisteredClass()),
  _urls(std::move(urls)),
  _current(std::move(current)) {
  }

  const std::vector<Valdi::StringBox> &ImagePreviewRequest::getUrls() const {
    return _urls;
  }

  void ImagePreviewRequest::setUrls(const std::vector<Valdi::StringBox> &value) {
    _urls = value;
  }

  void ImagePreviewRequest::setUrls(std::vector<Valdi::StringBox> &&value) {
    _urls = std::move(value);
  }

  const Valdi::StringBox &ImagePreviewRequest::getCurrent() const {
    return _current;
  }

  void ImagePreviewRequest::setCurrent(const Valdi::StringBox &value) {
    _current = value;
  }

  void ImagePreviewRequest::setCurrent(Valdi::StringBox &&value) {
    _current = std::move(value);
  }

  void ImagePreviewRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ImagePreviewRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._urls, self._current);
  }

  void ImagePreviewRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const ImagePreviewRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._urls, self._current);
  }

  Valdi::RegisteredCppGeneratedClass *ImagePreviewRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ImagePreviewRequest'{'urls':a<s>, 'current':s}");

    return kRegisteredClass;
  }

}

//
// InstallAppUI.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallAppUI::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallAppUI'{'installAppUI':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {AppUIHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallAppUI> InstallAppUI::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallAppUI>(jsRuntime, nativeObjectsManager, "app_pages/src/AppUIHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallAppUI::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/AppUIHost", registeredSchema());
  }
}

//
// InstallBleHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallBleHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallBleHost'{'installBleHost':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {BleHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallBleHost> InstallBleHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallBleHost>(jsRuntime, nativeObjectsManager, "app_pages/src/ble/BleHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallBleHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/ble/BleHost", registeredSchema());
  }
}

//
// InstallNfcHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallNfcHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallNfcHost'{'installNfcHost':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {NfcHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallNfcHost> InstallNfcHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallNfcHost>(jsRuntime, nativeObjectsManager, "app_pages/src/nfc/NfcHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallNfcHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/nfc/NfcHost", registeredSchema());
  }
}

//
// InstallPermissionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallPermissionHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallPermissionHost'{'installPermissionHost':f(r:'[0]', d)}", []() -> Valdi::TypeReferencesVec {
      return {PermissionHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallPermissionHost> InstallPermissionHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallPermissionHost>(jsRuntime, nativeObjectsManager, "app_pages/src/permissions/PermissionHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallPermissionHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/permissions/PermissionHost", registeredSchema());
  }
}

//
// InstallStorageHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallStorageHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallStorageHost'{'installStorageHost':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {StorageHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallStorageHost> InstallStorageHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallStorageHost>(jsRuntime, nativeObjectsManager, "app_pages/src/storage", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallStorageHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/storage", registeredSchema());
  }
}

//
// InstallVisionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallVisionHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallVisionHost'{'installVisionHost':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {VisionHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallVisionHost> InstallVisionHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallVisionHost>(jsRuntime, nativeObjectsManager, "app_pages/src/vision/VisionHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallVisionHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/vision/VisionHost", registeredSchema());
  }
}

//
// InstallWifiHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& InstallWifiHost::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'InstallWifiHost'{'installWifiHost':f(r:'[0]')}", []() -> Valdi::TypeReferencesVec {
      return {WifiHost::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<InstallWifiHost> InstallWifiHost::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<InstallWifiHost>(jsRuntime, nativeObjectsManager, "app_pages/src/wifi/WifiHost", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> InstallWifiHost::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/wifi/WifiHost", registeredSchema());
  }
}

//
// LoadingRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  LoadingRequest::LoadingRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  LoadingRequest::LoadingRequest(const Valdi::StringBox &title, bool mask): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _mask(mask) {
  }

  const Valdi::StringBox &LoadingRequest::getTitle() const {
    return _title;
  }

  void LoadingRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void LoadingRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  bool LoadingRequest::getMask() const {
    return _mask;
  }

  void LoadingRequest::setMask(bool value) {
    _mask = value;
  }

  void LoadingRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, LoadingRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._mask);
  }

  void LoadingRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const LoadingRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._mask);
  }

  Valdi::RegisteredCppGeneratedClass *LoadingRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::LoadingRequest'{'title':s, 'mask':b}");

    return kRegisteredClass;
  }

}

//
// ModalReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ModalReply::ModalReply(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ModalReply::ModalReply(bool confirm, bool cancel, const Valdi::StringBox &content): Valdi::CppGeneratedModel(getRegisteredClass()),
  _confirm(confirm),
  _cancel(cancel),
  _content(std::move(content)) {
  }

  bool ModalReply::getConfirm() const {
    return _confirm;
  }

  void ModalReply::setConfirm(bool value) {
    _confirm = value;
  }

  bool ModalReply::getCancel() const {
    return _cancel;
  }

  void ModalReply::setCancel(bool value) {
    _cancel = value;
  }

  const Valdi::StringBox &ModalReply::getContent() const {
    return _content;
  }

  void ModalReply::setContent(const Valdi::StringBox &value) {
    _content = value;
  }

  void ModalReply::setContent(Valdi::StringBox &&value) {
    _content = std::move(value);
  }

  void ModalReply::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ModalReply &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._confirm, self._cancel, self._content);
  }

  void ModalReply::marshall(Valdi::ExceptionTracker &exceptionTracker, const ModalReply &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._confirm, self._cancel, self._content);
  }

  Valdi::RegisteredCppGeneratedClass *ModalReply::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ModalReply'{'confirm':b, 'cancel':b, 'content':s}");

    return kRegisteredClass;
  }

}

//
// ModalRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ModalRequest::ModalRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ModalRequest::ModalRequest(const Valdi::StringBox &title, const Valdi::StringBox &content, bool showCancel, const Valdi::StringBox &confirmText, const Valdi::StringBox &cancelText, bool editable, const Valdi::StringBox &placeholderText, const Valdi::StringBox &defaultText): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _content(std::move(content)),
  _showCancel(showCancel),
  _confirmText(std::move(confirmText)),
  _cancelText(std::move(cancelText)),
  _editable(editable),
  _placeholderText(std::move(placeholderText)),
  _defaultText(std::move(defaultText)) {
  }

  const Valdi::StringBox &ModalRequest::getTitle() const {
    return _title;
  }

  void ModalRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void ModalRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const Valdi::StringBox &ModalRequest::getContent() const {
    return _content;
  }

  void ModalRequest::setContent(const Valdi::StringBox &value) {
    _content = value;
  }

  void ModalRequest::setContent(Valdi::StringBox &&value) {
    _content = std::move(value);
  }

  bool ModalRequest::getShowCancel() const {
    return _showCancel;
  }

  void ModalRequest::setShowCancel(bool value) {
    _showCancel = value;
  }

  const Valdi::StringBox &ModalRequest::getConfirmText() const {
    return _confirmText;
  }

  void ModalRequest::setConfirmText(const Valdi::StringBox &value) {
    _confirmText = value;
  }

  void ModalRequest::setConfirmText(Valdi::StringBox &&value) {
    _confirmText = std::move(value);
  }

  const Valdi::StringBox &ModalRequest::getCancelText() const {
    return _cancelText;
  }

  void ModalRequest::setCancelText(const Valdi::StringBox &value) {
    _cancelText = value;
  }

  void ModalRequest::setCancelText(Valdi::StringBox &&value) {
    _cancelText = std::move(value);
  }

  bool ModalRequest::getEditable() const {
    return _editable;
  }

  void ModalRequest::setEditable(bool value) {
    _editable = value;
  }

  const Valdi::StringBox &ModalRequest::getPlaceholderText() const {
    return _placeholderText;
  }

  void ModalRequest::setPlaceholderText(const Valdi::StringBox &value) {
    _placeholderText = value;
  }

  void ModalRequest::setPlaceholderText(Valdi::StringBox &&value) {
    _placeholderText = std::move(value);
  }

  const Valdi::StringBox &ModalRequest::getDefaultText() const {
    return _defaultText;
  }

  void ModalRequest::setDefaultText(const Valdi::StringBox &value) {
    _defaultText = value;
  }

  void ModalRequest::setDefaultText(Valdi::StringBox &&value) {
    _defaultText = std::move(value);
  }

  void ModalRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ModalRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._content, self._showCancel, self._confirmText, self._cancelText, self._editable, self._placeholderText, self._defaultText);
  }

  void ModalRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const ModalRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._content, self._showCancel, self._confirmText, self._cancelText, self._editable, self._placeholderText, self._defaultText);
  }

  Valdi::RegisteredCppGeneratedClass *ModalRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ModalRequest'{'title':s, 'content':s, 'showCancel':b, 'confirmText':s, 'cancelText':s, 'editable':b, 'placeholderText':s, 'defaultText':s}");

    return kRegisteredClass;
  }

}

//
// NavigationHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NavigationHost::NavigationHost(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NavigationHost::NavigationHost(const NavigationHost::PushFn &push, const NavigationHost::PushForResultFn &pushForResult, const NavigationHost::ReplaceFn &replace, const NavigationHost::BackFn &back, const NavigationHost::PopToRootFn &popToRoot, const NavigationHost::ResetFn &reset, const NavigationHost::SwitchTabFn &switchTab, const NavigationHost::SetStatusBarStyleFn &setStatusBarStyle, const NavigationHost::CurrentPagesFn &currentPages): Valdi::CppGeneratedModel(getRegisteredClass()),
  _push(std::move(push)),
  _pushForResult(std::move(pushForResult)),
  _replace(std::move(replace)),
  _back(std::move(back)),
  _popToRoot(std::move(popToRoot)),
  _reset(std::move(reset)),
  _switchTab(std::move(switchTab)),
  _setStatusBarStyle(std::move(setStatusBarStyle)),
  _currentPages(std::move(currentPages)) {
  }

  const NavigationHost::PushFn &NavigationHost::getPush() const {
    return _push;
  }

  void NavigationHost::setPush(const NavigationHost::PushFn &value) {
    _push = value;
  }

  void NavigationHost::setPush(NavigationHost::PushFn &&value) {
    _push = std::move(value);
  }

  const NavigationHost::PushForResultFn &NavigationHost::getPushForResult() const {
    return _pushForResult;
  }

  void NavigationHost::setPushForResult(const NavigationHost::PushForResultFn &value) {
    _pushForResult = value;
  }

  void NavigationHost::setPushForResult(NavigationHost::PushForResultFn &&value) {
    _pushForResult = std::move(value);
  }

  const NavigationHost::ReplaceFn &NavigationHost::getReplace() const {
    return _replace;
  }

  void NavigationHost::setReplace(const NavigationHost::ReplaceFn &value) {
    _replace = value;
  }

  void NavigationHost::setReplace(NavigationHost::ReplaceFn &&value) {
    _replace = std::move(value);
  }

  const NavigationHost::BackFn &NavigationHost::getBack() const {
    return _back;
  }

  void NavigationHost::setBack(const NavigationHost::BackFn &value) {
    _back = value;
  }

  void NavigationHost::setBack(NavigationHost::BackFn &&value) {
    _back = std::move(value);
  }

  const NavigationHost::PopToRootFn &NavigationHost::getPopToRoot() const {
    return _popToRoot;
  }

  void NavigationHost::setPopToRoot(const NavigationHost::PopToRootFn &value) {
    _popToRoot = value;
  }

  void NavigationHost::setPopToRoot(NavigationHost::PopToRootFn &&value) {
    _popToRoot = std::move(value);
  }

  const NavigationHost::ResetFn &NavigationHost::getReset() const {
    return _reset;
  }

  void NavigationHost::setReset(const NavigationHost::ResetFn &value) {
    _reset = value;
  }

  void NavigationHost::setReset(NavigationHost::ResetFn &&value) {
    _reset = std::move(value);
  }

  const NavigationHost::SwitchTabFn &NavigationHost::getSwitchTab() const {
    return _switchTab;
  }

  void NavigationHost::setSwitchTab(const NavigationHost::SwitchTabFn &value) {
    _switchTab = value;
  }

  void NavigationHost::setSwitchTab(NavigationHost::SwitchTabFn &&value) {
    _switchTab = std::move(value);
  }

  const NavigationHost::SetStatusBarStyleFn &NavigationHost::getSetStatusBarStyle() const {
    return _setStatusBarStyle;
  }

  void NavigationHost::setSetStatusBarStyle(const NavigationHost::SetStatusBarStyleFn &value) {
    _setStatusBarStyle = value;
  }

  void NavigationHost::setSetStatusBarStyle(NavigationHost::SetStatusBarStyleFn &&value) {
    _setStatusBarStyle = std::move(value);
  }

  const NavigationHost::CurrentPagesFn &NavigationHost::getCurrentPages() const {
    return _currentPages;
  }

  void NavigationHost::setCurrentPages(const NavigationHost::CurrentPagesFn &value) {
    _currentPages = value;
  }

  void NavigationHost::setCurrentPages(NavigationHost::CurrentPagesFn &&value) {
    _currentPages = std::move(value);
  }

  void NavigationHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NavigationHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages);
  }

  void NavigationHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const NavigationHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages);
  }

  Valdi::RegisteredCppGeneratedClass *NavigationHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NavigationHost'{'push':f(s, s, s, s), 'pushForResult':f(s, s, s, s, f(s, b)), 'replace':f(s, s, s), 'back':f(d), 'popToRoot':f(), 'reset':f(s, s), 'switchTab':f(s), 'setStatusBarStyle':f(s), 'currentPages':f(f(s))}");

    return kRegisteredClass;
  }

}

//
// NfcAvailabilityModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NfcAvailabilityModel::NfcAvailabilityModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcAvailabilityModel::NfcAvailabilityModel(bool supported, bool enabled, bool foreground, bool permissionGranted): Valdi::CppGeneratedModel(getRegisteredClass()),
  _supported(supported),
  _enabled(enabled),
  _foreground(foreground),
  _permissionGranted(permissionGranted) {
  }

  bool NfcAvailabilityModel::getSupported() const {
    return _supported;
  }

  void NfcAvailabilityModel::setSupported(bool value) {
    _supported = value;
  }

  bool NfcAvailabilityModel::getEnabled() const {
    return _enabled;
  }

  void NfcAvailabilityModel::setEnabled(bool value) {
    _enabled = value;
  }

  bool NfcAvailabilityModel::getForeground() const {
    return _foreground;
  }

  void NfcAvailabilityModel::setForeground(bool value) {
    _foreground = value;
  }

  bool NfcAvailabilityModel::getPermissionGranted() const {
    return _permissionGranted;
  }

  void NfcAvailabilityModel::setPermissionGranted(bool value) {
    _permissionGranted = value;
  }

  void NfcAvailabilityModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcAvailabilityModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._supported, self._enabled, self._foreground, self._permissionGranted);
  }

  void NfcAvailabilityModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcAvailabilityModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._supported, self._enabled, self._foreground, self._permissionGranted);
  }

  Valdi::RegisteredCppGeneratedClass *NfcAvailabilityModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NfcAvailabilityModel'{'supported':b, 'enabled':b, 'foreground':b, 'permissionGranted':b}");

    return kRegisteredClass;
  }

}

//
// NfcHandleModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NfcHandleModel::NfcHandleModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcHandleModel::NfcHandleModel(const Valdi::StringBox &tagHandle, const Valdi::StringBox &tech): Valdi::CppGeneratedModel(getRegisteredClass()),
  _tagHandle(std::move(tagHandle)),
  _tech(std::move(tech)) {
  }

  const Valdi::StringBox &NfcHandleModel::getTagHandle() const {
    return _tagHandle;
  }

  void NfcHandleModel::setTagHandle(const Valdi::StringBox &value) {
    _tagHandle = value;
  }

  void NfcHandleModel::setTagHandle(Valdi::StringBox &&value) {
    _tagHandle = std::move(value);
  }

  const Valdi::StringBox &NfcHandleModel::getTech() const {
    return _tech;
  }

  void NfcHandleModel::setTech(const Valdi::StringBox &value) {
    _tech = value;
  }

  void NfcHandleModel::setTech(Valdi::StringBox &&value) {
    _tech = std::move(value);
  }

  void NfcHandleModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcHandleModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._tagHandle, self._tech);
  }

  void NfcHandleModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcHandleModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._tagHandle, self._tech);
  }

  Valdi::RegisteredCppGeneratedClass *NfcHandleModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NfcHandleModel'{'tagHandle':s, 'tech':s}");

    return kRegisteredClass;
  }

}

//
// NfcHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class NfcHostProxy: public NfcHost {
    public:
    using SetEventsFn = Valdi::Function<void(NfcHostEvents)>;
    using GetAvailabilityFn = Valdi::Function<Valdi::Future<NfcAvailabilityModel>()>;
    using StartDiscoveryFn = Valdi::Function<Valdi::Future<void>()>;
    using StopDiscoveryFn = Valdi::Function<Valdi::Future<void>()>;
    using ConnectFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel)>;
    using CloseFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel)>;
    using IsConnectedFn = Valdi::Function<Valdi::Future<bool>(NfcHandleModel)>;
    using TransceiveFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel, Valdi::BytesView)>;
    using GetMaxTransceiveLengthFn = Valdi::Function<Valdi::Future<double>(NfcHandleModel)>;
    using SetTimeoutFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel, double)>;
    using GetAtqaFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel)>;
    using GetSakFn = Valdi::Function<Valdi::Future<double>(NfcHandleModel)>;
    using GetHistoricalBytesFn = Valdi::Function<Valdi::Future<Valdi::BytesView>(NfcHandleModel)>;
    using WriteNdefMessageFn = Valdi::Function<Valdi::Future<void>(NfcHandleModel, std::vector<NfcRecordModel>, std::vector<Valdi::StringBox>, std::vector<Valdi::StringBox>)>;

    NfcHostProxy() = default;
    ~NfcHostProxy() override = default;

    void setEvents(NfcHostEvents events) final {
      _setEvents(events);
    }

    Valdi::Future<NfcAvailabilityModel> getAvailability() final {
      return _getAvailability();
    }

    Valdi::Future<void> startDiscovery() final {
      return _startDiscovery();
    }

    Valdi::Future<void> stopDiscovery() final {
      return _stopDiscovery();
    }

    Valdi::Future<void> connect(NfcHandleModel handle) final {
      return _connect(handle);
    }

    Valdi::Future<void> close(NfcHandleModel handle) final {
      return _close(handle);
    }

    Valdi::Future<bool> isConnected(NfcHandleModel handle) final {
      return _isConnected(handle);
    }

    Valdi::Future<Valdi::BytesView> transceive(NfcHandleModel handle, Valdi::BytesView data) final {
      return _transceive(handle, data);
    }

    Valdi::Future<double> getMaxTransceiveLength(NfcHandleModel handle) final {
      return _getMaxTransceiveLength(handle);
    }

    Valdi::Future<void> setTimeout(NfcHandleModel handle, double timeout) final {
      return _setTimeout(handle, timeout);
    }

    Valdi::Future<Valdi::BytesView> getAtqa(NfcHandleModel handle) final {
      return _getAtqa(handle);
    }

    Valdi::Future<double> getSak(NfcHandleModel handle) final {
      return _getSak(handle);
    }

    Valdi::Future<Valdi::BytesView> getHistoricalBytes(NfcHandleModel handle) final {
      return _getHistoricalBytes(handle);
    }

    Valdi::Future<void> writeNdefMessage(NfcHandleModel handle, std::vector<NfcRecordModel> records, std::vector<Valdi::StringBox> uris, std::vector<Valdi::StringBox> texts) final {
      return _writeNdefMessage(handle, records, uris, texts);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcHostProxy> &out) {
      out = Valdi::makeShared<NfcHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._setEvents, self._getAvailability, self._startDiscovery, self._stopDiscovery, self._connect, self._close, self._isConnected, self._transceive, self._getMaxTransceiveLength, self._setTimeout, self._getAtqa, self._getSak, self._getHistoricalBytes, self._writeNdefMessage);
    }

    private:
    SetEventsFn _setEvents;
    GetAvailabilityFn _getAvailability;
    StartDiscoveryFn _startDiscovery;
    StopDiscoveryFn _stopDiscovery;
    ConnectFn _connect;
    CloseFn _close;
    IsConnectedFn _isConnected;
    TransceiveFn _transceive;
    GetMaxTransceiveLengthFn _getMaxTransceiveLength;
    SetTimeoutFn _setTimeout;
    GetAtqaFn _getAtqa;
    GetSakFn _getSak;
    GetHistoricalBytesFn _getHistoricalBytes;
    WriteNdefMessageFn _writeNdefMessage;
  };

  NfcHost::NfcHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void NfcHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<NfcHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<NfcHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void NfcHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<NfcHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::setEvents>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getAvailability>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::startDiscovery>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::stopDiscovery>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::connect>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::close>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::isConnected>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::transceive>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getMaxTransceiveLength>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::setTimeout>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getAtqa>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getSak>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::getHistoricalBytes>(value), Valdi::CppMarshaller::methodToFunction<NfcHost, &NfcHost::writeNdefMessage>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *NfcHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::NfcHost'{'setEvents':f|m|(r:'[0]'), 'getAvailability':f|m|(): p<r:'[1]'>, 'startDiscovery':f|m|(): p<v>, 'stopDiscovery':f|m|(): p<v>, 'connect':f|m|(r:'[2]'): p<v>, 'close':f|m|(r:'[2]'): p<v>, 'isConnected':f|m|(r:'[2]'): p<b@>, 'transceive':f|m|(r:'[2]', t): p<t>, 'getMaxTransceiveLength':f|m|(r:'[2]'): p<d@>, 'setTimeout':f|m|(r:'[2]', d): p<v>, 'getAtqa':f|m|(r:'[2]'): p<t>, 'getSak':f|m|(r:'[2]'): p<d@>, 'getHistoricalBytes':f|m|(r:'[2]'): p<t>, 'writeNdefMessage':f|m|(r:'[2]', a<r:'[3]'>, a<s>, a<s>): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {NfcHostEvents::getRegisteredClass(), NfcAvailabilityModel::getRegisteredClass(), NfcHandleModel::getRegisteredClass(), NfcRecordModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// NfcHostEvents.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NfcHostEvents::NfcHostEvents(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcHostEvents::NfcHostEvents(const NfcHostEvents::DiscoveredFn &discovered, const NfcHostEvents::DiscoveryStateChangeFn &discoveryStateChange): Valdi::CppGeneratedModel(getRegisteredClass()),
  _discovered(std::move(discovered)),
  _discoveryStateChange(std::move(discoveryStateChange)) {
  }

  const NfcHostEvents::DiscoveredFn &NfcHostEvents::getDiscovered() const {
    return _discovered;
  }

  void NfcHostEvents::setDiscovered(const NfcHostEvents::DiscoveredFn &value) {
    _discovered = value;
  }

  void NfcHostEvents::setDiscovered(NfcHostEvents::DiscoveredFn &&value) {
    _discovered = std::move(value);
  }

  const NfcHostEvents::DiscoveryStateChangeFn &NfcHostEvents::getDiscoveryStateChange() const {
    return _discoveryStateChange;
  }

  void NfcHostEvents::setDiscoveryStateChange(const NfcHostEvents::DiscoveryStateChangeFn &value) {
    _discoveryStateChange = value;
  }

  void NfcHostEvents::setDiscoveryStateChange(NfcHostEvents::DiscoveryStateChangeFn &&value) {
    _discoveryStateChange = std::move(value);
  }

  void NfcHostEvents::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcHostEvents &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._discovered, self._discoveryStateChange);
  }

  void NfcHostEvents::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcHostEvents &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._discovered, self._discoveryStateChange);
  }

  Valdi::RegisteredCppGeneratedClass *NfcHostEvents::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NfcHostEvents'{'discovered':f(r:'[0]'), 'discoveryStateChange':f(b)}", []() -> Valdi::TypeReferencesVec {
      return {NfcTagModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// NfcRecordModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NfcRecordModel::NfcRecordModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcRecordModel::NfcRecordModel(const Valdi::BytesView &id, const Valdi::BytesView &type, const Valdi::BytesView &payload, double tnf): Valdi::CppGeneratedModel(getRegisteredClass()),
  _id(std::move(id)),
  _type(std::move(type)),
  _payload(std::move(payload)),
  _tnf(tnf) {
  }

  const Valdi::BytesView &NfcRecordModel::getId() const {
    return _id;
  }

  void NfcRecordModel::setId(const Valdi::BytesView &value) {
    _id = value;
  }

  void NfcRecordModel::setId(Valdi::BytesView &&value) {
    _id = std::move(value);
  }

  const Valdi::BytesView &NfcRecordModel::getType() const {
    return _type;
  }

  void NfcRecordModel::setType(const Valdi::BytesView &value) {
    _type = value;
  }

  void NfcRecordModel::setType(Valdi::BytesView &&value) {
    _type = std::move(value);
  }

  const Valdi::BytesView &NfcRecordModel::getPayload() const {
    return _payload;
  }

  void NfcRecordModel::setPayload(const Valdi::BytesView &value) {
    _payload = value;
  }

  void NfcRecordModel::setPayload(Valdi::BytesView &&value) {
    _payload = std::move(value);
  }

  double NfcRecordModel::getTnf() const {
    return _tnf;
  }

  void NfcRecordModel::setTnf(double value) {
    _tnf = value;
  }

  void NfcRecordModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcRecordModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._id, self._type, self._payload, self._tnf);
  }

  void NfcRecordModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcRecordModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._id, self._type, self._payload, self._tnf);
  }

  Valdi::RegisteredCppGeneratedClass *NfcRecordModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NfcRecordModel'{'id':t, 'type':t, 'payload':t, 'tnf':d}");

    return kRegisteredClass;
  }

}

//
// NfcTagModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  NfcTagModel::NfcTagModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  NfcTagModel::NfcTagModel(const Valdi::StringBox &tagHandle, const Valdi::BytesView &id, const std::vector<Valdi::StringBox> &techs, const std::vector<NfcRecordModel> &messages): Valdi::CppGeneratedModel(getRegisteredClass()),
  _tagHandle(std::move(tagHandle)),
  _id(std::move(id)),
  _techs(std::move(techs)),
  _messages(std::move(messages)) {
  }

  const Valdi::StringBox &NfcTagModel::getTagHandle() const {
    return _tagHandle;
  }

  void NfcTagModel::setTagHandle(const Valdi::StringBox &value) {
    _tagHandle = value;
  }

  void NfcTagModel::setTagHandle(Valdi::StringBox &&value) {
    _tagHandle = std::move(value);
  }

  const Valdi::BytesView &NfcTagModel::getId() const {
    return _id;
  }

  void NfcTagModel::setId(const Valdi::BytesView &value) {
    _id = value;
  }

  void NfcTagModel::setId(Valdi::BytesView &&value) {
    _id = std::move(value);
  }

  const std::vector<Valdi::StringBox> &NfcTagModel::getTechs() const {
    return _techs;
  }

  void NfcTagModel::setTechs(const std::vector<Valdi::StringBox> &value) {
    _techs = value;
  }

  void NfcTagModel::setTechs(std::vector<Valdi::StringBox> &&value) {
    _techs = std::move(value);
  }

  const std::vector<NfcRecordModel> &NfcTagModel::getMessages() const {
    return _messages;
  }

  void NfcTagModel::setMessages(const std::vector<NfcRecordModel> &value) {
    _messages = value;
  }

  void NfcTagModel::setMessages(std::vector<NfcRecordModel> &&value) {
    _messages = std::move(value);
  }

  void NfcTagModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NfcTagModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._tagHandle, self._id, self._techs, self._messages);
  }

  void NfcTagModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const NfcTagModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._tagHandle, self._id, self._techs, self._messages);
  }

  Valdi::RegisteredCppGeneratedClass *NfcTagModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NfcTagModel'{'tagHandle':s, 'id':t, 'techs':a<s>, 'messages':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {NfcRecordModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PageContext.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageContext::PageContext(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageContext::PageContext(const PageContext::FinishFn &finish, const PageContext::BackFn &back): Valdi::CppGeneratedModel(getRegisteredClass()),
  _finish(std::move(finish)),
  _back(std::move(back)) {
  }

  const PageContext::FinishFn &PageContext::getFinish() const {
    return _finish;
  }

  void PageContext::setFinish(const PageContext::FinishFn &value) {
    _finish = value;
  }

  void PageContext::setFinish(PageContext::FinishFn &&value) {
    _finish = std::move(value);
  }

  const PageContext::BackFn &PageContext::getBack() const {
    return _back;
  }

  void PageContext::setBack(const PageContext::BackFn &value) {
    _back = value;
  }

  void PageContext::setBack(PageContext::BackFn &&value) {
    _back = std::move(value);
  }

  void PageContext::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageContext &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._finish, self._back);
  }

  void PageContext::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageContext &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._finish, self._back);
  }

  Valdi::RegisteredCppGeneratedClass *PageContext::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageContext'{'finish':f(s), 'back':f()}");

    return kRegisteredClass;
  }

}

//
// PageInsets.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageInsets::PageInsets(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageInsets::PageInsets(double top, double bottom, double left, double right): Valdi::CppGeneratedModel(getRegisteredClass()),
  _top(top),
  _bottom(bottom),
  _left(left),
  _right(right) {
  }

  double PageInsets::getTop() const {
    return _top;
  }

  void PageInsets::setTop(double value) {
    _top = value;
  }

  double PageInsets::getBottom() const {
    return _bottom;
  }

  void PageInsets::setBottom(double value) {
    _bottom = value;
  }

  double PageInsets::getLeft() const {
    return _left;
  }

  void PageInsets::setLeft(double value) {
    _left = value;
  }

  double PageInsets::getRight() const {
    return _right;
  }

  void PageInsets::setRight(double value) {
    _right = value;
  }

  void PageInsets::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageInsets &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._top, self._bottom, self._left, self._right);
  }

  void PageInsets::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageInsets &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._top, self._bottom, self._left, self._right);
  }

  Valdi::RegisteredCppGeneratedClass *PageInsets::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageInsets'{'top':d, 'bottom':d, 'left':d, 'right':d}");

    return kRegisteredClass;
  }

}

//
// PageViewModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PageViewModel::PageViewModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PageViewModel::PageViewModel(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::StringBox &paramsJson, const Valdi::StringBox &presentation, const PageInsets &insets, bool visible, const Valdi::StringBox &visibilityReason): Valdi::CppGeneratedModel(getRegisteredClass()),
  _pageId(std::move(pageId)),
  _route(std::move(route)),
  _paramsJson(std::move(paramsJson)),
  _presentation(std::move(presentation)),
  _insets(std::move(insets)),
  _visible(visible),
  _visibilityReason(std::move(visibilityReason)) {
  }

  const Valdi::StringBox &PageViewModel::getPageId() const {
    return _pageId;
  }

  void PageViewModel::setPageId(const Valdi::StringBox &value) {
    _pageId = value;
  }

  void PageViewModel::setPageId(Valdi::StringBox &&value) {
    _pageId = std::move(value);
  }

  const Valdi::StringBox &PageViewModel::getRoute() const {
    return _route;
  }

  void PageViewModel::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void PageViewModel::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &PageViewModel::getParamsJson() const {
    return _paramsJson;
  }

  void PageViewModel::setParamsJson(const Valdi::StringBox &value) {
    _paramsJson = value;
  }

  void PageViewModel::setParamsJson(Valdi::StringBox &&value) {
    _paramsJson = std::move(value);
  }

  const Valdi::StringBox &PageViewModel::getPresentation() const {
    return _presentation;
  }

  void PageViewModel::setPresentation(const Valdi::StringBox &value) {
    _presentation = value;
  }

  void PageViewModel::setPresentation(Valdi::StringBox &&value) {
    _presentation = std::move(value);
  }

  const PageInsets &PageViewModel::getInsets() const {
    return _insets;
  }

  void PageViewModel::setInsets(const PageInsets &value) {
    _insets = value;
  }

  void PageViewModel::setInsets(PageInsets &&value) {
    _insets = std::move(value);
  }

  bool PageViewModel::getVisible() const {
    return _visible;
  }

  void PageViewModel::setVisible(bool value) {
    _visible = value;
  }

  const Valdi::StringBox &PageViewModel::getVisibilityReason() const {
    return _visibilityReason;
  }

  void PageViewModel::setVisibilityReason(const Valdi::StringBox &value) {
    _visibilityReason = value;
  }

  void PageViewModel::setVisibilityReason(Valdi::StringBox &&value) {
    _visibilityReason = std::move(value);
  }

  void PageViewModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PageViewModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._pageId, self._route, self._paramsJson, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  void PageViewModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageViewModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._pageId, self._route, self._paramsJson, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  Valdi::RegisteredCppGeneratedClass *PageViewModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageViewModel'{'pageId':s, 'route':s, 'paramsJson':s, 'presentation':s, 'insets':r:'[0]', 'visible':b, 'visibilityReason':s}", []() -> Valdi::TypeReferencesVec {
      return {PageInsets::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PermissionGrant.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PermissionGrant::PermissionGrant(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PermissionGrant::PermissionGrant(const Valdi::StringBox &permission, const Valdi::StringBox &result): Valdi::CppGeneratedModel(getRegisteredClass()),
  _permission(std::move(permission)),
  _result(std::move(result)) {
  }

  const Valdi::StringBox &PermissionGrant::getPermission() const {
    return _permission;
  }

  void PermissionGrant::setPermission(const Valdi::StringBox &value) {
    _permission = value;
  }

  void PermissionGrant::setPermission(Valdi::StringBox &&value) {
    _permission = std::move(value);
  }

  const Valdi::StringBox &PermissionGrant::getResult() const {
    return _result;
  }

  void PermissionGrant::setResult(const Valdi::StringBox &value) {
    _result = value;
  }

  void PermissionGrant::setResult(Valdi::StringBox &&value) {
    _result = std::move(value);
  }

  void PermissionGrant::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PermissionGrant &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._permission, self._result);
  }

  void PermissionGrant::marshall(Valdi::ExceptionTracker &exceptionTracker, const PermissionGrant &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._permission, self._result);
  }

  Valdi::RegisteredCppGeneratedClass *PermissionGrant::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PermissionGrant'{'permission':s, 'result':s}");

    return kRegisteredClass;
  }

}

//
// PermissionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class PermissionHostProxy: public PermissionHost {
    public:
    using CheckFn = Valdi::Function<Valdi::Future<bool>(Valdi::StringBox)>;
    using RequestMultipleFn = Valdi::Function<Valdi::Future<std::vector<PermissionGrant>>(std::vector<Valdi::StringBox>)>;
    using OpenSettingsFn = Valdi::Function<Valdi::Future<void>()>;

    PermissionHostProxy() = default;
    ~PermissionHostProxy() override = default;

    Valdi::Future<bool> check(Valdi::StringBox permission) final {
      return _check(permission);
    }

    Valdi::Future<std::vector<PermissionGrant>> requestMultiple(std::vector<Valdi::StringBox> permissions) final {
      return _requestMultiple(permissions);
    }

    Valdi::Future<void> openSettings() final {
      return _openSettings();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionHostProxy> &out) {
      out = Valdi::makeShared<PermissionHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._check, self._requestMultiple, self._openSettings);
    }

    private:
    CheckFn _check;
    RequestMultipleFn _requestMultiple;
    OpenSettingsFn _openSettings;
  };

  PermissionHost::PermissionHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void PermissionHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<PermissionHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<PermissionHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void PermissionHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<PermissionHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::check>(value), Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::requestMultiple>(value), Valdi::CppMarshaller::methodToFunction<PermissionHost, &PermissionHost::openSettings>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *PermissionHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::PermissionHost'{'check':f|m|(s): p<b@>, 'requestMultiple':f|m|(a<s>): p<a<r:'[0]'>>, 'openSettings':f|m|(): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {PermissionGrant::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PickerOption.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PickerOption::PickerOption(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PickerOption::PickerOption(const Valdi::StringBox &value, const Valdi::StringBox &label): Valdi::CppGeneratedModel(getRegisteredClass()),
  _value(std::move(value)),
  _label(std::move(label)) {
  }

  const Valdi::StringBox &PickerOption::getValue() const {
    return _value;
  }

  void PickerOption::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void PickerOption::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  const Valdi::StringBox &PickerOption::getLabel() const {
    return _label;
  }

  void PickerOption::setLabel(const Valdi::StringBox &value) {
    _label = value;
  }

  void PickerOption::setLabel(Valdi::StringBox &&value) {
    _label = std::move(value);
  }

  void PickerOption::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PickerOption &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._value, self._label);
  }

  void PickerOption::marshall(Valdi::ExceptionTracker &exceptionTracker, const PickerOption &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._value, self._label);
  }

  Valdi::RegisteredCppGeneratedClass *PickerOption::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PickerOption'{'value':s, 'label':s}");

    return kRegisteredClass;
  }

}

//
// PickerRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PickerRequest::PickerRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PickerRequest::PickerRequest(const Valdi::StringBox &title, const Valdi::StringBox &confirmText, const Valdi::StringBox &cancelText, const std::vector<PickerOption> &options, const Valdi::StringBox &value): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _confirmText(std::move(confirmText)),
  _cancelText(std::move(cancelText)),
  _options(std::move(options)),
  _value(std::move(value)) {
  }

  const Valdi::StringBox &PickerRequest::getTitle() const {
    return _title;
  }

  void PickerRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void PickerRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const Valdi::StringBox &PickerRequest::getConfirmText() const {
    return _confirmText;
  }

  void PickerRequest::setConfirmText(const Valdi::StringBox &value) {
    _confirmText = value;
  }

  void PickerRequest::setConfirmText(Valdi::StringBox &&value) {
    _confirmText = std::move(value);
  }

  const Valdi::StringBox &PickerRequest::getCancelText() const {
    return _cancelText;
  }

  void PickerRequest::setCancelText(const Valdi::StringBox &value) {
    _cancelText = value;
  }

  void PickerRequest::setCancelText(Valdi::StringBox &&value) {
    _cancelText = std::move(value);
  }

  const std::vector<PickerOption> &PickerRequest::getOptions() const {
    return _options;
  }

  void PickerRequest::setOptions(const std::vector<PickerOption> &value) {
    _options = value;
  }

  void PickerRequest::setOptions(std::vector<PickerOption> &&value) {
    _options = std::move(value);
  }

  const Valdi::StringBox &PickerRequest::getValue() const {
    return _value;
  }

  void PickerRequest::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void PickerRequest::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  void PickerRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PickerRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._confirmText, self._cancelText, self._options, self._value);
  }

  void PickerRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const PickerRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._confirmText, self._cancelText, self._options, self._value);
  }

  Valdi::RegisteredCppGeneratedClass *PickerRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PickerRequest'{'title':s, 'confirmText':s, 'cancelText':s, 'options':a<r:'[0]'>, 'value':s}", []() -> Valdi::TypeReferencesVec {
      return {PickerOption::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PresentationReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  PresentationReply::PresentationReply(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  PresentationReply::PresentationReply(bool confirm, bool cancel, const Valdi::StringBox &value, double index): Valdi::CppGeneratedModel(getRegisteredClass()),
  _confirm(confirm),
  _cancel(cancel),
  _value(std::move(value)),
  _index(index) {
  }

  bool PresentationReply::getConfirm() const {
    return _confirm;
  }

  void PresentationReply::setConfirm(bool value) {
    _confirm = value;
  }

  bool PresentationReply::getCancel() const {
    return _cancel;
  }

  void PresentationReply::setCancel(bool value) {
    _cancel = value;
  }

  const Valdi::StringBox &PresentationReply::getValue() const {
    return _value;
  }

  void PresentationReply::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void PresentationReply::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  double PresentationReply::getIndex() const {
    return _index;
  }

  void PresentationReply::setIndex(double value) {
    _index = value;
  }

  void PresentationReply::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, PresentationReply &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._confirm, self._cancel, self._value, self._index);
  }

  void PresentationReply::marshall(Valdi::ExceptionTracker &exceptionTracker, const PresentationReply &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._confirm, self._cancel, self._value, self._index);
  }

  Valdi::RegisteredCppGeneratedClass *PresentationReply::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PresentationReply'{'confirm':b, 'cancel':b, 'value':s, 'index':d}");

    return kRegisteredClass;
  }

}

//
// ScanCodeReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ScanCodeReply::ScanCodeReply(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ScanCodeReply::ScanCodeReply(const Valdi::StringBox &result, const Valdi::StringBox &scanType): Valdi::CppGeneratedModel(getRegisteredClass()),
  _result(std::move(result)),
  _scanType(std::move(scanType)) {
  }

  const Valdi::StringBox &ScanCodeReply::getResult() const {
    return _result;
  }

  void ScanCodeReply::setResult(const Valdi::StringBox &value) {
    _result = value;
  }

  void ScanCodeReply::setResult(Valdi::StringBox &&value) {
    _result = std::move(value);
  }

  const Valdi::StringBox &ScanCodeReply::getScanType() const {
    return _scanType;
  }

  void ScanCodeReply::setScanType(const Valdi::StringBox &value) {
    _scanType = value;
  }

  void ScanCodeReply::setScanType(Valdi::StringBox &&value) {
    _scanType = std::move(value);
  }

  void ScanCodeReply::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ScanCodeReply &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._result, self._scanType);
  }

  void ScanCodeReply::marshall(Valdi::ExceptionTracker &exceptionTracker, const ScanCodeReply &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._result, self._scanType);
  }

  Valdi::RegisteredCppGeneratedClass *ScanCodeReply::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ScanCodeReply'{'result':s, 'scanType':s}");

    return kRegisteredClass;
  }

}

//
// StartApp.cpp
//

#include "valdi_core/cpp/Marshalling/CppGeneratedExportedFunctionUtils.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  Valdi::RegisteredCppGeneratedClass& StartApp::registeredSchema() {
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'StartApp'{'startApp':f(b, r:'[0]', r:'[1]'): s}", []() -> Valdi::TypeReferencesVec {
      return {NavigationHost::getRegisteredClass(), TokenStore::getRegisteredClass()};
    });
    return *kSchema;
  }

  Valdi::Result<StartApp> StartApp::resolve(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolve<StartApp>(jsRuntime, nativeObjectsManager, "app_pages/src/app", registeredSchema());
  }

  Valdi::Result<Valdi::Ref<Valdi::ValueTypedObject>> StartApp::resolveAsTypedObject(snap::valdi_core::JSRuntime &jsRuntime, const std::shared_ptr<snap::valdi_core::JSRuntimeNativeObjectsManager>& nativeObjectsManager) {
    return Valdi::CppGeneratedExportedFunctionUtils::resolveAsTypedObject(jsRuntime, nativeObjectsManager, "app_pages/src/app", registeredSchema());
  }
}

//
// StorageHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  StorageHost::StorageHost(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageHost::StorageHost(const StorageHost::GetFn &get, const StorageHost::SetFn &set, const StorageHost::RemoveFn &remove, const StorageHost::ClearFn &clear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _get(std::move(get)),
  _set(std::move(set)),
  _remove(std::move(remove)),
  _clear(std::move(clear)) {
  }

  const StorageHost::GetFn &StorageHost::getGet() const {
    return _get;
  }

  void StorageHost::setGet(const StorageHost::GetFn &value) {
    _get = value;
  }

  void StorageHost::setGet(StorageHost::GetFn &&value) {
    _get = std::move(value);
  }

  const StorageHost::SetFn &StorageHost::getSet() const {
    return _set;
  }

  void StorageHost::setSet(const StorageHost::SetFn &value) {
    _set = value;
  }

  void StorageHost::setSet(StorageHost::SetFn &&value) {
    _set = std::move(value);
  }

  const StorageHost::RemoveFn &StorageHost::getRemove() const {
    return _remove;
  }

  void StorageHost::setRemove(const StorageHost::RemoveFn &value) {
    _remove = value;
  }

  void StorageHost::setRemove(StorageHost::RemoveFn &&value) {
    _remove = std::move(value);
  }

  const StorageHost::ClearFn &StorageHost::getClear() const {
    return _clear;
  }

  void StorageHost::setClear(const StorageHost::ClearFn &value) {
    _clear = value;
  }

  void StorageHost::setClear(StorageHost::ClearFn &&value) {
    _clear = std::move(value);
  }

  void StorageHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._get, self._set, self._remove, self._clear);
  }

  void StorageHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._get, self._set, self._remove, self._clear);
  }

  Valdi::RegisteredCppGeneratedClass *StorageHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StorageHost'{'get':f(s): s, 'set':f(s, s): b, 'remove':f(s), 'clear':f()}");

    return kRegisteredClass;
  }

}

//
// ToastRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ToastRequest::ToastRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ToastRequest::ToastRequest(const Valdi::StringBox &title, const Valdi::StringBox &icon, double duration, bool mask): Valdi::CppGeneratedModel(getRegisteredClass()),
  _title(std::move(title)),
  _icon(std::move(icon)),
  _duration(duration),
  _mask(mask) {
  }

  const Valdi::StringBox &ToastRequest::getTitle() const {
    return _title;
  }

  void ToastRequest::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void ToastRequest::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const Valdi::StringBox &ToastRequest::getIcon() const {
    return _icon;
  }

  void ToastRequest::setIcon(const Valdi::StringBox &value) {
    _icon = value;
  }

  void ToastRequest::setIcon(Valdi::StringBox &&value) {
    _icon = std::move(value);
  }

  double ToastRequest::getDuration() const {
    return _duration;
  }

  void ToastRequest::setDuration(double value) {
    _duration = value;
  }

  bool ToastRequest::getMask() const {
    return _mask;
  }

  void ToastRequest::setMask(bool value) {
    _mask = value;
  }

  void ToastRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ToastRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._title, self._icon, self._duration, self._mask);
  }

  void ToastRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const ToastRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._title, self._icon, self._duration, self._mask);
  }

  Valdi::RegisteredCppGeneratedClass *ToastRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ToastRequest'{'title':s, 'icon':s, 'duration':d, 'mask':b}");

    return kRegisteredClass;
  }

}

//
// TokenStore.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TokenStore::TokenStore(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TokenStore::TokenStore(const TokenStore::HasFn &has, const TokenStore::ReadFn &read, const TokenStore::WriteFn &write, const TokenStore::ClearFn &clear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _has(std::move(has)),
  _read(std::move(read)),
  _write(std::move(write)),
  _clear(std::move(clear)) {
  }

  const TokenStore::HasFn &TokenStore::getHas() const {
    return _has;
  }

  void TokenStore::setHas(const TokenStore::HasFn &value) {
    _has = value;
  }

  void TokenStore::setHas(TokenStore::HasFn &&value) {
    _has = std::move(value);
  }

  const TokenStore::ReadFn &TokenStore::getRead() const {
    return _read;
  }

  void TokenStore::setRead(const TokenStore::ReadFn &value) {
    _read = value;
  }

  void TokenStore::setRead(TokenStore::ReadFn &&value) {
    _read = std::move(value);
  }

  const TokenStore::WriteFn &TokenStore::getWrite() const {
    return _write;
  }

  void TokenStore::setWrite(const TokenStore::WriteFn &value) {
    _write = value;
  }

  void TokenStore::setWrite(TokenStore::WriteFn &&value) {
    _write = std::move(value);
  }

  const TokenStore::ClearFn &TokenStore::getClear() const {
    return _clear;
  }

  void TokenStore::setClear(const TokenStore::ClearFn &value) {
    _clear = value;
  }

  void TokenStore::setClear(TokenStore::ClearFn &&value) {
    _clear = std::move(value);
  }

  void TokenStore::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TokenStore &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._has, self._read, self._write, self._clear);
  }

  void TokenStore::marshall(Valdi::ExceptionTracker &exceptionTracker, const TokenStore &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._has, self._read, self._write, self._clear);
  }

  Valdi::RegisteredCppGeneratedClass *TokenStore::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TokenStore'{'has':f(): b, 'read':f(): s, 'write':f(s), 'clear':f()}");

    return kRegisteredClass;
  }

}

//
// VisionDemoResult.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  VisionDemoResult::VisionDemoResult(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  VisionDemoResult::VisionDemoResult(const Valdi::StringBox &opencvVersion, const Valdi::StringBox &ncnnVersion, const Valdi::StringBox &modelName, const Valdi::StringBox &modelDescription, double processingMs, double inferenceMs, double width, double height, double inferenceWidth, double inferenceHeight, double edgePixelCount, const Valdi::StringBox &inputImageUrl, const Valdi::StringBox &edgeImageUrl, const std::vector<VisionPrediction> &predictions): Valdi::CppGeneratedModel(getRegisteredClass()),
  _opencvVersion(std::move(opencvVersion)),
  _ncnnVersion(std::move(ncnnVersion)),
  _modelName(std::move(modelName)),
  _modelDescription(std::move(modelDescription)),
  _processingMs(processingMs),
  _inferenceMs(inferenceMs),
  _width(width),
  _height(height),
  _inferenceWidth(inferenceWidth),
  _inferenceHeight(inferenceHeight),
  _edgePixelCount(edgePixelCount),
  _inputImageUrl(std::move(inputImageUrl)),
  _edgeImageUrl(std::move(edgeImageUrl)),
  _predictions(std::move(predictions)) {
  }

  const Valdi::StringBox &VisionDemoResult::getOpencvVersion() const {
    return _opencvVersion;
  }

  void VisionDemoResult::setOpencvVersion(const Valdi::StringBox &value) {
    _opencvVersion = value;
  }

  void VisionDemoResult::setOpencvVersion(Valdi::StringBox &&value) {
    _opencvVersion = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getNcnnVersion() const {
    return _ncnnVersion;
  }

  void VisionDemoResult::setNcnnVersion(const Valdi::StringBox &value) {
    _ncnnVersion = value;
  }

  void VisionDemoResult::setNcnnVersion(Valdi::StringBox &&value) {
    _ncnnVersion = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getModelName() const {
    return _modelName;
  }

  void VisionDemoResult::setModelName(const Valdi::StringBox &value) {
    _modelName = value;
  }

  void VisionDemoResult::setModelName(Valdi::StringBox &&value) {
    _modelName = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getModelDescription() const {
    return _modelDescription;
  }

  void VisionDemoResult::setModelDescription(const Valdi::StringBox &value) {
    _modelDescription = value;
  }

  void VisionDemoResult::setModelDescription(Valdi::StringBox &&value) {
    _modelDescription = std::move(value);
  }

  double VisionDemoResult::getProcessingMs() const {
    return _processingMs;
  }

  void VisionDemoResult::setProcessingMs(double value) {
    _processingMs = value;
  }

  double VisionDemoResult::getInferenceMs() const {
    return _inferenceMs;
  }

  void VisionDemoResult::setInferenceMs(double value) {
    _inferenceMs = value;
  }

  double VisionDemoResult::getWidth() const {
    return _width;
  }

  void VisionDemoResult::setWidth(double value) {
    _width = value;
  }

  double VisionDemoResult::getHeight() const {
    return _height;
  }

  void VisionDemoResult::setHeight(double value) {
    _height = value;
  }

  double VisionDemoResult::getInferenceWidth() const {
    return _inferenceWidth;
  }

  void VisionDemoResult::setInferenceWidth(double value) {
    _inferenceWidth = value;
  }

  double VisionDemoResult::getInferenceHeight() const {
    return _inferenceHeight;
  }

  void VisionDemoResult::setInferenceHeight(double value) {
    _inferenceHeight = value;
  }

  double VisionDemoResult::getEdgePixelCount() const {
    return _edgePixelCount;
  }

  void VisionDemoResult::setEdgePixelCount(double value) {
    _edgePixelCount = value;
  }

  const Valdi::StringBox &VisionDemoResult::getInputImageUrl() const {
    return _inputImageUrl;
  }

  void VisionDemoResult::setInputImageUrl(const Valdi::StringBox &value) {
    _inputImageUrl = value;
  }

  void VisionDemoResult::setInputImageUrl(Valdi::StringBox &&value) {
    _inputImageUrl = std::move(value);
  }

  const Valdi::StringBox &VisionDemoResult::getEdgeImageUrl() const {
    return _edgeImageUrl;
  }

  void VisionDemoResult::setEdgeImageUrl(const Valdi::StringBox &value) {
    _edgeImageUrl = value;
  }

  void VisionDemoResult::setEdgeImageUrl(Valdi::StringBox &&value) {
    _edgeImageUrl = std::move(value);
  }

  const std::vector<VisionPrediction> &VisionDemoResult::getPredictions() const {
    return _predictions;
  }

  void VisionDemoResult::setPredictions(const std::vector<VisionPrediction> &value) {
    _predictions = value;
  }

  void VisionDemoResult::setPredictions(std::vector<VisionPrediction> &&value) {
    _predictions = std::move(value);
  }

  void VisionDemoResult::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, VisionDemoResult &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._opencvVersion, self._ncnnVersion, self._modelName, self._modelDescription, self._processingMs, self._inferenceMs, self._width, self._height, self._inferenceWidth, self._inferenceHeight, self._edgePixelCount, self._inputImageUrl, self._edgeImageUrl, self._predictions);
  }

  void VisionDemoResult::marshall(Valdi::ExceptionTracker &exceptionTracker, const VisionDemoResult &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._opencvVersion, self._ncnnVersion, self._modelName, self._modelDescription, self._processingMs, self._inferenceMs, self._width, self._height, self._inferenceWidth, self._inferenceHeight, self._edgePixelCount, self._inputImageUrl, self._edgeImageUrl, self._predictions);
  }

  Valdi::RegisteredCppGeneratedClass *VisionDemoResult::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::VisionDemoResult'{'opencvVersion':s, 'ncnnVersion':s, 'modelName':s, 'modelDescription':s, 'processingMs':d, 'inferenceMs':d, 'width':d, 'height':d, 'inferenceWidth':d, 'inferenceHeight':d, 'edgePixelCount':d, 'inputImageUrl':s, 'edgeImageUrl':s, 'predictions':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {VisionPrediction::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class VisionHostProxy: public VisionHost {
    public:
    using RunDemoFn = Valdi::Function<void(RunDemoDoneFn)>;

    VisionHostProxy() = default;
    ~VisionHostProxy() override = default;

    void runDemo(RunDemoDoneFn done) final {
      _runDemo(done);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionHostProxy> &out) {
      out = Valdi::makeShared<VisionHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._runDemo);
    }

    private:
    RunDemoFn _runDemo;
  };

  VisionHost::VisionHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VisionHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VisionHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VisionHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VisionHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VisionHost, &VisionHost::runDemo>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VisionHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::VisionHost'{'runDemo':f|m|(f(s, r?:'[0]'))}", []() -> Valdi::TypeReferencesVec {
      return {VisionDemoResult::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionPrediction.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  VisionPrediction::VisionPrediction(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  VisionPrediction::VisionPrediction(const Valdi::StringBox &label, double score): Valdi::CppGeneratedModel(getRegisteredClass()),
  _label(std::move(label)),
  _score(score) {
  }

  const Valdi::StringBox &VisionPrediction::getLabel() const {
    return _label;
  }

  void VisionPrediction::setLabel(const Valdi::StringBox &value) {
    _label = value;
  }

  void VisionPrediction::setLabel(Valdi::StringBox &&value) {
    _label = std::move(value);
  }

  double VisionPrediction::getScore() const {
    return _score;
  }

  void VisionPrediction::setScore(double value) {
    _score = value;
  }

  void VisionPrediction::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, VisionPrediction &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._label, self._score);
  }

  void VisionPrediction::marshall(Valdi::ExceptionTracker &exceptionTracker, const VisionPrediction &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._label, self._score);
  }

  Valdi::RegisteredCppGeneratedClass *VisionPrediction::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::VisionPrediction'{'label':s, 'score':d}");

    return kRegisteredClass;
  }

}

//
// WifiConnectParamsModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WifiConnectParamsModel::WifiConnectParamsModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiConnectParamsModel::WifiConnectParamsModel(const Valdi::StringBox &SSID, const Valdi::StringBox &BSSID, const Valdi::StringBox &password, bool maunal, bool partialInfo): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _password(std::move(password)),
  _maunal(maunal),
  _partialInfo(partialInfo) {
  }

  const Valdi::StringBox &WifiConnectParamsModel::getSSID() const {
    return _SSID;
  }

  void WifiConnectParamsModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiConnectParamsModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const Valdi::StringBox &WifiConnectParamsModel::getBSSID() const {
    return _BSSID;
  }

  void WifiConnectParamsModel::setBSSID(const Valdi::StringBox &value) {
    _BSSID = value;
  }

  void WifiConnectParamsModel::setBSSID(Valdi::StringBox &&value) {
    _BSSID = std::move(value);
  }

  const Valdi::StringBox &WifiConnectParamsModel::getPassword() const {
    return _password;
  }

  void WifiConnectParamsModel::setPassword(const Valdi::StringBox &value) {
    _password = value;
  }

  void WifiConnectParamsModel::setPassword(Valdi::StringBox &&value) {
    _password = std::move(value);
  }

  bool WifiConnectParamsModel::getMaunal() const {
    return _maunal;
  }

  void WifiConnectParamsModel::setMaunal(bool value) {
    _maunal = value;
  }

  bool WifiConnectParamsModel::getPartialInfo() const {
    return _partialInfo;
  }

  void WifiConnectParamsModel::setPartialInfo(bool value) {
    _partialInfo = value;
  }

  void WifiConnectParamsModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiConnectParamsModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._password, self._maunal, self._partialInfo);
  }

  void WifiConnectParamsModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiConnectParamsModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._password, self._maunal, self._partialInfo);
  }

  Valdi::RegisteredCppGeneratedClass *WifiConnectParamsModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WifiConnectParamsModel'{'SSID':s, 'BSSID':s, 'password':s, 'maunal':b, 'partialInfo':b}");

    return kRegisteredClass;
  }

}

//
// WifiCredentialModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WifiCredentialModel::WifiCredentialModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiCredentialModel::WifiCredentialModel(const Valdi::StringBox &SSID, const std::optional<Valdi::StringBox> &BSSID, const Valdi::StringBox &password): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _password(std::move(password)) {
  }

  const Valdi::StringBox &WifiCredentialModel::getSSID() const {
    return _SSID;
  }

  void WifiCredentialModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiCredentialModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const std::optional<Valdi::StringBox> &WifiCredentialModel::getBSSID() const {
    return _BSSID;
  }

  void WifiCredentialModel::setBSSID(const std::optional<Valdi::StringBox> &value) {
    _BSSID = value;
  }

  void WifiCredentialModel::setBSSID(std::optional<Valdi::StringBox> &&value) {
    _BSSID = std::move(value);
  }

  const Valdi::StringBox &WifiCredentialModel::getPassword() const {
    return _password;
  }

  void WifiCredentialModel::setPassword(const Valdi::StringBox &value) {
    _password = value;
  }

  void WifiCredentialModel::setPassword(Valdi::StringBox &&value) {
    _password = std::move(value);
  }

  void WifiCredentialModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiCredentialModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._password);
  }

  void WifiCredentialModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiCredentialModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._password);
  }

  Valdi::RegisteredCppGeneratedClass *WifiCredentialModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WifiCredentialModel'{'SSID':s, 'BSSID':s?, 'password':s}");

    return kRegisteredClass;
  }

}

//
// WifiHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  class WifiHostProxy: public WifiHost {
    public:
    using SetEventsFn = Valdi::Function<void(WifiHostEvents)>;
    using StartWifiFn = Valdi::Function<Valdi::Future<void>()>;
    using StopWifiFn = Valdi::Function<Valdi::Future<void>()>;
    using ConnectWifiFn = Valdi::Function<Valdi::Future<WifiInfoModel>(WifiConnectParamsModel)>;
    using GetWifiListFn = Valdi::Function<Valdi::Future<void>()>;
    using GetConnectedWifiFn = Valdi::Function<Valdi::Future<WifiInfoModel>(bool)>;
    using SetWifiListFn = Valdi::Function<Valdi::Future<void>(std::vector<WifiCredentialModel>)>;
    using GetLocationPermissionStateFn = Valdi::Function<Valdi::Future<WifiPermissionStateModel>()>;
    using RequestLocationPermissionFn = Valdi::Function<Valdi::Future<WifiPermissionStateModel>()>;

    WifiHostProxy() = default;
    ~WifiHostProxy() override = default;

    void setEvents(WifiHostEvents events) final {
      _setEvents(events);
    }

    Valdi::Future<void> startWifi() final {
      return _startWifi();
    }

    Valdi::Future<void> stopWifi() final {
      return _stopWifi();
    }

    Valdi::Future<WifiInfoModel> connectWifi(WifiConnectParamsModel params) final {
      return _connectWifi(params);
    }

    Valdi::Future<void> getWifiList() final {
      return _getWifiList();
    }

    Valdi::Future<WifiInfoModel> getConnectedWifi(bool partialInfo) final {
      return _getConnectedWifi(partialInfo);
    }

    Valdi::Future<void> setWifiList(std::vector<WifiCredentialModel> wifiList) final {
      return _setWifiList(wifiList);
    }

    Valdi::Future<WifiPermissionStateModel> getLocationPermissionState() final {
      return _getLocationPermissionState();
    }

    Valdi::Future<WifiPermissionStateModel> requestLocationPermission() final {
      return _requestLocationPermission();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiHostProxy> &out) {
      out = Valdi::makeShared<WifiHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._setEvents, self._startWifi, self._stopWifi, self._connectWifi, self._getWifiList, self._getConnectedWifi, self._setWifiList, self._getLocationPermissionState, self._requestLocationPermission);
    }

    private:
    SetEventsFn _setEvents;
    StartWifiFn _startWifi;
    StopWifiFn _stopWifi;
    ConnectWifiFn _connectWifi;
    GetWifiListFn _getWifiList;
    GetConnectedWifiFn _getConnectedWifi;
    SetWifiListFn _setWifiList;
    GetLocationPermissionStateFn _getLocationPermissionState;
    RequestLocationPermissionFn _requestLocationPermission;
  };

  WifiHost::WifiHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void WifiHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<WifiHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<WifiHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void WifiHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<WifiHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::setEvents>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::startWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::stopWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::connectWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getWifiList>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getConnectedWifi>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::setWifiList>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::getLocationPermissionState>(value), Valdi::CppMarshaller::methodToFunction<WifiHost, &WifiHost::requestLocationPermission>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *WifiHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::WifiHost'{'setEvents':f|m|(r:'[0]'), 'startWifi':f|m|(): p<v>, 'stopWifi':f|m|(): p<v>, 'connectWifi':f|m|(r:'[2]'): p<r:'[1]'>, 'getWifiList':f|m|(): p<v>, 'getConnectedWifi':f|m|(b): p<r:'[1]'>, 'setWifiList':f|m|(a<r:'[3]'>): p<v>, 'getLocationPermissionState':f|m|(): p<r:'[4]'>, 'requestLocationPermission':f|m|(): p<r:'[4]'>}", []() -> Valdi::TypeReferencesVec {
      return {WifiHostEvents::getRegisteredClass(), WifiInfoModel::getRegisteredClass(), WifiConnectParamsModel::getRegisteredClass(), WifiCredentialModel::getRegisteredClass(), WifiPermissionStateModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// WifiHostEvents.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WifiHostEvents::WifiHostEvents(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiHostEvents::WifiHostEvents(const WifiHostEvents::WifiConnectedFn &wifiConnected, const WifiHostEvents::WifiListFn &wifiList): Valdi::CppGeneratedModel(getRegisteredClass()),
  _wifiConnected(std::move(wifiConnected)),
  _wifiList(std::move(wifiList)) {
  }

  const WifiHostEvents::WifiConnectedFn &WifiHostEvents::getWifiConnected() const {
    return _wifiConnected;
  }

  void WifiHostEvents::setWifiConnected(const WifiHostEvents::WifiConnectedFn &value) {
    _wifiConnected = value;
  }

  void WifiHostEvents::setWifiConnected(WifiHostEvents::WifiConnectedFn &&value) {
    _wifiConnected = std::move(value);
  }

  const WifiHostEvents::WifiListFn &WifiHostEvents::getWifiList() const {
    return _wifiList;
  }

  void WifiHostEvents::setWifiList(const WifiHostEvents::WifiListFn &value) {
    _wifiList = value;
  }

  void WifiHostEvents::setWifiList(WifiHostEvents::WifiListFn &&value) {
    _wifiList = std::move(value);
  }

  void WifiHostEvents::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiHostEvents &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._wifiConnected, self._wifiList);
  }

  void WifiHostEvents::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiHostEvents &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._wifiConnected, self._wifiList);
  }

  Valdi::RegisteredCppGeneratedClass *WifiHostEvents::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WifiHostEvents'{'wifiConnected':f(r:'[0]'), 'wifiList':f(a<r:'[0]'>)}", []() -> Valdi::TypeReferencesVec {
      return {WifiInfoModel::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// WifiInfoModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WifiInfoModel::WifiInfoModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiInfoModel::WifiInfoModel(const Valdi::StringBox &SSID, const std::optional<Valdi::StringBox> &BSSID, std::optional<bool> secure, std::optional<double> signalStrength, std::optional<double> frequency): Valdi::CppGeneratedModel(getRegisteredClass()),
  _SSID(std::move(SSID)),
  _BSSID(std::move(BSSID)),
  _secure(secure),
  _signalStrength(signalStrength),
  _frequency(frequency) {
  }

  const Valdi::StringBox &WifiInfoModel::getSSID() const {
    return _SSID;
  }

  void WifiInfoModel::setSSID(const Valdi::StringBox &value) {
    _SSID = value;
  }

  void WifiInfoModel::setSSID(Valdi::StringBox &&value) {
    _SSID = std::move(value);
  }

  const std::optional<Valdi::StringBox> &WifiInfoModel::getBSSID() const {
    return _BSSID;
  }

  void WifiInfoModel::setBSSID(const std::optional<Valdi::StringBox> &value) {
    _BSSID = value;
  }

  void WifiInfoModel::setBSSID(std::optional<Valdi::StringBox> &&value) {
    _BSSID = std::move(value);
  }

  std::optional<bool> WifiInfoModel::getSecure() const {
    return _secure;
  }

  void WifiInfoModel::setSecure(std::optional<bool> value) {
    _secure = value;
  }

  std::optional<double> WifiInfoModel::getSignalStrength() const {
    return _signalStrength;
  }

  void WifiInfoModel::setSignalStrength(std::optional<double> value) {
    _signalStrength = value;
  }

  std::optional<double> WifiInfoModel::getFrequency() const {
    return _frequency;
  }

  void WifiInfoModel::setFrequency(std::optional<double> value) {
    _frequency = value;
  }

  void WifiInfoModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiInfoModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._SSID, self._BSSID, self._secure, self._signalStrength, self._frequency);
  }

  void WifiInfoModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiInfoModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._SSID, self._BSSID, self._secure, self._signalStrength, self._frequency);
  }

  Valdi::RegisteredCppGeneratedClass *WifiInfoModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WifiInfoModel'{'SSID':s, 'BSSID':s?, 'secure':b@?, 'signalStrength':d@?, 'frequency':d@?}");

    return kRegisteredClass;
  }

}

//
// WifiPermissionStateModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WifiPermissionStateModel::WifiPermissionStateModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WifiPermissionStateModel::WifiPermissionStateModel(const Valdi::StringBox &status, bool canAskAgain): Valdi::CppGeneratedModel(getRegisteredClass()),
  _status(std::move(status)),
  _canAskAgain(canAskAgain) {
  }

  const Valdi::StringBox &WifiPermissionStateModel::getStatus() const {
    return _status;
  }

  void WifiPermissionStateModel::setStatus(const Valdi::StringBox &value) {
    _status = value;
  }

  void WifiPermissionStateModel::setStatus(Valdi::StringBox &&value) {
    _status = std::move(value);
  }

  bool WifiPermissionStateModel::getCanAskAgain() const {
    return _canAskAgain;
  }

  void WifiPermissionStateModel::setCanAskAgain(bool value) {
    _canAskAgain = value;
  }

  void WifiPermissionStateModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WifiPermissionStateModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._status, self._canAskAgain);
  }

  void WifiPermissionStateModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const WifiPermissionStateModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._status, self._canAskAgain);
  }

  Valdi::RegisteredCppGeneratedClass *WifiPermissionStateModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WifiPermissionStateModel'{'status':s, 'canAskAgain':b}");

    return kRegisteredClass;
  }

}

