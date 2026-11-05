//
// VideoHost.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  class VideoHostProxy: public VideoHost {
    public:
    using GetDemoSourceFn = Valdi::Function<Valdi::StringBox()>;
    using CreateFn = Valdi::Function<Valdi::Future<Valdi::Ref<VideoPlayer>>(Valdi::StringBox)>;

    VideoHostProxy() = default;
    ~VideoHostProxy() override = default;

    Valdi::StringBox getDemoSource() final {
      return _getDemoSource();
    }

    Valdi::Future<Valdi::Ref<VideoPlayer>> create(Valdi::StringBox source) final {
      return _create(source);
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoHostProxy> &out) {
      out = Valdi::makeShared<VideoHostProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getDemoSource, self._create);
    }

    private:
    GetDemoSourceFn _getDemoSource;
    CreateFn _create;
  };

  VideoHost::VideoHost(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VideoHost::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoHost> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VideoHostProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VideoHost::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VideoHost> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VideoHost, &VideoHost::getDemoSource>(value), Valdi::CppMarshaller::methodToFunction<VideoHost, &VideoHost::create>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VideoHost::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_video::VideoHost'{'getDemoSource':f|m|(): s, 'create':f|m|(s): p<r:'[0]'>}", []() -> Valdi::TypeReferencesVec {
      return {VideoPlayer::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VideoModule.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  class VideoModuleProxy: public VideoModule {
    public:
    using GetHostFn = Valdi::Function<Valdi::Ref<VideoHost>()>;

    VideoModuleProxy() = default;
    ~VideoModuleProxy() override = default;

    Valdi::Ref<VideoHost> getHost() final {
      return _getHost();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoModuleProxy> &out) {
      out = Valdi::makeShared<VideoModuleProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getHost);
    }

    private:
    GetHostFn _getHost;
  };

  VideoModule::VideoModule(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VideoModule::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoModule> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VideoModuleProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VideoModule::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VideoModule> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VideoModule, &VideoModule::getHost>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VideoModule::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_video::VideoModule'{'getHost':f|m|(): r:'[0]'}", []() -> Valdi::TypeReferencesVec {
      return {VideoHost::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VideoModuleFactory.cpp
//

#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  VideoModuleFactory::VideoModuleFactory() = default;
  VideoModuleFactory::~VideoModuleFactory() = default;

  Valdi::StringBox VideoModuleFactory::getModulePath() {
    return Valdi::StringBox::fromCString("app_video/src/Video");
  }
}

//
// VideoPlayer.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  class VideoPlayerProxy: public VideoPlayer {
    public:
    using GetSourceFn = Valdi::Function<Valdi::StringBox()>;
    using PlayFn = Valdi::Function<Valdi::Future<void>()>;
    using PauseFn = Valdi::Function<Valdi::Future<void>()>;
    using SetPlaybackRateFn = Valdi::Function<Valdi::Future<void>(double)>;
    using SeekToFn = Valdi::Function<Valdi::Future<void>(double)>;
    using SetVolumeFn = Valdi::Function<Valdi::Future<void>(double)>;
    using SetPageVisibleFn = Valdi::Function<Valdi::Future<void>(bool)>;
    using EnterFullscreenFn = Valdi::Function<Valdi::Future<void>()>;
    using ExitFullscreenFn = Valdi::Function<Valdi::Future<void>()>;
    using EnterPictureInPictureFn = Valdi::Function<Valdi::Future<void>()>;
    using GetStateFn = Valdi::Function<Valdi::Future<VideoState>()>;
    using SubscribeFn = Valdi::Function<Valdi::Future<Valdi::Ref<VideoSubscription>>(SubscribeListenerFn)>;
    using ReleaseFn = Valdi::Function<Valdi::Future<void>()>;

    VideoPlayerProxy() = default;
    ~VideoPlayerProxy() override = default;

    Valdi::StringBox getSource() final {
      return _getSource();
    }

    Valdi::Future<void> play() final {
      return _play();
    }

    Valdi::Future<void> pause() final {
      return _pause();
    }

    Valdi::Future<void> setPlaybackRate(double rate) final {
      return _setPlaybackRate(rate);
    }

    Valdi::Future<void> seekTo(double timeMs) final {
      return _seekTo(timeMs);
    }

    Valdi::Future<void> setVolume(double volume) final {
      return _setVolume(volume);
    }

    Valdi::Future<void> setPageVisible(bool visible) final {
      return _setPageVisible(visible);
    }

    Valdi::Future<void> enterFullscreen() final {
      return _enterFullscreen();
    }

    Valdi::Future<void> exitFullscreen() final {
      return _exitFullscreen();
    }

    Valdi::Future<void> enterPictureInPicture() final {
      return _enterPictureInPicture();
    }

    Valdi::Future<VideoState> getState() final {
      return _getState();
    }

    Valdi::Future<Valdi::Ref<VideoSubscription>> subscribe(SubscribeListenerFn listener) final {
      return _subscribe(listener);
    }

    Valdi::Future<void> release() final {
      return _release();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoPlayerProxy> &out) {
      out = Valdi::makeShared<VideoPlayerProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._getSource, self._play, self._pause, self._setPlaybackRate, self._seekTo, self._setVolume, self._setPageVisible, self._enterFullscreen, self._exitFullscreen, self._enterPictureInPicture, self._getState, self._subscribe, self._release);
    }

    private:
    GetSourceFn _getSource;
    PlayFn _play;
    PauseFn _pause;
    SetPlaybackRateFn _setPlaybackRate;
    SeekToFn _seekTo;
    SetVolumeFn _setVolume;
    SetPageVisibleFn _setPageVisible;
    EnterFullscreenFn _enterFullscreen;
    ExitFullscreenFn _exitFullscreen;
    EnterPictureInPictureFn _enterPictureInPicture;
    GetStateFn _getState;
    SubscribeFn _subscribe;
    ReleaseFn _release;
  };

  VideoPlayer::VideoPlayer(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VideoPlayer::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoPlayer> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VideoPlayerProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VideoPlayer::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VideoPlayer> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::getSource>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::play>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::pause>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::setPlaybackRate>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::seekTo>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::setVolume>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::setPageVisible>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::enterFullscreen>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::exitFullscreen>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::enterPictureInPicture>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::getState>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::subscribe>(value), Valdi::CppMarshaller::methodToFunction<VideoPlayer, &VideoPlayer::release>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VideoPlayer::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_video::VideoPlayer'{'getSource':f|m|(): s, 'play':f|m|(): p<v>, 'pause':f|m|(): p<v>, 'setPlaybackRate':f|m|(d): p<v>, 'seekTo':f|m|(d): p<v>, 'setVolume':f|m|(d): p<v>, 'setPageVisible':f|m|(b): p<v>, 'enterFullscreen':f|m|(): p<v>, 'exitFullscreen':f|m|(): p<v>, 'enterPictureInPicture':f|m|(): p<v>, 'getState':f|m|(): p<r:'[0]'>, 'subscribe':f|m|(f(r:'[0]')): p<r:'[1]'>, 'release':f|m|(): p<v>}", []() -> Valdi::TypeReferencesVec {
      return {VideoState::getRegisteredClass(), VideoSubscription::getRegisteredClass()};
    });

    return kRegisteredClass;
  }

}

//
// VideoState.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  VideoState::VideoState(): Valdi::CppGeneratedModel(getRegisteredClass()) {
  }

  VideoState::VideoState(double currentTimeMs, double durationMs, bool playing, bool requestedPlayback, const Valdi::StringBox &mode, bool supportsPictureInPicture, const Valdi::StringBox &error, bool loaded, bool ended, double volume, double playbackRate, double sequence): Valdi::CppGeneratedModel(getRegisteredClass()),
  _currentTimeMs(currentTimeMs),
  _durationMs(durationMs),
  _playing(playing),
  _requestedPlayback(requestedPlayback),
  _mode(std::move(mode)),
  _supportsPictureInPicture(supportsPictureInPicture),
  _error(std::move(error)),
  _loaded(loaded),
  _ended(ended),
  _volume(volume),
  _playbackRate(playbackRate),
  _sequence(sequence) {
  }

  double VideoState::getCurrentTimeMs() const {
    return _currentTimeMs;
  }

  void VideoState::setCurrentTimeMs(double value) {
    _currentTimeMs = value;
  }

  double VideoState::getDurationMs() const {
    return _durationMs;
  }

  void VideoState::setDurationMs(double value) {
    _durationMs = value;
  }

  bool VideoState::getPlaying() const {
    return _playing;
  }

  void VideoState::setPlaying(bool value) {
    _playing = value;
  }

  bool VideoState::getRequestedPlayback() const {
    return _requestedPlayback;
  }

  void VideoState::setRequestedPlayback(bool value) {
    _requestedPlayback = value;
  }

  const Valdi::StringBox &VideoState::getMode() const {
    return _mode;
  }

  void VideoState::setMode(const Valdi::StringBox &value) {
    _mode = value;
  }

  void VideoState::setMode(Valdi::StringBox &&value) {
    _mode = std::move(value);
  }

  bool VideoState::getSupportsPictureInPicture() const {
    return _supportsPictureInPicture;
  }

  void VideoState::setSupportsPictureInPicture(bool value) {
    _supportsPictureInPicture = value;
  }

  const Valdi::StringBox &VideoState::getError() const {
    return _error;
  }

  void VideoState::setError(const Valdi::StringBox &value) {
    _error = value;
  }

  void VideoState::setError(Valdi::StringBox &&value) {
    _error = std::move(value);
  }

  bool VideoState::getLoaded() const {
    return _loaded;
  }

  void VideoState::setLoaded(bool value) {
    _loaded = value;
  }

  bool VideoState::getEnded() const {
    return _ended;
  }

  void VideoState::setEnded(bool value) {
    _ended = value;
  }

  double VideoState::getVolume() const {
    return _volume;
  }

  void VideoState::setVolume(double value) {
    _volume = value;
  }

  double VideoState::getPlaybackRate() const {
    return _playbackRate;
  }

  void VideoState::setPlaybackRate(double value) {
    _playbackRate = value;
  }

  double VideoState::getSequence() const {
    return _sequence;
  }

  void VideoState::setSequence(double value) {
    _sequence = value;
  }

  void VideoState::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, VideoState &out) {
    auto &self = out;
    Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._currentTimeMs, self._durationMs, self._playing, self._requestedPlayback, self._mode, self._supportsPictureInPicture, self._error, self._loaded, self._ended, self._volume, self._playbackRate, self._sequence);
  }

  void VideoState::marshall(Valdi::ExceptionTracker &exceptionTracker, const VideoState &value, Valdi::Value &out) {
    const auto &self = value;
    Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, self._currentTimeMs, self._durationMs, self._playing, self._requestedPlayback, self._mode, self._supportsPictureInPicture, self._error, self._loaded, self._ended, self._volume, self._playbackRate, self._sequence);
  }

  Valdi::RegisteredCppGeneratedClass *VideoState::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c 'snap::valdi_modules::app_video::VideoState'{'currentTimeMs':d, 'durationMs':d, 'playing':b, 'requestedPlayback':b, 'mode':s, 'supportsPictureInPicture':b, 'error':s, 'loaded':b, 'ended':b, 'volume':d, 'playbackRate':d, 'sequence':d}");

    return kRegisteredClass;
  }

}

//
// VideoSubscription.cpp
//

#include "valdi_core/cpp/Marshalling/CppMarshaller.hpp"
#include "valdi_modules/app_video/app_video.hpp"

namespace snap::valdi_modules::app_video {

  class VideoSubscriptionProxy: public VideoSubscription {
    public:
    using UnsubscribeFn = Valdi::Function<Valdi::Future<void>()>;

    VideoSubscriptionProxy() = default;
    ~VideoSubscriptionProxy() override = default;

    Valdi::Future<void> unsubscribe() final {
      return _unsubscribe();
    }

    static void unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoSubscriptionProxy> &out) {
      out = Valdi::makeShared<VideoSubscriptionProxy>();
      auto &self = *out;
      Valdi::CppMarshaller::unmarshallTypedObject(exceptionTracker, *getRegisteredClass(), value, self._unsubscribe);
    }

    private:
    UnsubscribeFn _unsubscribe;
  };

  VideoSubscription::VideoSubscription(): Valdi::CppGeneratedInterface(getRegisteredClass()) {
  }

  void VideoSubscription::unmarshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Value &value, Valdi::Ref<VideoSubscription> &out) {
    Valdi::CppMarshaller::unmarshallProxyObject<VideoSubscriptionProxy>(exceptionTracker, *getRegisteredClass(), value, out);
  }

  void VideoSubscription::marshall(Valdi::ExceptionTracker &exceptionTracker, const Valdi::Ref<VideoSubscription> &value, Valdi::Value &out) {
    Valdi::CppMarshaller::marshallProxyObject(exceptionTracker, *getRegisteredClass(), *value, out, [&]() {
      Valdi::CppMarshaller::marshallTypedObject(exceptionTracker, *getRegisteredClass(), out, Valdi::CppMarshaller::methodToFunction<VideoSubscription, &VideoSubscription::unsubscribe>(value));
    });
  }

  Valdi::RegisteredCppGeneratedClass *VideoSubscription::getRegisteredClass() {
    static auto *kRegisteredClass = Valdi::CppGeneratedClass::registerSchema("c+ 'snap::valdi_modules::app_video::VideoSubscription'{'unsubscribe':f|m|(): p<v>}");

    return kRegisteredClass;
  }

}

