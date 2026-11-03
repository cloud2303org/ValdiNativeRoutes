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

  class AppUIHostProxy: public AppUIHost {
    public:
    using ShowModalFn = Valdi::Function<Valdi::Future<ModalReply>(ModalRequest)>;
    using ShowActionSheetFn = Valdi::Function<Valdi::Future<PresentationReply>(ActionSheetRequest)>;
    using ShowPickerFn = Valdi::Function<Valdi::Future<PresentationReply>(PickerRequest)>;
    using ShowDatePickerFn = Valdi::Function<Valdi::Future<PresentationReply>(DatePickerRequest)>;
    using ShowBottomSheetFn = Valdi::Function<Valdi::Future<PresentationReply>(BottomSheetRequest)>;
    using PreviewImageFn = Valdi::Function<Valdi::Future<PresentationReply>(ImagePreviewRequest)>;
    using ScanCodeFn = Valdi::Function<Valdi::Future<ScanCodeReply>()>;
    using PickAttachmentsFn = Valdi::Function<Valdi::Future<AttachmentSelection>(Valdi::StringBox, double, std::vector<Valdi::StringBox>)>;
    using ClearAttachmentCacheFn = Valdi::Function<Valdi::Future<void>()>;
    using ShowToastFn = Valdi::Function<Valdi::Future<void>(ToastRequest)>;
    using HideToastFn = Valdi::Function<Valdi::Future<void>()>;
    using ShowLoadingFn = Valdi::Function<Valdi::Future<void>(LoadingRequest)>;
    using HideLoadingFn = Valdi::Function<Valdi::Future<void>()>;

    AppUIHostProxy() = default;
    ~AppUIHostProxy() override = default;

    Valdi::Future<ModalReply> showModal(ModalRequest request) final {
      return _showModal(request);
    }

    Valdi::Future<PresentationReply> showActionSheet(ActionSheetRequest request) final {
      return _showActionSheet(request);
    }

    Valdi::Future<PresentationReply> showPicker(PickerRequest request) final {
      return _showPicker(request);
    }

    Valdi::Future<PresentationReply> showDatePicker(DatePickerRequest request) final {
      return _showDatePicker(request);
    }

    Valdi::Future<PresentationReply> showBottomSheet(BottomSheetRequest request) final {
      return _showBottomSheet(request);
    }

    Valdi::Future<PresentationReply> previewImage(ImagePreviewRequest request) final {
      return _previewImage(request);
    }

    Valdi::Future<ScanCodeReply> scanCode() final {
      return _scanCode();
    }

    Valdi::Future<AttachmentSelection> pickAttachments(Valdi::StringBox source, double limit, std::vector<Valdi::StringBox> mimeTypes) final {
      return _pickAttachments(source, limit, mimeTypes);
    }

    Valdi::Future<void> clearAttachmentCache() final {
      return _clearAttachmentCache();
    }

    Valdi::Future<void> showToast(ToastRequest request) final {
      return _showToast(request);
    }

    Valdi::Future<void> hideToast() final {
      return _hideToast();
    }

    Valdi::Future<void> showLoading(LoadingRequest request) final {
      return _showLoading(request);
    }

    Valdi::Future<void> hideLoading() final {
      return _hideLoading();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppUIHostProxy> &out) {
      out = Valdi::makeShared<AppUIHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._showModal, self._showActionSheet, self._showPicker, self._showDatePicker, self._showBottomSheet, self._previewImage, self._scanCode, self._pickAttachments, self._clearAttachmentCache, self._showToast, self._hideToast, self._showLoading, self._hideLoading);
    }

    private:
    ShowModalFn _showModal;
    ShowActionSheetFn _showActionSheet;
    ShowPickerFn _showPicker;
    ShowDatePickerFn _showDatePicker;
    ShowBottomSheetFn _showBottomSheet;
    PreviewImageFn _previewImage;
    ScanCodeFn _scanCode;
    PickAttachmentsFn _pickAttachments;
    ClearAttachmentCacheFn _clearAttachmentCache;
    ShowToastFn _showToast;
    HideToastFn _hideToast;
    ShowLoadingFn _showLoading;
    HideLoadingFn _hideLoading;
  };

  AppUIHost::AppUIHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AppUIHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppUIHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AppUIHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AppUIHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AppUIHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showModal>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showActionSheet>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showPicker>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showDatePicker>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showBottomSheet>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::previewImage>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::scanCode>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::pickAttachments>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::clearAttachmentCache>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showToast>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::hideToast>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::showLoading>(value), Valdi::CppMarshaller::methodToFunction<AppUIHost, &AppUIHost::hideLoading>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AppUIHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_pages::AppUIHost'{'showModal':f|m|(r:'[1]'): p<r:'[0]'>, 'showActionSheet':f|m|(r:'[3]'): p<r:'[2]'>, 'showPicker':f|m|(r:'[4]'): p<r:'[2]'>, 'showDatePicker':f|m|(r:'[5]'): p<r:'[2]'>, 'showBottomSheet':f|m|(r:'[6]'): p<r:'[2]'>, 'previewImage':f|m|(r:'[7]'): p<r:'[2]'>, 'scanCode':f|m|(): p<r:'[8]'>, 'pickAttachments':f|m|(s, d, a<s>): p<r:'[9]'>, 'clearAttachmentCache':f|m|(): p<v>, 'showToast':f|m|(r:'[10]'): p<v>, 'hideToast':f|m|(): p<v>, 'showLoading':f|m|(r:'[11]'): p<v>, 'hideLoading':f|m|(): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {ModalReply::getRegisteredClass(), ModalRequest::getRegisteredClass(), PresentationReply::getRegisteredClass(), ActionSheetRequest::getRegisteredClass(), PickerRequest::getRegisteredClass(), DatePickerRequest::getRegisteredClass(), BottomSheetRequest::getRegisteredClass(), ImagePreviewRequest::getRegisteredClass(), ScanCodeReply::getRegisteredClass(), AttachmentSelection::getRegisteredClass(), ToastRequest::getRegisteredClass(), LoadingRequest::getRegisteredClass()};
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
// ColumnWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ColumnWheelConfig::ColumnWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ColumnWheelConfig::ColumnWheelConfig(const std::vector<PickerOption> &options, const Valdi::StringBox &value): Valdi::CppGeneratedModel(getRegisteredClass()),
  _options(std::move(options)),
  _value(std::move(value)) {
  }

  const std::vector<PickerOption> &ColumnWheelConfig::getOptions() const {
    return _options;
  }

  void ColumnWheelConfig::setOptions(const std::vector<PickerOption> &value) {
    _options = value;
  }

  void ColumnWheelConfig::setOptions(std::vector<PickerOption> &&value) {
    _options = std::move(value);
  }

  const Valdi::StringBox &ColumnWheelConfig::getValue() const {
    return _value;
  }

  void ColumnWheelConfig::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void ColumnWheelConfig::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  void ColumnWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ColumnWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._options, self._value);
  }

  void ColumnWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const ColumnWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._options, self._value);
  }

  Valdi::RegisteredCppGeneratedClass *ColumnWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ColumnWheelConfig'{'options':a<r:'[0]'>, 'value':s}", []() -> Valdi::TypeReferencesVec {
      return {PickerOption::getRegisteredClass()};
    });

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

  NavigationHost::NavigationHost(const NavigationHost::PushFn &push, const NavigationHost::PushForResultFn &pushForResult, const NavigationHost::ReplaceFn &replace, const NavigationHost::BackFn &back, const NavigationHost::PopToRootFn &popToRoot, const NavigationHost::ResetFn &reset, const NavigationHost::SwitchTabFn &switchTab, const NavigationHost::SetStatusBarStyleFn &setStatusBarStyle, const NavigationHost::CurrentPagesFn &currentPages, const NavigationHost::UpdateRoutesFn &updateRoutes): Valdi::CppGeneratedModel(getRegisteredClass()),
  _push(std::move(push)),
  _pushForResult(std::move(pushForResult)),
  _replace(std::move(replace)),
  _back(std::move(back)),
  _popToRoot(std::move(popToRoot)),
  _reset(std::move(reset)),
  _switchTab(std::move(switchTab)),
  _setStatusBarStyle(std::move(setStatusBarStyle)),
  _currentPages(std::move(currentPages)),
  _updateRoutes(std::move(updateRoutes)) {
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

  const NavigationHost::UpdateRoutesFn &NavigationHost::getUpdateRoutes() const {
    return _updateRoutes;
  }

  void NavigationHost::setUpdateRoutes(const NavigationHost::UpdateRoutesFn &value) {
    _updateRoutes = value;
  }

  void NavigationHost::setUpdateRoutes(NavigationHost::UpdateRoutesFn &&value) {
    _updateRoutes = std::move(value);
  }

  void NavigationHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, NavigationHost &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages, self._updateRoutes);
  }

  void NavigationHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const NavigationHost &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._push, self._pushForResult, self._replace, self._back, self._popToRoot, self._reset, self._switchTab, self._setStatusBarStyle, self._currentPages, self._updateRoutes);
  }

  Valdi::RegisteredCppGeneratedClass *NavigationHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::NavigationHost'{'push':f(s, m<s,u>, s, r:'[0]'), 'pushForResult':f(s, m<s,u>, s, r:'[0]', f(m<s,u>, b)), 'replace':f(s, m<s,u>, r:'[0]'), 'back':f(d), 'popToRoot':f(), 'reset':f(s, m<s,u>), 'switchTab':f(s), 'setStatusBarStyle':f(s), 'currentPages':f(f(a<r:'[1]'>)), 'updateRoutes':f(r:'[2]')}", []() -> Valdi::TypeReferencesVec {
      return {ResolvedNavigation::getRegisteredClass(), StackPage::getRegisteredClass(), RouteDeclaration::getRegisteredClass()};
    });

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageContext'{'finish':f(m<s,u>), 'back':f()}");

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

  PageViewModel::PageViewModel(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::Ref<Valdi::ValueMap> &params, const Valdi::StringBox &presentation, const PageInsets &insets, bool visible, const Valdi::StringBox &visibilityReason): Valdi::CppGeneratedModel(getRegisteredClass()),
  _pageId(std::move(pageId)),
  _route(std::move(route)),
  _params(std::move(params)),
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

  const Valdi::Ref<Valdi::ValueMap> &PageViewModel::getParams() const {
    return _params;
  }

  void PageViewModel::setParams(const Valdi::Ref<Valdi::ValueMap> &value) {
    _params = value;
  }

  void PageViewModel::setParams(Valdi::Ref<Valdi::ValueMap> &&value) {
    _params = std::move(value);
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
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._pageId, self._route, self._params, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  void PageViewModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const PageViewModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._pageId, self._route, self._params, self._presentation, self._insets, self._visible, self._visibilityReason);
  }

  Valdi::RegisteredCppGeneratedClass *PageViewModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::PageViewModel'{'pageId':s, 'route':s, 'params':m<s,u>, 'presentation':s, 'insets':r:'[0]', 'visible':b, 'visibilityReason':s}", []() -> Valdi::TypeReferencesVec {
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
// ResolvedNavigation.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  ResolvedNavigation::ResolvedNavigation(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  ResolvedNavigation::ResolvedNavigation(const Valdi::StringBox &animation, double durationMs, const Valdi::StringBox &presentation): Valdi::CppGeneratedModel(getRegisteredClass()),
  _animation(std::move(animation)),
  _durationMs(durationMs),
  _presentation(std::move(presentation)) {
  }

  const Valdi::StringBox &ResolvedNavigation::getAnimation() const {
    return _animation;
  }

  void ResolvedNavigation::setAnimation(const Valdi::StringBox &value) {
    _animation = value;
  }

  void ResolvedNavigation::setAnimation(Valdi::StringBox &&value) {
    _animation = std::move(value);
  }

  double ResolvedNavigation::getDurationMs() const {
    return _durationMs;
  }

  void ResolvedNavigation::setDurationMs(double value) {
    _durationMs = value;
  }

  const Valdi::StringBox &ResolvedNavigation::getPresentation() const {
    return _presentation;
  }

  void ResolvedNavigation::setPresentation(const Valdi::StringBox &value) {
    _presentation = value;
  }

  void ResolvedNavigation::setPresentation(Valdi::StringBox &&value) {
    _presentation = std::move(value);
  }

  void ResolvedNavigation::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, ResolvedNavigation &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._animation, self._durationMs, self._presentation);
  }

  void ResolvedNavigation::marshall(Valdi::ExceptionTracker &exceptionTracker, const ResolvedNavigation &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._animation, self._durationMs, self._presentation);
  }

  Valdi::RegisteredCppGeneratedClass *ResolvedNavigation::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::ResolvedNavigation'{'animation':s, 'durationMs':d, 'presentation':s}");

    return kRegisteredClass;
  }

}

//
// RouteDeclaration.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteDeclaration::RouteDeclaration(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteDeclaration::RouteDeclaration(const std::vector<RouteEntry> &routes, const Valdi::Ref<RouteTabBar> &tabBar, const Valdi::StringBox &root): Valdi::CppGeneratedModel(getRegisteredClass()),
  _routes(std::move(routes)),
  _tabBar(std::move(tabBar)),
  _root(std::move(root)) {
  }

  const std::vector<RouteEntry> &RouteDeclaration::getRoutes() const {
    return _routes;
  }

  void RouteDeclaration::setRoutes(const std::vector<RouteEntry> &value) {
    _routes = value;
  }

  void RouteDeclaration::setRoutes(std::vector<RouteEntry> &&value) {
    _routes = std::move(value);
  }

  const Valdi::Ref<RouteTabBar> &RouteDeclaration::getTabBar() const {
    return _tabBar;
  }

  void RouteDeclaration::setTabBar(const Valdi::Ref<RouteTabBar> &value) {
    _tabBar = value;
  }

  void RouteDeclaration::setTabBar(Valdi::Ref<RouteTabBar> &&value) {
    _tabBar = std::move(value);
  }

  const Valdi::StringBox &RouteDeclaration::getRoot() const {
    return _root;
  }

  void RouteDeclaration::setRoot(const Valdi::StringBox &value) {
    _root = value;
  }

  void RouteDeclaration::setRoot(Valdi::StringBox &&value) {
    _root = std::move(value);
  }

  void RouteDeclaration::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteDeclaration &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._routes, self._tabBar, self._root);
  }

  void RouteDeclaration::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteDeclaration &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._routes, self._tabBar, self._root);
  }

  Valdi::RegisteredCppGeneratedClass *RouteDeclaration::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteDeclaration'{'routes':a<r:'[0]'>, 'tabBar':r?:'[1]', 'root':s}", []() -> Valdi::TypeReferencesVec {
      return {RouteEntry::getRegisteredClass(), RouteTabBar::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// RouteEntry.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteEntry::RouteEntry(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteEntry::RouteEntry(const Valdi::StringBox &route, const Valdi::StringBox &kind, const Valdi::StringBox &title, const std::optional<Valdi::StringBox> &component, const std::optional<Valdi::StringBox> &nativeName): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _kind(std::move(kind)),
  _title(std::move(title)),
  _component(std::move(component)),
  _nativeName(std::move(nativeName)) {
  }

  const Valdi::StringBox &RouteEntry::getRoute() const {
    return _route;
  }

  void RouteEntry::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteEntry::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteEntry::getKind() const {
    return _kind;
  }

  void RouteEntry::setKind(const Valdi::StringBox &value) {
    _kind = value;
  }

  void RouteEntry::setKind(Valdi::StringBox &&value) {
    _kind = std::move(value);
  }

  const Valdi::StringBox &RouteEntry::getTitle() const {
    return _title;
  }

  void RouteEntry::setTitle(const Valdi::StringBox &value) {
    _title = value;
  }

  void RouteEntry::setTitle(Valdi::StringBox &&value) {
    _title = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteEntry::getComponent() const {
    return _component;
  }

  void RouteEntry::setComponent(const std::optional<Valdi::StringBox> &value) {
    _component = value;
  }

  void RouteEntry::setComponent(std::optional<Valdi::StringBox> &&value) {
    _component = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteEntry::getNativeName() const {
    return _nativeName;
  }

  void RouteEntry::setNativeName(const std::optional<Valdi::StringBox> &value) {
    _nativeName = value;
  }

  void RouteEntry::setNativeName(std::optional<Valdi::StringBox> &&value) {
    _nativeName = std::move(value);
  }

  void RouteEntry::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteEntry &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._kind, self._title, self._component, self._nativeName);
  }

  void RouteEntry::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteEntry &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._kind, self._title, self._component, self._nativeName);
  }

  Valdi::RegisteredCppGeneratedClass *RouteEntry::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteEntry'{'route':s, 'kind':s, 'title':s, 'component':s?, 'nativeName':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTab.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteTab::RouteTab(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteTab::RouteTab(const Valdi::StringBox &route, const Valdi::StringBox &text, const Valdi::StringBox &icon, const Valdi::StringBox &selectedIcon, const std::optional<Valdi::StringBox> &iconData, const std::optional<Valdi::StringBox> &selectedIconData): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _text(std::move(text)),
  _icon(std::move(icon)),
  _selectedIcon(std::move(selectedIcon)),
  _iconData(std::move(iconData)),
  _selectedIconData(std::move(selectedIconData)) {
  }

  const Valdi::StringBox &RouteTab::getRoute() const {
    return _route;
  }

  void RouteTab::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteTab::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getText() const {
    return _text;
  }

  void RouteTab::setText(const Valdi::StringBox &value) {
    _text = value;
  }

  void RouteTab::setText(Valdi::StringBox &&value) {
    _text = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getIcon() const {
    return _icon;
  }

  void RouteTab::setIcon(const Valdi::StringBox &value) {
    _icon = value;
  }

  void RouteTab::setIcon(Valdi::StringBox &&value) {
    _icon = std::move(value);
  }

  const Valdi::StringBox &RouteTab::getSelectedIcon() const {
    return _selectedIcon;
  }

  void RouteTab::setSelectedIcon(const Valdi::StringBox &value) {
    _selectedIcon = value;
  }

  void RouteTab::setSelectedIcon(Valdi::StringBox &&value) {
    _selectedIcon = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTab::getIconData() const {
    return _iconData;
  }

  void RouteTab::setIconData(const std::optional<Valdi::StringBox> &value) {
    _iconData = value;
  }

  void RouteTab::setIconData(std::optional<Valdi::StringBox> &&value) {
    _iconData = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTab::getSelectedIconData() const {
    return _selectedIconData;
  }

  void RouteTab::setSelectedIconData(const std::optional<Valdi::StringBox> &value) {
    _selectedIconData = value;
  }

  void RouteTab::setSelectedIconData(std::optional<Valdi::StringBox> &&value) {
    _selectedIconData = std::move(value);
  }

  void RouteTab::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteTab &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._text, self._icon, self._selectedIcon, self._iconData, self._selectedIconData);
  }

  void RouteTab::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteTab &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._text, self._icon, self._selectedIcon, self._iconData, self._selectedIconData);
  }

  Valdi::RegisteredCppGeneratedClass *RouteTab::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteTab'{'route':s, 'text':s, 'icon':s, 'selectedIcon':s, 'iconData':s?, 'selectedIconData':s?}");

    return kRegisteredClass;
  }

}

//
// RouteTabBar.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  RouteTabBar::RouteTabBar(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  RouteTabBar::RouteTabBar(const Valdi::StringBox &route, const Valdi::StringBox &initial, const std::vector<RouteTab> &tabs, const std::optional<Valdi::StringBox> &mode, const std::optional<Valdi::StringBox> &component): Valdi::CppGeneratedModel(getRegisteredClass()),
  _route(std::move(route)),
  _initial(std::move(initial)),
  _tabs(std::move(tabs)),
  _mode(std::move(mode)),
  _component(std::move(component)) {
  }

  const Valdi::StringBox &RouteTabBar::getRoute() const {
    return _route;
  }

  void RouteTabBar::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void RouteTabBar::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::StringBox &RouteTabBar::getInitial() const {
    return _initial;
  }

  void RouteTabBar::setInitial(const Valdi::StringBox &value) {
    _initial = value;
  }

  void RouteTabBar::setInitial(Valdi::StringBox &&value) {
    _initial = std::move(value);
  }

  const std::vector<RouteTab> &RouteTabBar::getTabs() const {
    return _tabs;
  }

  void RouteTabBar::setTabs(const std::vector<RouteTab> &value) {
    _tabs = value;
  }

  void RouteTabBar::setTabs(std::vector<RouteTab> &&value) {
    _tabs = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTabBar::getMode() const {
    return _mode;
  }

  void RouteTabBar::setMode(const std::optional<Valdi::StringBox> &value) {
    _mode = value;
  }

  void RouteTabBar::setMode(std::optional<Valdi::StringBox> &&value) {
    _mode = std::move(value);
  }

  const std::optional<Valdi::StringBox> &RouteTabBar::getComponent() const {
    return _component;
  }

  void RouteTabBar::setComponent(const std::optional<Valdi::StringBox> &value) {
    _component = value;
  }

  void RouteTabBar::setComponent(std::optional<Valdi::StringBox> &&value) {
    _component = std::move(value);
  }

  void RouteTabBar::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, RouteTabBar &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._route, self._initial, self._tabs, self._mode, self._component);
  }

  void RouteTabBar::marshall(Valdi::ExceptionTracker &exceptionTracker, const RouteTabBar &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._route, self._initial, self._tabs, self._mode, self._component);
  }

  Valdi::RegisteredCppGeneratedClass *RouteTabBar::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::RouteTabBar'{'route':s, 'initial':s, 'tabs':a<r:'[0]'>, 'mode':s?, 'component':s?}", []() -> Valdi::TypeReferencesVec {
      return {RouteTab::getRegisteredClass()};
    });

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
// StackPage.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  StackPage::StackPage(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StackPage::StackPage(const Valdi::StringBox &pageId, const Valdi::StringBox &route, const Valdi::Ref<Valdi::ValueMap> &params): Valdi::CppGeneratedModel(getRegisteredClass()),
  _pageId(std::move(pageId)),
  _route(std::move(route)),
  _params(std::move(params)) {
  }

  const Valdi::StringBox &StackPage::getPageId() const {
    return _pageId;
  }

  void StackPage::setPageId(const Valdi::StringBox &value) {
    _pageId = value;
  }

  void StackPage::setPageId(Valdi::StringBox &&value) {
    _pageId = std::move(value);
  }

  const Valdi::StringBox &StackPage::getRoute() const {
    return _route;
  }

  void StackPage::setRoute(const Valdi::StringBox &value) {
    _route = value;
  }

  void StackPage::setRoute(Valdi::StringBox &&value) {
    _route = std::move(value);
  }

  const Valdi::Ref<Valdi::ValueMap> &StackPage::getParams() const {
    return _params;
  }

  void StackPage::setParams(const Valdi::Ref<Valdi::ValueMap> &value) {
    _params = value;
  }

  void StackPage::setParams(Valdi::Ref<Valdi::ValueMap> &&value) {
    _params = std::move(value);
  }

  void StackPage::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StackPage &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._pageId, self._route, self._params);
  }

  void StackPage::marshall(Valdi::ExceptionTracker &exceptionTracker, const StackPage &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._pageId, self._route, self._params);
  }

  Valdi::RegisteredCppGeneratedClass *StackPage::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StackPage'{'pageId':s, 'route':s, 'params':m<s,u>}");

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
    static auto *kSchema = Valdi::CppGeneratedExportedFunctionUtils::registerFunctionSchema("c 'StartApp'{'startApp':f(b, r:'[1]', r:'[2]'): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {RouteDeclaration::getRegisteredClass(), NavigationHost::getRegisteredClass(), TokenStore::getRegisteredClass()};
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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StorageHost'{'get':f(s): r:'[0]', 'set':f(r:'[1]'): b, 'remove':f(s), 'clear':f()}", []() -> Valdi::TypeReferencesVec {
      return {StorageReadReply::getRegisteredClass(), StorageWriteRequest::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// StorageReadReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  StorageReadReply::StorageReadReply(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageReadReply::StorageReadReply(bool found, const Valdi::Ref<Valdi::ValueMap> &payload, const Valdi::StringBox &error): Valdi::CppGeneratedModel(getRegisteredClass()),
  _found(found),
  _payload(std::move(payload)),
  _error(std::move(error)) {
  }

  bool StorageReadReply::getFound() const {
    return _found;
  }

  void StorageReadReply::setFound(bool value) {
    _found = value;
  }

  const Valdi::Ref<Valdi::ValueMap> &StorageReadReply::getPayload() const {
    return _payload;
  }

  void StorageReadReply::setPayload(const Valdi::Ref<Valdi::ValueMap> &value) {
    _payload = value;
  }

  void StorageReadReply::setPayload(Valdi::Ref<Valdi::ValueMap> &&value) {
    _payload = std::move(value);
  }

  const Valdi::StringBox &StorageReadReply::getError() const {
    return _error;
  }

  void StorageReadReply::setError(const Valdi::StringBox &value) {
    _error = value;
  }

  void StorageReadReply::setError(Valdi::StringBox &&value) {
    _error = std::move(value);
  }

  void StorageReadReply::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageReadReply &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._found, self._payload, self._error);
  }

  void StorageReadReply::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageReadReply &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._found, self._payload, self._error);
  }

  Valdi::RegisteredCppGeneratedClass *StorageReadReply::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StorageReadReply'{'found':b, 'payload':m<s,u>, 'error':s}");

    return kRegisteredClass;
  }

}

//
// StorageWriteRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  StorageWriteRequest::StorageWriteRequest(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  StorageWriteRequest::StorageWriteRequest(const Valdi::StringBox &key, const Valdi::Ref<Valdi::ValueMap> &payload): Valdi::CppGeneratedModel(getRegisteredClass()),
  _key(std::move(key)),
  _payload(std::move(payload)) {
  }

  const Valdi::StringBox &StorageWriteRequest::getKey() const {
    return _key;
  }

  void StorageWriteRequest::setKey(const Valdi::StringBox &value) {
    _key = value;
  }

  void StorageWriteRequest::setKey(Valdi::StringBox &&value) {
    _key = std::move(value);
  }

  const Valdi::Ref<Valdi::ValueMap> &StorageWriteRequest::getPayload() const {
    return _payload;
  }

  void StorageWriteRequest::setPayload(const Valdi::Ref<Valdi::ValueMap> &value) {
    _payload = value;
  }

  void StorageWriteRequest::setPayload(Valdi::Ref<Valdi::ValueMap> &&value) {
    _payload = std::move(value);
  }

  void StorageWriteRequest::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, StorageWriteRequest &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._key, self._payload);
  }

  void StorageWriteRequest::marshall(Valdi::ExceptionTracker &exceptionTracker, const StorageWriteRequest &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._key, self._payload);
  }

  Valdi::RegisteredCppGeneratedClass *StorageWriteRequest::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::StorageWriteRequest'{'key':s, 'payload':m<s,u>}");

    return kRegisteredClass;
  }

}

//
// TabBarContext.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TabBarContext::TabBarContext(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TabBarContext::TabBarContext(const TabBarContext::SelectTabFn &selectTab): Valdi::CppGeneratedModel(getRegisteredClass()),
  _selectTab(std::move(selectTab)) {
  }

  const TabBarContext::SelectTabFn &TabBarContext::getSelectTab() const {
    return _selectTab;
  }

  void TabBarContext::setSelectTab(const TabBarContext::SelectTabFn &value) {
    _selectTab = value;
  }

  void TabBarContext::setSelectTab(TabBarContext::SelectTabFn &&value) {
    _selectTab = std::move(value);
  }

  void TabBarContext::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TabBarContext &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._selectTab);
  }

  void TabBarContext::marshall(Valdi::ExceptionTracker &exceptionTracker, const TabBarContext &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._selectTab);
  }

  Valdi::RegisteredCppGeneratedClass *TabBarContext::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TabBarContext'{'selectTab':f(s)}");

    return kRegisteredClass;
  }

}

//
// TabBarViewModel.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TabBarViewModel::TabBarViewModel(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TabBarViewModel::TabBarViewModel(const std::vector<RouteTab> &items, const Valdi::StringBox &selectedRoute, double safeAreaBottom): Valdi::CppGeneratedModel(getRegisteredClass()),
  _items(std::move(items)),
  _selectedRoute(std::move(selectedRoute)),
  _safeAreaBottom(safeAreaBottom) {
  }

  const std::vector<RouteTab> &TabBarViewModel::getItems() const {
    return _items;
  }

  void TabBarViewModel::setItems(const std::vector<RouteTab> &value) {
    _items = value;
  }

  void TabBarViewModel::setItems(std::vector<RouteTab> &&value) {
    _items = std::move(value);
  }

  const Valdi::StringBox &TabBarViewModel::getSelectedRoute() const {
    return _selectedRoute;
  }

  void TabBarViewModel::setSelectedRoute(const Valdi::StringBox &value) {
    _selectedRoute = value;
  }

  void TabBarViewModel::setSelectedRoute(Valdi::StringBox &&value) {
    _selectedRoute = std::move(value);
  }

  double TabBarViewModel::getSafeAreaBottom() const {
    return _safeAreaBottom;
  }

  void TabBarViewModel::setSafeAreaBottom(double value) {
    _safeAreaBottom = value;
  }

  void TabBarViewModel::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TabBarViewModel &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._items, self._selectedRoute, self._safeAreaBottom);
  }

  void TabBarViewModel::marshall(Valdi::ExceptionTracker &exceptionTracker, const TabBarViewModel &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._items, self._selectedRoute, self._safeAreaBottom);
  }

  Valdi::RegisteredCppGeneratedClass *TabBarViewModel::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TabBarViewModel'{'items':a<r:'[0]'>, 'selectedRoute':s, 'safeAreaBottom':d}", []() -> Valdi::TypeReferencesVec {
      return {RouteTab::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// TimeWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TimeWheelConfig::TimeWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TimeWheelConfig::TimeWheelConfig(const Valdi::StringBox &mode, const Valdi::StringBox &value, double minYear, double maxYear): Valdi::CppGeneratedModel(getRegisteredClass()),
  _mode(std::move(mode)),
  _value(std::move(value)),
  _minYear(minYear),
  _maxYear(maxYear) {
  }

  const Valdi::StringBox &TimeWheelConfig::getMode() const {
    return _mode;
  }

  void TimeWheelConfig::setMode(const Valdi::StringBox &value) {
    _mode = value;
  }

  void TimeWheelConfig::setMode(Valdi::StringBox &&value) {
    _mode = std::move(value);
  }

  const Valdi::StringBox &TimeWheelConfig::getValue() const {
    return _value;
  }

  void TimeWheelConfig::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void TimeWheelConfig::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  double TimeWheelConfig::getMinYear() const {
    return _minYear;
  }

  void TimeWheelConfig::setMinYear(double value) {
    _minYear = value;
  }

  double TimeWheelConfig::getMaxYear() const {
    return _maxYear;
  }

  void TimeWheelConfig::setMaxYear(double value) {
    _maxYear = value;
  }

  void TimeWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TimeWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._mode, self._value, self._minYear, self._maxYear);
  }

  void TimeWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const TimeWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._mode, self._value, self._minYear, self._maxYear);
  }

  Valdi::RegisteredCppGeneratedClass *TimeWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TimeWheelConfig'{'mode':s, 'value':s, 'minYear':d, 'maxYear':d}");

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
// TreeWheelConfig.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  TreeWheelConfig::TreeWheelConfig(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  TreeWheelConfig::TreeWheelConfig(const std::vector<WheelTreeNode> &data, const std::vector<Valdi::StringBox> &value, double columns): Valdi::CppGeneratedModel(getRegisteredClass()),
  _data(std::move(data)),
  _value(std::move(value)),
  _columns(columns) {
  }

  const std::vector<WheelTreeNode> &TreeWheelConfig::getData() const {
    return _data;
  }

  void TreeWheelConfig::setData(const std::vector<WheelTreeNode> &value) {
    _data = value;
  }

  void TreeWheelConfig::setData(std::vector<WheelTreeNode> &&value) {
    _data = std::move(value);
  }

  const std::vector<Valdi::StringBox> &TreeWheelConfig::getValue() const {
    return _value;
  }

  void TreeWheelConfig::setValue(const std::vector<Valdi::StringBox> &value) {
    _value = value;
  }

  void TreeWheelConfig::setValue(std::vector<Valdi::StringBox> &&value) {
    _value = std::move(value);
  }

  double TreeWheelConfig::getColumns() const {
    return _columns;
  }

  void TreeWheelConfig::setColumns(double value) {
    _columns = value;
  }

  void TreeWheelConfig::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, TreeWheelConfig &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._data, self._value, self._columns);
  }

  void TreeWheelConfig::marshall(Valdi::ExceptionTracker &exceptionTracker, const TreeWheelConfig &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._data, self._value, self._columns);
  }

  Valdi::RegisteredCppGeneratedClass *TreeWheelConfig::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::TreeWheelConfig'{'data':a<r:'[0]'>, 'value':a<s>, 'columns':d}", []() -> Valdi::TypeReferencesVec {
      return {WheelTreeNode::getRegisteredClass()};
    });

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
// WheelTreeNode.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_pages/app_pages.hpp"

namespace snap::valdi_modules::app_pages {

  WheelTreeNode::WheelTreeNode(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  WheelTreeNode::WheelTreeNode(const Valdi::StringBox &value, const Valdi::StringBox &label, const std::optional<std::vector<WheelTreeNode>> &children): Valdi::CppGeneratedModel(getRegisteredClass()),
  _value(std::move(value)),
  _label(std::move(label)),
  _children(std::move(children)) {
  }

  const Valdi::StringBox &WheelTreeNode::getValue() const {
    return _value;
  }

  void WheelTreeNode::setValue(const Valdi::StringBox &value) {
    _value = value;
  }

  void WheelTreeNode::setValue(Valdi::StringBox &&value) {
    _value = std::move(value);
  }

  const Valdi::StringBox &WheelTreeNode::getLabel() const {
    return _label;
  }

  void WheelTreeNode::setLabel(const Valdi::StringBox &value) {
    _label = value;
  }

  void WheelTreeNode::setLabel(Valdi::StringBox &&value) {
    _label = std::move(value);
  }

  const std::optional<std::vector<WheelTreeNode>> &WheelTreeNode::getChildren() const {
    return _children;
  }

  void WheelTreeNode::setChildren(const std::optional<std::vector<WheelTreeNode>> &value) {
    _children = value;
  }

  void WheelTreeNode::setChildren(std::optional<std::vector<WheelTreeNode>> &&value) {
    _children = std::move(value);
  }

  void WheelTreeNode::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, WheelTreeNode &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._value, self._label, self._children);
  }

  void WheelTreeNode::marshall(Valdi::ExceptionTracker &exceptionTracker, const WheelTreeNode &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._value, self._label, self._children);
  }

  Valdi::RegisteredCppGeneratedClass *WheelTreeNode::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_pages::WheelTreeNode'{'value':s, 'label':s, 'children':a?<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {WheelTreeNode::getRegisteredClass()};
    });

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

