//
// ActionSheetRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ActionSheetRequest'{'title':s, 'itemList':a<s>}");

    return kRegisteredClass;
  }

}

//
// AppUIHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_ui::AppUIHost'{'showModal':f|m|(r:'[1]'): p<r:'[0]'>, 'showActionSheet':f|m|(r:'[3]'): p<r:'[2]'>, 'showPicker':f|m|(r:'[4]'): p<r:'[2]'>, 'showDatePicker':f|m|(r:'[5]'): p<r:'[2]'>, 'showBottomSheet':f|m|(r:'[6]'): p<r:'[2]'>, 'previewImage':f|m|(r:'[7]'): p<r:'[2]'>, 'scanCode':f|m|(): p<r:'[8]'>, 'pickAttachments':f|m|(s, d, a<s>): p<r:'[9]'>, 'clearAttachmentCache':f|m|(): p<v>, 'showToast':f|m|(r:'[10]'): p<v>, 'hideToast':f|m|(): p<v>, 'showLoading':f|m|(r:'[11]'): p<v>, 'hideLoading':f|m|(): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {ModalReply::getRegisteredClass(), ModalRequest::getRegisteredClass(), PresentationReply::getRegisteredClass(), ActionSheetRequest::getRegisteredClass(), PickerRequest::getRegisteredClass(), DatePickerRequest::getRegisteredClass(), BottomSheetRequest::getRegisteredClass(), ImagePreviewRequest::getRegisteredClass(), ScanCodeReply::getRegisteredClass(), AttachmentSelection::getRegisteredClass(), ToastRequest::getRegisteredClass(), LoadingRequest::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppUIModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

  class AppUIModuleProxy: public AppUIModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<AppUIHost>()>;

    AppUIModuleProxy() = default;
    ~AppUIModuleProxy() override = default;

    Valdi::Ref<AppUIHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppUIModuleProxy> &out) {
      out = Valdi::makeShared<AppUIModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  AppUIModule::AppUIModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void AppUIModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<AppUIModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<AppUIModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void AppUIModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<AppUIModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<AppUIModule, &AppUIModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *AppUIModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_ui::AppUIModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {AppUIHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// AppUIModuleFactory.cpp
//

#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

  AppUIModuleFactory::AppUIModuleFactory() = default;
  AppUIModuleFactory::~AppUIModuleFactory() = default;

  Valdi::StringBox AppUIModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_ui/src/AppUI");
  }
}

//
// AttachmentAsset.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::AttachmentAsset'{'id':s, 'uri':s, 'name':s, 'mimeType':s, 'size':d}");

    return kRegisteredClass;
  }

}

//
// AttachmentSelection.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::AttachmentSelection'{'canceled':b, 'assets':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {AttachmentAsset::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// BottomSheetRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::BottomSheetRequest'{'title':s, 'content':s, 'confirmText':s, 'cancelText':s, 'showCancel':b, 'dismissible':b}");

    return kRegisteredClass;
  }

}

//
// DatePickerRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::DatePickerRequest'{'title':s, 'mode':s, 'value':s, 'confirmText':s, 'cancelText':s, 'minYear':d, 'maxYear':d}");

    return kRegisteredClass;
  }

}

//
// ImagePreviewRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ImagePreviewRequest'{'urls':a<s>, 'current':s}");

    return kRegisteredClass;
  }

}

//
// LoadingRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::LoadingRequest'{'title':s, 'mask':b}");

    return kRegisteredClass;
  }

}

//
// ModalReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ModalReply'{'confirm':b, 'cancel':b, 'content':s}");

    return kRegisteredClass;
  }

}

//
// ModalRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ModalRequest'{'title':s, 'content':s, 'showCancel':b, 'confirmText':s, 'cancelText':s, 'editable':b, 'placeholderText':s, 'defaultText':s}");

    return kRegisteredClass;
  }

}

//
// PickerOption.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::PickerOption'{'value':s, 'label':s}");

    return kRegisteredClass;
  }

}

//
// PickerRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::PickerRequest'{'title':s, 'confirmText':s, 'cancelText':s, 'options':a<r:'[0]'>, 'value':s}", []() -> Valdi::TypeReferencesVec {
      return {PickerOption::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// PresentationReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::PresentationReply'{'confirm':b, 'cancel':b, 'value':s, 'index':d}");

    return kRegisteredClass;
  }

}

//
// ScanCodeReply.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ScanCodeReply'{'result':s, 'scanType':s}");

    return kRegisteredClass;
  }

}

//
// ToastRequest.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_ui/app_ui.hpp"

namespace snap::valdi_modules::app_ui {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_ui::ToastRequest'{'title':s, 'icon':s, 'duration':d, 'mask':b}");

    return kRegisteredClass;
  }

}

