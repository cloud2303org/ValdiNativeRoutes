#import "VRVideoService.h"
#import "VRVideoSource.h"
#import <AVFoundation/AVFoundation.h>
#import <AVKit/AVKit.h>
#import <UIKit/UIKit.h>
#import <ValdiRuntime/SCValdiResolvablePromise.h>
#import <ValdiRuntime/SCValdiUndefinedValue.h>
#import <ValdiRuntime/SCValdiFunction.h>
#import <math.h>

static NSString *const VRVideoRegistrationKey = @"io.valdiroutes.video.registration";
static void *VRVideoItemStatusContext = &VRVideoItemStatusContext;
static void *VRVideoItemDurationContext = &VRVideoItemDurationContext;
static void *VRVideoTimeControlContext = &VRVideoTimeControlContext;
static void *VRVideoVolumeContext = &VRVideoVolumeContext;
static void *VRVideoDefaultRateContext = &VRVideoDefaultRateContext;
static void *VRVideoPiPPossibleContext = &VRVideoPiPPossibleContext;

static NSError *VRVideoError(NSString *message) {
    return [NSError errorWithDomain:@"AppVideo" code:1
                          userInfo:@{NSLocalizedDescriptionKey: message ?: @"Video operation failed"}];
}

static void VRVideoMain(dispatch_block_t block) {
    if (NSThread.isMainThread) block();
    else dispatch_async(dispatch_get_main_queue(), block);
}

/// Indefinite/live durations and invalid timestamps have no finite millisecond value.
static double VRVideoMilliseconds(CMTime time) {
    double seconds = CMTimeGetSeconds(time);
    return isfinite(seconds) && seconds >= 0 ? seconds * 1000.0 : 0;
}

static void VRVideoCallback(id<SCValdiFunction> callback, NSArray *arguments) {
    if (!callback) return;
    SCValdiMarshallerScoped(marshaller, {
        for (id argument in arguments) {
            if ([argument isKindOfClass:NSString.class]) SCValdiMarshallerPushString(marshaller, argument);
            else SCValdiMarshallerPushDouble(marshaller, [argument doubleValue]);
        }
        SCValdiFunctionSafePerform(callback, marshaller);
    });
}

static VRVideoState *VRVideoCopyState(VRVideoState *state) {
    // SCValdiMarshallableObject.copy returns self. Use a fresh generated model so one
    // listener cannot mutate the queued snapshot or the payload sent to another listener.
    return [[VRVideoState alloc] initWithCurrentTimeMs:state.currentTimeMs durationMs:state.durationMs
        playing:state.playing requestedPlayback:state.requestedPlayback mode:state.mode
        supportsPictureInPicture:state.supportsPictureInPicture error:state.error
        loaded:state.loaded ended:state.ended volume:state.volume
        playbackRate:state.playbackRate sequence:state.sequence];
}

@class VRVideoSession;
@class VRVideoListener;

/// Separate from SCValdiVideoPlayer: surface attribute resets must never issue object commands.
@interface VRVideoPlayerObject : NSObject <VRVideoPlayer>
@property (nonatomic, strong) VRVideoSession *session;
- (instancetype)initWithSession:(VRVideoSession *)session;
/// Generated releaseObject selector implements TypeScript release() without an ARC collision.
- (SCValdiPromise<SCValdiUndefinedValue *> *)releaseObject;
@end

@interface VRVideoListener : NSObject <VRVideoSubscription>
@property (nonatomic, weak) VRVideoSession *session;
@property (nonatomic, copy) VRVideoPlayerSubscribeListenerBlock callback;
@end

@interface VRVideoEvent : NSObject
@property (nonatomic, strong) VRVideoState *state;
@property (nonatomic, copy) NSArray<VRVideoListener *> *listeners;
@end

@implementation VRVideoEvent
@end

@interface VRVideoSurface : UIView
@property (nonatomic, weak) VRVideoSession *session;
@property (nonatomic, readonly) AVPlayerLayer *playerLayer;
@end

/// A request token survives cancellation before its main-queue attachment has run.
/// Its block is always consumed on main; setting cancelled is safe from Valdi's worker queue.
@interface VRVideoLoad : NSObject <SCValdiCancelable>
@property (atomic) BOOL cancelled;
@property (nonatomic, copy) dispatch_block_t onCancel;
@end

@implementation VRVideoLoad
- (void)cancel {
    self.cancelled = YES;
    VRVideoMain(^{
        dispatch_block_t block = self.onCancel;
        self.onCancel = nil;
        if (block) block();
    });
}
@end

/// Compose AVPlayerViewController rather than subclassing it. Its native transport controls use
/// the session's existing player. The outer fullscreen modal owns dismissal and an explicit Done.
@interface VRVideoFullscreenController : UIViewController
@property (nonatomic, strong, readonly) AVPlayerViewController *playbackController;
@property (nonatomic, copy) dispatch_block_t onDismiss;
- (instancetype)initWithPlayer:(AVPlayer *)player;
@end

@implementation VRVideoFullscreenController
- (instancetype)initWithPlayer:(AVPlayer *)player {
    self = [super initWithNibName:nil bundle:nil];
    if (self) {
        _playbackController = [AVPlayerViewController new];
        _playbackController.player = player;
        _playbackController.allowsPictureInPicturePlayback = NO;
        self.modalPresentationStyle = UIModalPresentationFullScreen;
    }
    return self;
}
- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    [self addChildViewController:self.playbackController];
    self.playbackController.view.frame = self.view.bounds;
    self.playbackController.view.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    [self.view addSubview:self.playbackController.view];
    [self.playbackController didMoveToParentViewController:self];
    UIButton *done = [UIButton buttonWithType:UIButtonTypeSystem];
    [done setTitle:NSLocalizedString(@"Done", nil) forState:UIControlStateNormal];
    [done setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    done.backgroundColor = [UIColor.blackColor colorWithAlphaComponent:0.65];
    done.layer.cornerRadius = 8;
    done.translatesAutoresizingMaskIntoConstraints = NO;
    [done addTarget:self action:@selector(close) forControlEvents:UIControlEventTouchUpInside];
    [self.view addSubview:done];
    [NSLayoutConstraint activateConstraints:@[
        [done.leadingAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.leadingAnchor constant:16],
        [done.topAnchor constraintEqualToAnchor:self.view.safeAreaLayoutGuide.topAnchor constant:8],
        [done.widthAnchor constraintGreaterThanOrEqualToConstant:64],
        [done.heightAnchor constraintEqualToConstant:44],
    ]];
}
- (void)close { [self dismissViewControllerAnimated:YES completion:self.onDismiss]; }
- (void)viewDidDisappear:(BOOL)animated {
    [super viewDidDisappear:animated];
    if (!self.presentingViewController || self.isBeingDismissed) {
        if (self.onDismiss) self.onDismiss();
    }
}
@end

@interface VRVideoService ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, VRVideoSession *> *sessions;
@property (nonatomic) BOOL background;
@property (nonatomic) BOOL audioActive;
@property (nonatomic) BOOL audioInterrupted;
- (BOOL)activateAudio:(NSError **)error;
- (void)updateAudio;
- (void)forgetSession:(VRVideoSession *)session;
@end

@interface VRVideoSession : NSObject <SCValdiVideoPlayer, AVPictureInPictureControllerDelegate,
    UIAdaptivePresentationControllerDelegate>
@property (nonatomic, copy, readonly) NSString *identifier;
@property (nonatomic, weak) VRVideoService *service;
@property (nonatomic, strong) AVURLAsset *asset;
@property (nonatomic, strong) AVPlayerItem *item;
@property (nonatomic, strong) AVPlayer *player;
@property (nonatomic, strong) VRVideoSurface *surface;
@property (nonatomic, strong) VRVideoFullscreenController *fullscreen;
@property (nonatomic, strong) AVPictureInPictureController *pip;
@property (nonatomic, weak) UIWindowScene *windowScene;
@property (nonatomic, strong) id periodicObserver;
@property (nonatomic, copy) NSArray<id> *notifications;
@property (nonatomic, strong) VRVideoLoad *assetLoad;
@property (nonatomic) BOOL observing;
@property (nonatomic) BOOL observingPiP;
@property (nonatomic) BOOL pageVisible;
@property (nonatomic) BOOL released;
@property (nonatomic) BOOL disposed;
@property (nonatomic) BOOL inlineAttached;
@property (nonatomic) BOOL pipStarting;
@property (nonatomic) BOOL pipStartIssued;
@property (nonatomic) BOOL restoring;
@property (nonatomic) BOOL fullscreenTransition;
@property (nonatomic) BOOL beganPlaying;
@property (nonatomic) BOOL loadedSent;
@property (nonatomic) BOOL ended;
@property (nonatomic) CMTime endedAtTime;
@property (nonatomic) BOOL playbackFailed;
@property (nonatomic) BOOL backgroundSuspended;
@property (nonatomic) BOOL audioSuspended;
@property (atomic) BOOL applyingRate;
@property (nonatomic) float requestedRate;
@property (nonatomic, readonly) float preferredRate;
@property (nonatomic) double sequence;
@property (nonatomic, strong) NSMutableArray<VRVideoListener *> *listeners;
@property (nonatomic, strong) NSMutableArray<VRVideoEvent *> *events;
@property (nonatomic) BOOL deliveringEvents;
@property (nonatomic) BOOL eventDeliveryScheduled;
@property (nonatomic) BOOL liveEdgeRateLimited;
@property (nonatomic) double pendingSeekMs;
@property (nonatomic) BOOL hasPendingSeek;
@property (nonatomic, copy) NSString *lastError;
@property (nonatomic, strong) SCValdiResolvablePromise<SCValdiUndefinedValue *> *pipPromise;
@property (nonatomic, copy) void (^restoreCompletion)(BOOL);
@property (nonatomic, strong) NSMutableArray<SCValdiResolvablePromise<SCValdiUndefinedValue *> *> *fullscreenWaiters;
@property (nonatomic, strong) id<SCValdiFunction> loadedCallback;
@property (nonatomic, strong) id<SCValdiFunction> beginCallback;
@property (nonatomic, strong) id<SCValdiFunction> errorCallback;
@property (nonatomic, strong) id<SCValdiFunction> completedCallback;
@property (nonatomic, strong) id<SCValdiFunction> progressCallback;
- (instancetype)initWithURL:(NSURL *)url service:(VRVideoService *)service;
- (void)reconcile;
- (void)surfaceAttached:(BOOL)attached;
- (void)fail:(NSError *)error;
- (void)clearCallbacks;
- (void)releaseFromPage;
- (void)dispose;
- (VRVideoState *)state;
- (void)enterFullscreen:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise;
- (void)exitFullscreen:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise;
- (void)enterPiP:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise;
- (void)restoreIfNeeded;
- (void)rateChanged:(float)rate reason:(AVPlayerRateDidChangeReason)reason internal:(BOOL)internal;
- (void)emitState;
- (void)enqueueStateForListeners:(NSArray<VRVideoListener *> *)listeners;
- (void)scheduleEventDelivery;
- (void)deliverEvents;
- (void)clearListeners;
- (void)updatePreferredRate:(float)rate;
- (void)setRequestedPlaybackRate:(float)rate;
- (void)seekToMilliseconds:(double)milliseconds;
@end

@implementation VRVideoListener
- (SCValdiPromise<SCValdiUndefinedValue *> *)unsubscribe {
    SCValdiResolvablePromise<SCValdiUndefinedValue *> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        self.callback = nil;
        [self.session.listeners removeObjectIdenticalTo:self];
        self.session = nil;
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    });
    return promise;
}
@end

@implementation VRVideoPlayerObject
- (instancetype)initWithSession:(VRVideoSession *)session {
    self = [super init];
    if (self) _session = session;
    return self;
}
- (NSString *)getSource { return [@"valdi-video://" stringByAppendingString:self.session.identifier]; }
- (SCValdiPromise<SCValdiUndefinedValue *> *)perform:
    (void (^)(VRVideoSession *, SCValdiResolvablePromise<SCValdiUndefinedValue *> *))operation {
    SCValdiResolvablePromise<SCValdiUndefinedValue *> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        VRVideoSession *session = self.session;
        if (session.released || session.disposed) {
            [promise fulfillWithError:VRVideoError(@"Video session has been released")];
            return;
        }
        operation(session, promise);
    });
    return promise;
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)play {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        [session setRequestedPlaybackRate:session.preferredRate];
        if (session.playbackFailed) [promise fulfillWithError:VRVideoError(session.lastError)];
        else [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)pause {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        [session setRequestedPlaybackRate:0];
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)setPlaybackRateWithRate:(double)rate {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        if (!isfinite(rate) || rate <= 0 || !isfinite((float)rate) || (float)rate <= 0) {
            [promise fulfillWithError:VRVideoError(@"Preferred playback rate must be finite and positive")];
            return;
        }
        [session updatePreferredRate:(float)rate];
        session.liveEdgeRateLimited = NO;
        [session reconcile];
        if (session.playbackFailed) [promise fulfillWithError:VRVideoError(session.lastError)];
        else [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)seekToWithTimeMs:(double)timeMs {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        if (!isfinite(timeMs) || timeMs < 0) {
            [promise fulfillWithError:VRVideoError(@"Seek time must be finite nonnegative milliseconds")];
            return;
        }
        [session seekToMilliseconds:timeMs];
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)setVolumeWithVolume:(double)volume {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        if (!isfinite(volume) || volume < 0 || volume > 1) {
            [promise fulfillWithError:VRVideoError(@"Volume must be finite and between zero and one")];
            return;
        }
        session.player.volume = (float)volume;
        [session emitState];
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)setPageVisibleWithVisible:(BOOL)visible {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        session.pageVisible = visible;
        [session reconcile];
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)enterFullscreen {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        [session enterFullscreen:promise];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)exitFullscreen {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        [session exitFullscreen:promise];
    }];
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)enterPictureInPicture {
    return [self perform:^(VRVideoSession *session, SCValdiResolvablePromise *promise) {
        [session enterPiP:promise];
    }];
}
- (SCValdiPromise<VRVideoState *> *)getState {
    SCValdiResolvablePromise<VRVideoState *> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.session.released || self.session.disposed)
            [promise fulfillWithError:VRVideoError(@"Video session has been released")];
        else [promise fulfillWithSuccessValue:[self.session state]];
    });
    return promise;
}
- (SCValdiPromise<id<VRVideoSubscription>> *)subscribeWithListener:(VRVideoPlayerSubscribeListenerBlock)listener {
    SCValdiResolvablePromise<id<VRVideoSubscription>> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        VRVideoSession *session = self.session;
        if (session.released || session.disposed) {
            [promise fulfillWithError:VRVideoError(@"Video session has been released")];
            return;
        }
        VRVideoListener *subscription = [VRVideoListener new];
        subscription.session = session;
        subscription.callback = listener;
        [session.listeners addObject:subscription];
        [session enqueueStateForListeners:@[subscription]];
        [promise fulfillWithSuccessValue:subscription];
    });
    return promise;
}
- (SCValdiPromise<SCValdiUndefinedValue *> *)releaseObject {
    SCValdiResolvablePromise<SCValdiUndefinedValue *> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.session releaseFromPage];
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    });
    return promise;
}
@end

@implementation VRVideoSurface
+ (Class)layerClass { return AVPlayerLayer.class; }
- (AVPlayerLayer *)playerLayer { return (AVPlayerLayer *)self.layer; }
- (void)setContentMode:(UIViewContentMode)contentMode {
    [super setContentMode:contentMode];
    switch (contentMode) {
        case UIViewContentModeScaleToFill: self.playerLayer.videoGravity = AVLayerVideoGravityResize; break;
        case UIViewContentModeScaleAspectFill: self.playerLayer.videoGravity = AVLayerVideoGravityResizeAspectFill; break;
        default: self.playerLayer.videoGravity = AVLayerVideoGravityResizeAspect; break;
    }
}
- (void)didMoveToWindow {
    [super didMoveToWindow];
    if (self.window.windowScene) self.session.windowScene = self.window.windowScene;
    [self.session surfaceAttached:self.window != nil];
}
@end

@implementation VRVideoService
- (instancetype)init {
    self = [super init];
    if (self) {
        NSAssert(NSThread.isMainThread, @"Video service is created on main");
        _sessions = [NSMutableDictionary new];
        _background = UIApplication.sharedApplication.applicationState == UIApplicationStateBackground;
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(didBackground:)
                                                   name:UIApplicationDidEnterBackgroundNotification object:nil];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(didForeground:)
                                                   name:UIApplicationDidBecomeActiveNotification object:nil];
        [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(audioInterrupted:)
                                                   name:AVAudioSessionInterruptionNotification object:nil];
    }
    return self;
}
- (void)dealloc {
    [NSNotificationCenter.defaultCenter removeObserver:self];
    // The app owns the scope for its runtime lifetime. Session teardown is nevertheless explicit.
    for (VRVideoSession *session in _sessions.allValues) {
        VRVideoMain(^{ [session dispose]; });
    }
}
- (void)registerModules:(dispatch_block_t)registration {
    NSAssert(NSThread.isMainThread, @"Generated module registration must be on main");
    NSMutableDictionary *scope = NSThread.currentThread.threadDictionary;
    id previous = scope[VRVideoRegistrationKey];
    scope[VRVideoRegistrationKey] = self;
    @try { registration(); }
    @finally {
        if (previous) scope[VRVideoRegistrationKey] = previous;
        else [scope removeObjectForKey:VRVideoRegistrationKey];
    }
}
+ (VRVideoService *)registrationService {
    VRVideoService *service = NSThread.currentThread.threadDictionary[VRVideoRegistrationKey];
    NSAssert(NSThread.isMainThread && service != nil, @"Register video factory through the host's video scope");
    if (!service) [NSException raise:NSInternalInconsistencyException format:@"Missing video registration scope"];
    return service;
}
- (void)didBackground:(NSNotification *)notification {
    self.background = YES;
    for (VRVideoSession *session in self.sessions.allValues) [session reconcile];
}
- (void)didForeground:(NSNotification *)notification {
    self.background = NO;
    for (VRVideoSession *session in self.sessions.allValues) {
        session.backgroundSuspended = NO;
        [session restoreIfNeeded];
        [session reconcile];
    }
}
- (void)audioInterrupted:(NSNotification *)notification {
    BOOL began = [notification.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue] == AVAudioSessionInterruptionTypeBegan;
    BOOL shouldResume = [notification.userInfo[AVAudioSessionInterruptionOptionKey] unsignedIntegerValue] &
        AVAudioSessionInterruptionOptionShouldResume;
    VRVideoMain(^{
        self.audioInterrupted = began;
        if (began) {
            self.audioActive = NO;
        }
        for (VRVideoSession *session in self.sessions.allValues) {
            // Suspension is separate from the user's desired rate. If the system does not
            // permit automatic resume, keep suspended until an explicit playback command.
            if (began) session.audioSuspended = YES;
            else if (shouldResume) session.audioSuspended = NO;
            [session reconcile];
        }
    });
}
- (BOOL)activateAudio:(NSError **)error {
    if (self.audioActive) return YES;
    AVAudioSession *audio = AVAudioSession.sharedInstance;
    if (![audio setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeMoviePlayback options:0 error:error] ||
        ![audio setActive:YES error:error]) return NO;
    self.audioActive = YES;
    return YES;
}
- (void)updateAudio {
    if (!self.audioActive) return;
    for (VRVideoSession *session in self.sessions.allValues) {
        if (!session.disposed && (session.player.rate != 0 || session.pipStarting || session.pip.pictureInPictureActive)) return;
    }
    [AVAudioSession.sharedInstance setActive:NO withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];
    self.audioActive = NO;
}
- (void)forgetSession:(VRVideoSession *)session {
    [self.sessions removeObjectForKey:session.identifier];
    [self updateAudio];
}
- (SCValdiPromise<id<VRVideoPlayer>> *)createWithSource:(NSString *)source {
    SCValdiResolvablePromise<id<VRVideoPlayer>> *promise = [SCValdiResolvablePromise new];
    dispatch_async(dispatch_get_main_queue(), ^{
        NSError *error = nil;
        NSURL *url = VRVideoSourceURL(source, NSBundle.mainBundle, &error);
        if (!url) {
            [promise fulfillWithError:error];
            return;
        }
        VRVideoSession *session = [[VRVideoSession alloc] initWithURL:url service:self];
        self.sessions[session.identifier] = session;
        [promise fulfillWithSuccessValue:[[VRVideoPlayerObject alloc] initWithSession:session]];
    });
    return promise;
}
#pragma mark - Official video loader
- (NSArray<NSString *> *)supportedURLSchemes { return @[@"valdi-video"]; }
- (id)requestPayloadWithURL:(NSURL *)url error:(NSError **)error {
    if (![url.scheme.lowercaseString isEqual:@"valdi-video"] || !url.host.length ||
        url.user || url.password || url.port || url.query || url.fragment || url.path.length) {
        if (error) *error = VRVideoError(@"Expected valdi-video://<session id>");
        return nil;
    }
    return url.host;
}
- (id<SCValdiCancelable>)loadVideoWithRequestPayload:(id)payload
    parameters:(SCValdiAssetRequestParameters)parameters completion:(SCValdiVideoLoaderCompletion)completion {
    VRVideoLoad *load = [VRVideoLoad new];
    dispatch_async(dispatch_get_main_queue(), ^{
        if (load.cancelled) return;
        VRVideoSession *session = [payload isKindOfClass:NSString.class] ? self.sessions[payload] : nil;
        if (!session || session.released || session.disposed) {
            completion(nil, VRVideoError(@"Unknown or released video session"));
            return;
        }
        // One official element per id: loaded assets are stateful in Valdi.
        if (session.assetLoad || session.inlineAttached) {
            completion(nil, VRVideoError(@"Video session is already attached to a video element"));
            return;
        }
        session.assetLoad = load;
        __weak VRVideoSession *weakSession = session;
        __weak VRVideoLoad *weakLoad = load;
        load.onCancel = ^{
            VRVideoSession *current = weakSession;
            if (!current || current.assetLoad != weakLoad) return;
            current.assetLoad = nil;
            // This cancels only this element's deferred load. Host release owns decode lifetime.
            [current clearCallbacks];
            [current surfaceAttached:NO];
        };
        // Attach before AVPlayerItem is ready so official onError can receive initial decode/HLS
        // failures as well as later failures. SCValdiVideoView ignores the asset-load error string.
        // Readiness is reported separately by the official onVideoLoaded(durationMs) callback.
        if (session.item.status == AVPlayerItemStatusFailed) {
            [session fail:session.item.error ?: VRVideoError(@"Video could not be loaded")];
        }
        if (!load.cancelled) completion(session, nil);
    });
    return load;
}
@end

@implementation VRVideoSession
- (instancetype)initWithURL:(NSURL *)url service:(VRVideoService *)service {
    self = [super init];
    if (self) {
        _identifier = NSUUID.UUID.UUIDString.lowercaseString;
        _service = service;
        _lastError = @"";
        _fullscreenWaiters = [NSMutableArray new];
        _endedAtTime = kCMTimeInvalid;
        _listeners = [NSMutableArray new];
        _events = [NSMutableArray new];
        _asset = [AVURLAsset URLAssetWithURL:url options:nil];
        _item = [AVPlayerItem playerItemWithAsset:_asset];
        _player = [AVPlayer playerWithPlayerItem:_item];
        _preferredRate = _player.defaultRate;
        // Buffering suspends actual playback without resetting AVPlayer's desired rate.
        _player.automaticallyWaitsToMinimizeStalling = YES;
        _surface = [VRVideoSurface new];
        _surface.session = self;
        _surface.contentMode = UIViewContentModeScaleAspectFit;
        _surface.playerLayer.player = _player;
        _observing = YES;
        [_item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:VRVideoItemStatusContext];
        [_item addObserver:self forKeyPath:@"duration" options:NSKeyValueObservingOptionNew context:VRVideoItemDurationContext];
        [_player addObserver:self forKeyPath:@"timeControlStatus" options:NSKeyValueObservingOptionNew context:VRVideoTimeControlContext];
        [_player addObserver:self forKeyPath:@"volume" options:NSKeyValueObservingOptionNew context:VRVideoVolumeContext];
        [_player addObserver:self forKeyPath:@"defaultRate" options:NSKeyValueObservingOptionNew context:VRVideoDefaultRateContext];
        __weak VRVideoSession *weakSelf = self;
        _periodicObserver = [_player addPeriodicTimeObserverForInterval:CMTimeMake(250, 1000)
            queue:dispatch_get_main_queue() usingBlock:^(CMTime time) {
                VRVideoSession *self = weakSelf;
                if (!self || self.disposed || self.released) return;
                [self emitState];
                VRVideoCallback(self.progressCallback, @[@(VRVideoMilliseconds(time)), @(VRVideoMilliseconds(self.item.duration))]);
            }];
        NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
        id rateChange = [center addObserverForName:AVPlayerRateDidChangeNotification object:_player
            queue:nil usingBlock:^(NSNotification *notification) {
                VRVideoSession *session = weakSelf;
                if (!session) return;
                // Capture at notification delivery, before crossing to main. The notification
                // supplies the reason that rate KVO cannot distinguish (notably app background).
                AVPlayer *player = notification.object;
                float rate = player.rate;
                BOOL internal = session.applyingRate;
                AVPlayerRateDidChangeReason reason = notification.userInfo[AVPlayerRateDidChangeReasonKey];
                VRVideoMain(^{
                    if (!session.disposed && session.player == player)
                        [session rateChanged:rate reason:reason internal:internal];
                });
            }];
        id end = [center addObserverForName:AVPlayerItemDidPlayToEndTimeNotification object:_item
            queue:nil usingBlock:^(NSNotification *notification) {
                AVPlayerItem *item = notification.object;
                CMTime endedAtTime = item.currentTime;
                VRVideoMain(^{
                    VRVideoSession *self = weakSelf;
                    if (!self || self.disposed || self.item != item) return;
                    self.endedAtTime = endedAtTime;
                    self.ended = YES;
                    self.requestedRate = 0;
                    [self reconcile];
                    if (!self.released) VRVideoCallback(self.completedCallback, @[]);
                });
            }];
        id timeJump = [center addObserverForName:AVPlayerItemTimeJumpedNotification object:_item
            queue:nil usingBlock:^(NSNotification *notification) {
                AVPlayerItem *item = notification.object;
                // Capture the discontinuity at delivery, before another seek can move the item.
                CMTime destination = item.currentTime;
                VRVideoMain(^{
                    VRVideoSession *self = weakSelf;
                    if (!self || self.disposed || self.item != item) return;
                    // Only an actual native time-jump behind the position recorded at genuine
                    // completion clears EOF here. Position/progress never infers completion.
                    if (self.ended && CMTIME_IS_NUMERIC(destination) &&
                        CMTIME_IS_NUMERIC(self.endedAtTime) &&
                        CMTimeCompare(destination, kCMTimeZero) >= 0 &&
                        CMTimeCompare(destination, self.endedAtTime) < 0) {
                        self.ended = NO;
                        // A native play notification may already have arrived while EOF gated
                        // it. Resume that intent; a scrub by itself must not issue a pause/play.
                        if (self.requestedRate > 0) [self reconcile];
                        else [self emitState];
                    } else {
                        [self emitState];
                    }
                });
            }];
        id failure = [center addObserverForName:AVPlayerItemFailedToPlayToEndTimeNotification object:_item
            queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *notification) {
                [weakSelf fail:notification.userInfo[AVPlayerItemFailedToPlayToEndTimeErrorKey] ?: VRVideoError(@"Playback failed")];
            }];
        _notifications = @[rateChange, end, timeJump, failure];
        if ([AVPictureInPictureController isPictureInPictureSupported]) {
            _pip = [[AVPictureInPictureController alloc] initWithPlayerLayer:_surface.playerLayer];
            _pip.delegate = self;
            // PiP is a user action through the host, never an automatic consequence of leaving a page.
            _pip.canStartPictureInPictureAutomaticallyFromInline = NO;
            [_pip addObserver:self forKeyPath:@"pictureInPicturePossible" options:NSKeyValueObservingOptionNew
                      context:VRVideoPiPPossibleContext];
            _observingPiP = YES;
        }
    }
    return self;
}
- (CGSize)size { return self.item.presentationSize; }
- (UIView *)getView { return self.surface; }
- (void)surfaceAttached:(BOOL)attached {
    if (self.disposed) return;
    self.inlineAttached = attached;
    [self reconcile];
}
- (BOOL)mayPlay {
    if (self.disposed || self.service.audioInterrupted || self.audioSuspended) return NO;
    if (self.pip.pictureInPictureActive) return YES;
    if (self.released) return NO;
    // Waiting for PiP readiness alone is not a background-playback entitlement.
    if (self.pipStarting && self.pipStartIssued) return YES;
    return !self.service.background && !self.backgroundSuspended &&
        (self.fullscreen != nil || self.restoring || (self.pageVisible && self.inlineAttached));
}
- (void)reconcile {
    if (self.disposed) return;
    // Presentation changes keep the same player. Background suspension is handled below
    // as an internal pause, preserving the desired rate for foreground resume.
    self.applyingRate = YES;
    AVPlayer *inlinePlayer = !self.fullscreen ? self.player : nil;
    if (self.surface.playerLayer.player != inlinePlayer) self.surface.playerLayer.player = inlinePlayer;
    if (self.fullscreen && self.fullscreen.playbackController.player != self.player)
        self.fullscreen.playbackController.player = self.player;
    self.applyingRate = NO;
    BOOL shouldPlay = [self mayPlay] && self.requestedRate > 0 && !self.playbackFailed && !self.ended;
    NSError *error;
    if (shouldPlay && ![self.service activateAudio:&error]) {
        [self fail:error ?: VRVideoError(@"Could not activate playback audio")];
        return;
    }
    float appliedRate = shouldPlay ? (self.liveEdgeRateLimited ? fminf(self.requestedRate, 1.0f) : self.requestedRate) : 0;
    if (self.player.rate != appliedRate) {
        self.applyingRate = YES;
        if (shouldPlay) self.player.rate = appliedRate;
        else [self.player pause];
        self.applyingRate = NO;
    }
    [self.service updateAudio];
    [self emitState];
}
- (void)setVolume:(float)volume {
    // This object-owned session is exposed to SCValdiVideoView only as a surface.
    // _updateVideo reapplies stale/default volume, rate and seek values on every install.
    // All commands belong to VRVideoPlayerObject (or AVKit's real native controls).
}
- (void)setPlaybackRate:(float)playbackRate {
    // Ignore official surface attributes, including its default pause/reset.
}
- (void)setSeekToTime:(float)seekToTime {
    // _updateVideo sends both a stored seek and an unconditional seek-to-zero.
}
- (void)updatePreferredRate:(float)rate {
    if (!isfinite(rate) || rate <= 0) return;
    // defaultRate drives AVKit's selected speed, including changes made while paused.
    // It does not start playback; preserve the existing play/pause intent.
    _preferredRate = rate;
    if (self.requestedRate > 0) self.requestedRate = rate;
    if (self.player.defaultRate != rate) self.player.defaultRate = rate;
}
- (void)setRequestedPlaybackRate:(float)playbackRate {
    VRVideoMain(^{
        if (self.disposed || self.released) return;
        if (!isfinite(playbackRate) || playbackRate < 0) {
            [self fail:VRVideoError(@"Playback rate must be finite and nonnegative")];
            return;
        }
        self.requestedRate = playbackRate;
        self.liveEdgeRateLimited = NO; // A new explicit rate command supersedes the live-edge correction.
        self.audioSuspended = NO; // An explicit command supersedes a completed interruption's suspension.
        if (self.ended && playbackRate > 0) {
            self.ended = NO;
            [self seekToMilliseconds:0];
        }
        [self reconcile];
    });
}
- (void)seekToMilliseconds:(double)seekToTime {
    VRVideoMain(^{
        if (self.disposed || self.released) return;
        if (!isfinite(seekToTime) || seekToTime < 0) {
            [self fail:VRVideoError(@"Seek time must be finite nonnegative milliseconds")];
            return;
        }
        self.ended = NO;
        self.pendingSeekMs = seekToTime;
        self.hasPendingSeek = YES;
        [self applyPendingSeek];
        [self emitState];
    });
}
- (void)applyPendingSeek {
    if (!self.hasPendingSeek || self.disposed || self.item.status != AVPlayerItemStatusReadyToPlay) return;
    self.hasPendingSeek = NO;
    self.ended = NO;
    double seconds = self.pendingSeekMs / 1000.0;
    double duration = CMTimeGetSeconds(self.item.duration);
    if (isfinite(duration) && duration >= 0) seconds = fmin(seconds, duration);
    // For HLS live, AVPlayer resolves the requested timestamp against its seekable ranges.
    __weak VRVideoSession *weakSelf = self;
    [self.player seekToTime:CMTimeMakeWithSeconds(seconds, 1000) toleranceBefore:kCMTimeZero
        toleranceAfter:kCMTimeZero completionHandler:^(BOOL finished) {
            VRVideoMain(^{
                VRVideoSession *self = weakSelf;
                if (!self || self.disposed || self.released) return;
                if (finished) [self reconcile];
                else [self emitState];
            });
        }];
}
- (void)setOnVideoLoadedCallback:(id<SCValdiFunction>)callback {
    VRVideoMain(^{
        if (self.disposed || self.released) return;
        self.loadedCallback = callback;
        self.loadedSent = NO;
        [self emitLoaded];
    });
}
- (void)setOnBeginPlayingCallback:(id<SCValdiFunction>)callback {
    VRVideoMain(^{
        if (self.disposed || self.released) return;
        self.beginCallback = callback;
        if (self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying) VRVideoCallback(callback, @[]);
    });
}
- (void)setOnErrorCallback:(id<SCValdiFunction>)callback {
    VRVideoMain(^{
        if (self.disposed || self.released) return;
        self.errorCallback = callback;
        if (self.lastError.length) VRVideoCallback(callback, @[self.lastError]);
    });
}
- (void)setOnCompletedCallback:(id<SCValdiFunction>)callback {
    VRVideoMain(^{ if (!self.disposed && !self.released) self.completedCallback = callback; });
}
- (void)setOnProgressUpdatedCallback:(id<SCValdiFunction>)callback {
    VRVideoMain(^{ if (!self.disposed && !self.released) self.progressCallback = callback; });
}
- (void)clearCallbacks {
    self.loadedCallback = nil;
    self.beginCallback = nil;
    self.errorCallback = nil;
    self.completedCallback = nil;
    self.progressCallback = nil;
}
- (void)emitLoaded {
    if (self.released || self.disposed || self.loadedSent || !self.loadedCallback ||
        self.item.status != AVPlayerItemStatusReadyToPlay) return;
    self.loadedSent = YES;
    VRVideoCallback(self.loadedCallback, @[@(VRVideoMilliseconds(self.item.duration))]);
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
    if (context != VRVideoItemStatusContext && context != VRVideoItemDurationContext &&
        context != VRVideoTimeControlContext && context != VRVideoPiPPossibleContext &&
        context != VRVideoVolumeContext && context != VRVideoDefaultRateContext) {
        [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
        return;
    }
    // KVO may originate off main. Use the captured object's identity to reject stale work after teardown.
    VRVideoMain(^{
        if (self.disposed || (object != self.player && object != self.item && object != self.pip)) return;
        if (context == VRVideoItemStatusContext) {
            if (self.item.status == AVPlayerItemStatusFailed) [self fail:self.item.error ?: VRVideoError(@"Video item failed")];
            else if (self.item.status == AVPlayerItemStatusReadyToPlay) {
                [self applyPendingSeek];
                [self emitLoaded];
                [self reconcile];
            }
        } else if (context == VRVideoItemDurationContext) {
            [self emitLoaded];
        } else if (context == VRVideoTimeControlContext) {
            BOOL playing = self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying;
            if (playing && !self.beganPlaying && !self.released) VRVideoCallback(self.beginCallback, @[]);
            self.beganPlaying = playing;
        } else if (context == VRVideoPiPPossibleContext) {
            [self tryStartPiP];
        } else if (context == VRVideoDefaultRateContext) {
            float rate = self.player.defaultRate;
            if (isfinite(rate) && rate > 0 && rate != self.preferredRate) {
                [self updatePreferredRate:rate];
                // A new native speed selection supersedes the previous live-edge correction.
                self.liveEdgeRateLimited = NO;
                [self reconcile];
            }
        }
        [self emitState];
    });
}
- (void)rateChanged:(float)rate reason:(AVPlayerRateDidChangeReason)reason internal:(BOOL)internal {
    if (self.disposed) return;
    if (@available(iOS 26.4, *)) {
        if ([reason isEqualToString:AVPlayerRateDidChangeReasonPlayheadReachedLiveEdge]) {
            // Keep the user's requested rate separately, but retain AVPlayer's 1x live-edge
            // correction across visibility/presentation reconciliation until a new rate command.
            self.liveEdgeRateLimited = YES;
            [self reconcile];
            return;
        }
    }
    // Process system reasons even if they arrive during one of our own player operations.
    if ([reason isEqualToString:AVPlayerRateDidChangeReasonAppBackgrounded]) {
        // This notification may precede UIApplicationDidEnterBackgroundNotification.
        self.backgroundSuspended = YES;
    } else if ([reason isEqualToString:AVPlayerRateDidChangeReasonAudioSessionInterrupted]) {
        self.audioSuspended = YES;
        self.service.audioActive = NO;
    } else if ([reason isEqualToString:AVPlayerRateDidChangeReasonSetRateFailed]) {
        [self fail:self.player.error ?: VRVideoError(@"AVPlayer could not apply the playback rate")];
        return;
    } else if (internal) {
        [self emitState];
        return;
    } else if ([reason isEqualToString:AVPlayerRateDidChangeReasonSetRateCalled]) {
        if (isfinite(rate) && rate >= 0) {
            // Native controls update intent even while presentation/visibility suspends playback.
            // Native pause changes intent without losing the last positive preferred speed.
            self.requestedRate = rate;
            self.liveEdgeRateLimited = NO;
            self.audioSuspended = NO;
            // AVKit owns its scrub/replay destination. Only the native time-jump event clears
            // EOF here; a rate notification must never replace a native scrub with seek(0).
            // Actual/scanning rates also do not replace the preference in defaultRate.
        }
    } else if (rate == 0) {
        // AVPlayer can report its automatic EOF stop before DidPlayToEndTime is delivered.
        // Do not turn that stop into a play command by reapplying requestedRate. Let the
        // genuine end notification set ended, clear intent and emit onCompleted. Unknown
        // automatic stops are not native play commands, and zero already satisfies gating.
        [self.service updateAudio];
        [self emitState];
        return;
    }
    // Every external change is subject to mayPlay, including a positive rate set in background.
    // Internal writes are suppressed above so the gating pause cannot overwrite desired intent.
    [self reconcile];
}
- (void)fail:(NSError *)error {
    if (self.disposed) return;
    self.lastError = error.localizedDescription ?: @"Video playback failed";
    self.playbackFailed = YES;
    self.requestedRate = 0;
    if (!self.released) VRVideoCallback(self.errorCallback, @[self.lastError]);
    if (self.pipPromise) {
        [self.pipPromise fulfillWithError:error];
        self.pipPromise = nil;
        self.pipStarting = NO;
    }
    [self reconcile];
}
- (VRVideoState *)state {
    VRVideoMode mode = self.pip.pictureInPictureActive ? VRVideoModePictureInPicture
        : (self.fullscreen ? VRVideoModeFullscreen : VRVideoModeInline);
    return [[VRVideoState alloc] initWithCurrentTimeMs:VRVideoMilliseconds(self.player.currentTime)
        durationMs:VRVideoMilliseconds(self.item.duration)
        playing:self.player.timeControlStatus == AVPlayerTimeControlStatusPlaying
        requestedPlayback:self.requestedRate > 0 mode:mode
        supportsPictureInPicture:([AVPictureInPictureController isPictureInPictureSupported] && self.pip != nil)
        error:self.lastError loaded:self.item.status == AVPlayerItemStatusReadyToPlay
        ended:self.ended volume:self.player.volume playbackRate:self.preferredRate sequence:self.sequence];
}

#pragma mark - Typed shared native events
- (void)emitState {
    if (self.disposed || self.released) return;
    [self enqueueStateForListeners:self.listeners.copy];
}
- (void)enqueueStateForListeners:(NSArray<VRVideoListener *> *)listeners {
    if (self.disposed || self.released) return;
    self.sequence += 1;
    if (!listeners.count) return;
    VRVideoEvent *event = [VRVideoEvent new];
    event.state = [self state];
    event.listeners = listeners;
    [self.events addObject:event];
    [self scheduleEventDelivery];
}
- (void)scheduleEventDelivery {
    if (!self.events.count || self.disposed || self.released) return;
    if (self.eventDeliveryScheduled || self.deliveringEvents) return;
    self.eventDeliveryScheduled = YES;
    // Never call JS from a KVO callback or in the middle of applying a player command.
    __weak VRVideoSession *weakSelf = self;
    dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf deliverEvents]; });
}
- (void)deliverEvents {
    self.eventDeliveryScheduled = NO;
    if (self.deliveringEvents) return;
    self.deliveringEvents = YES;
    NSArray<VRVideoEvent *> *events = self.events.copy;
    [self.events removeAllObjects];
    @try {
        for (VRVideoEvent *event in events) {
            if (self.disposed || self.released) break;
            for (VRVideoListener *subscription in event.listeners) {
                if (self.disposed || self.released) break;
                VRVideoPlayerSubscribeListenerBlock callback = subscription.callback;
                if (!callback || subscription.session != self) continue;
                @try {
                    // The generated block trampoline marshals VRVideoState using its complete
                    // generated schema (including BOOL fields), and reports JS exceptions.
                    callback(VRVideoCopyState(event.state));
                } @catch (NSException *exception) {
                    // A native callback exception must not skip other independent listeners.
                    NSLog(@"AppVideo state listener raised %@", exception.name);
                }
            }
        }
    } @finally {
        self.deliveringEvents = NO;
        // Reentrant notifications form the next batch so queued unsubscribe/release commands
        // can run before more callbacks, even when a listener itself changes native state.
        [self scheduleEventDelivery];
    }
}
- (void)clearListeners {
    for (VRVideoListener *subscription in self.listeners) {
        subscription.callback = nil;
        subscription.session = nil;
    }
    [self.listeners removeAllObjects];
    [self.events removeAllObjects];
}

#pragma mark - Fullscreen with the existing decoder
- (UIViewController *)presenter {
    UIWindowScene *scene = self.surface.window.windowScene ?: self.windowScene;
    if (!scene || scene.activationState != UISceneActivationStateForegroundActive) return nil;
    UIWindow *window = self.surface.window;
    if (!window) for (UIWindow *candidate in scene.windows) if (candidate.isKeyWindow) { window = candidate; break; }
    UIViewController *controller = window.rootViewController;
    while (controller.presentedViewController && !controller.presentedViewController.isBeingDismissed)
        controller = controller.presentedViewController;
    return controller.isBeingDismissed || controller.isBeingPresented ? nil : controller;
}
- (void)enterFullscreen:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise {
    if (self.fullscreenTransition || self.pipStarting || self.pip.pictureInPictureActive) {
        [promise fulfillWithError:VRVideoError(@"Video presentation is already changing or PiP is active")];
        return;
    }
    if (self.fullscreen) {
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
        return;
    }
    UIViewController *presenter = [self presenter];
    if (!presenter || self.service.background) {
        [promise fulfillWithError:VRVideoError(@"No foreground video window can present fullscreen")];
        return;
    }
    self.fullscreenTransition = YES;
    [self.fullscreenWaiters addObject:promise];
    VRVideoFullscreenController *controller = [[VRVideoFullscreenController alloc] initWithPlayer:self.player];
    self.fullscreen = controller;
    __weak VRVideoSession *weakSelf = self;
    __weak VRVideoFullscreenController *weakController = controller;
    controller.onDismiss = ^{ [weakSelf fullscreenClosed:weakController]; };
    self.surface.playerLayer.player = nil;
    [presenter presentViewController:controller animated:YES completion:^{
        if (self.disposed || self.fullscreen != controller) return;
        controller.presentationController.delegate = self;
        self.fullscreenTransition = NO;
        [self settleFullscreen:nil];
        [self reconcile];
    }];
    if (!controller.presentingViewController) {
        [self settleFullscreen:VRVideoError(@"Fullscreen presentation was refused")];
        [self fullscreenClosed:controller];
    }
    [self reconcile];
}
- (void)settleFullscreen:(NSError *)error {
    NSArray *waiters = self.fullscreenWaiters.copy;
    [self.fullscreenWaiters removeAllObjects];
    for (SCValdiResolvablePromise *promise in waiters) {
        if (error) [promise fulfillWithError:error];
        else [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    }
}
- (void)fullscreenClosed:(VRVideoFullscreenController *)controller {
    if (!controller || self.fullscreen != controller) return;
    self.fullscreen.onDismiss = nil;
    self.fullscreen = nil;
    controller.playbackController.player = nil;
    self.fullscreenTransition = NO;
    if (!self.disposed) self.surface.playerLayer.player = self.player;
    [self settleFullscreen:nil];
    [self reconcile];
}
- (void)exitFullscreen:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise {
    if (self.fullscreenTransition) {
        [promise fulfillWithError:VRVideoError(@"Wait for the fullscreen transition to complete")];
        return;
    }
    VRVideoFullscreenController *controller = self.fullscreen;
    if (!controller) {
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
        return;
    }
    self.fullscreenTransition = YES;
    [self.fullscreenWaiters addObject:promise];
    [controller dismissViewControllerAnimated:YES completion:^{ [self fullscreenClosed:controller]; }];
}
- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController {
    if (presentationController.presentedViewController == self.fullscreen) [self fullscreenClosed:self.fullscreen];
}

#pragma mark - PiP transfers ownership until the native window actually closes
- (void)enterPiP:(SCValdiResolvablePromise<SCValdiUndefinedValue *> *)promise {
    if (![AVPictureInPictureController isPictureInPictureSupported] || !self.pip) {
        [promise fulfillWithError:VRVideoError(@"Picture in Picture is unavailable on this device")];
        return;
    }
    if (self.pip.pictureInPictureActive) {
        [promise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
        return;
    }
    if (self.pipStarting || self.fullscreenTransition) {
        [promise fulfillWithError:VRVideoError(@"Video presentation is already changing")];
        return;
    }
    if (self.fullscreen) {
        // Restore the same player's inline layer first; PiP's content source is that layer.
        SCValdiResolvablePromise *exit = [SCValdiResolvablePromise new];
        [exit onCompleteWithCallbackBlock:^(id value, NSError *error) {
            VRVideoMain(^{
                if (error || self.released || self.disposed) [promise fulfillWithError:error ?: VRVideoError(@"Video session released")];
                else [self enterPiP:promise];
            });
        }];
        [self exitFullscreen:exit];
        return;
    }
    NSError *audioError;
    if (![self.service activateAudio:&audioError]) {
        [promise fulfillWithError:audioError ?: VRVideoError(@"Could not activate PiP audio")];
        return;
    }
    if (!self.inlineAttached || self.service.background || self.playbackFailed) {
        [promise fulfillWithError:VRVideoError(@"Picture in Picture is not ready; load/play the inline video first")];
        [self.service updateAudio];
        return;
    }
    self.pipPromise = promise;
    self.pipStarting = YES;
    self.pipStartIssued = NO;
    [self tryStartPiP];
    // Some environments never deliver a start/failure delegate. Reject, never report pretend success.
    __weak VRVideoSession *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 8 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        VRVideoSession *self = weakSelf;
        if (!self || self.pipPromise != promise) return;
        self.pipPromise = nil;
        self.pipStarting = NO;
        [self.pip stopPictureInPicture];
        [promise fulfillWithError:VRVideoError(@"Picture in Picture did not start")];
        [self reconcile];
    });
}
- (void)tryStartPiP {
    if (self.disposed || self.released || !self.pipStarting || self.pipStartIssued ||
        !self.inlineAttached || !self.pip.pictureInPicturePossible || self.service.background) return;
    self.pipStartIssued = YES;
    [self.pip startPictureInPicture];
}
- (void)pictureInPictureControllerDidStartPictureInPicture:(AVPictureInPictureController *)controller {
    if (self.disposed || !self.pipStarting) {
        [controller stopPictureInPicture];
        return;
    }
    self.pipStarting = NO;
    [self.pipPromise fulfillWithSuccessValue:[SCValdiUndefinedValue undefined]];
    self.pipPromise = nil;
    [self reconcile];
}
- (void)pictureInPictureController:(AVPictureInPictureController *)controller failedToStartPictureInPictureWithError:(NSError *)error {
    self.pipStarting = NO;
    [self.pipPromise fulfillWithError:error];
    self.pipPromise = nil;
    self.lastError = error.localizedDescription;
    if (!self.released && !self.disposed) VRVideoCallback(self.errorCallback, @[self.lastError]);
    [self reconcile];
}
- (void)pictureInPictureControllerDidStopPictureInPicture:(AVPictureInPictureController *)controller {
    self.pipStarting = NO;
    if (self.released) [self dispose];
    else [self reconcile];
}
- (void)pictureInPictureController:(AVPictureInPictureController *)controller
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler:(void (^)(BOOL restored))completionHandler {
    if (self.disposed || self.released) {
        completionHandler(NO); // Never resurrect an exited TS page or its callbacks.
        return;
    }
    if (self.restoreCompletion) { completionHandler(NO); return; }
    self.restoreCompletion = completionHandler;
    self.restoring = YES;
    [self restoreIfNeeded];
    // The system can request restoration before the app/scene has become active.
    // didForeground retries the pending restore. Every path settles the system completion once.
    __weak VRVideoSession *weakSelf = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        VRVideoSession *self = weakSelf;
        if (self.restoreCompletion == completionHandler) [self finishRestore:NO];
    });
}
- (void)finishRestore:(BOOL)restored {
    void (^completion)(BOOL) = self.restoreCompletion;
    self.restoreCompletion = nil;
    self.restoring = NO;
    if (completion) {
        completion(restored);
        [self reconcile];
    }
}
- (void)restoreIfNeeded {
    if (!self.restoreCompletion || self.fullscreenTransition) return;
    if (self.disposed || self.released) { [self finishRestore:NO]; return; }
    if (self.service.background ||
        self.windowScene.activationState == UISceneActivationStateForegroundInactive) return;
    if (self.pageVisible && self.inlineAttached && !self.service.background) {
        [self finishRestore:YES];
        return;
    }
    // A covered but still-owned page can restore into native fullscreen in its original scene.
    UIViewController *presenter = [self presenter];
    if (!presenter) { [self finishRestore:NO]; return; }
    self.fullscreenTransition = YES;
    VRVideoFullscreenController *fullscreen = [[VRVideoFullscreenController alloc] initWithPlayer:self.player];
    self.fullscreen = fullscreen;
    __weak VRVideoSession *weakSelf = self;
    __weak VRVideoFullscreenController *weakFullscreen = fullscreen;
    fullscreen.onDismiss = ^{ [weakSelf fullscreenClosed:weakFullscreen]; };
    [presenter presentViewController:fullscreen animated:YES completion:^{
        self.fullscreenTransition = NO;
        fullscreen.presentationController.delegate = self;
        BOOL restored = !self.disposed && !self.released && self.restoreCompletion != nil;
        if (restored) self.surface.playerLayer.player = nil;
        [self finishRestore:restored];
        if (!restored) {
            [fullscreen dismissViewControllerAnimated:NO completion:^{ [self fullscreenClosed:fullscreen]; }];
        }
        [self reconcile];
    }];
    if (!fullscreen.presentingViewController) {
        [self finishRestore:NO];
        [self fullscreenClosed:fullscreen];
    }
}

#pragma mark - Deterministic teardown
- (void)releaseFromPage {
    if (self.disposed || self.released) return;
    self.released = YES;
    self.pageVisible = NO;
    [self clearListeners];
    [self clearCallbacks];
    [self finishRestore:NO];
    self.assetLoad.onCancel = nil;
    self.assetLoad = nil;
    // The store retains the decoder/layer/PiP delegate after the page goes away.
    // Only a window which actually started gets this transfer, not a pending request.
    if (self.pip.pictureInPictureActive) return;
    [self dispose];
}
- (void)dispose {
    if (self.disposed) return;
    self.disposed = YES;
    self.released = YES;
    [self clearListeners];
    [self finishRestore:NO];
    [self clearCallbacks];
    self.assetLoad.onCancel = nil;
    self.assetLoad = nil;
    [self.pipPromise fulfillWithError:VRVideoError(@"Video session released")];
    self.pipPromise = nil;
    [self settleFullscreen:VRVideoError(@"Video session released")];
    self.pipStarting = NO;
    if (self.observingPiP) {
        self.observingPiP = NO;
        [self.pip removeObserver:self forKeyPath:@"pictureInPicturePossible" context:VRVideoPiPPossibleContext];
    }
    self.pip.delegate = nil;
    [self.pip stopPictureInPicture];
    self.pip = nil;
    if (self.periodicObserver) {
        [self.player removeTimeObserver:self.periodicObserver];
        self.periodicObserver = nil;
    }
    if (self.observing) {
        self.observing = NO;
        [self.item removeObserver:self forKeyPath:@"status" context:VRVideoItemStatusContext];
        [self.item removeObserver:self forKeyPath:@"duration" context:VRVideoItemDurationContext];
        [self.player removeObserver:self forKeyPath:@"timeControlStatus" context:VRVideoTimeControlContext];
        [self.player removeObserver:self forKeyPath:@"volume" context:VRVideoVolumeContext];
        [self.player removeObserver:self forKeyPath:@"defaultRate" context:VRVideoDefaultRateContext];
    }
    for (id token in self.notifications) [NSNotificationCenter.defaultCenter removeObserver:token];
    self.notifications = nil;
    [self.item cancelPendingSeeks];
    [self.asset cancelLoading];
    [self.player pause];
    [self.player replaceCurrentItemWithPlayerItem:nil];
    VRVideoFullscreenController *controller = self.fullscreen;
    controller.onDismiss = nil;
    controller.playbackController.player = nil;
    controller.presentationController.delegate = nil;
    if (controller.presentingViewController) [controller dismissViewControllerAnimated:NO completion:nil];
    self.fullscreen = nil;
    self.surface.playerLayer.player = nil;
    self.surface.session = nil;
    [self.surface removeFromSuperview];
    self.player = nil;
    self.item = nil;
    self.asset = nil;
    [self.service forgetSession:self];
}
@end
