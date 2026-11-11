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

