//
// VisionDemoResult.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_vision/app_vision.hpp"

namespace snap::valdi_modules::app_vision {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_vision::VisionDemoResult'{'opencvVersion':s, 'ncnnVersion':s, 'modelName':s, 'modelDescription':s, 'processingMs':d, 'inferenceMs':d, 'width':d, 'height':d, 'inferenceWidth':d, 'inferenceHeight':d, 'edgePixelCount':d, 'inputImageUrl':s, 'edgeImageUrl':s, 'predictions':a<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {VisionPrediction::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_vision/app_vision.hpp"

namespace snap::valdi_modules::app_vision {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_vision::VisionHost'{'runDemo':f|m|(f(s, r?:'[0]'))}", []() -> Valdi::TypeReferencesVec {
      return {VisionDemoResult::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_vision/app_vision.hpp"

namespace snap::valdi_modules::app_vision {

  class VisionModuleProxy: public VisionModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<VisionHost>()>;

    VisionModuleProxy() = default;
    ~VisionModuleProxy() override = default;

    Valdi::Ref<VisionHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionModuleProxy> &out) {
      out = Valdi::makeShared<VisionModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  VisionModule::VisionModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VisionModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VisionModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VisionModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VisionModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VisionModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VisionModule, &VisionModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VisionModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_vision::VisionModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {VisionHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VisionModuleFactory.cpp
//

#include "valdi_modules/app_vision/app_vision.hpp"

namespace snap::valdi_modules::app_vision {

  VisionModuleFactory::VisionModuleFactory() = default;
  VisionModuleFactory::~VisionModuleFactory() = default;

  Valdi::StringBox VisionModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_vision/src/Vision");
  }
}

//
// VisionPrediction.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_vision/app_vision.hpp"

namespace snap::valdi_modules::app_vision {

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
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_vision::VisionPrediction'{'label':s, 'score':d}");

    return kRegisteredClass;
  }

}

