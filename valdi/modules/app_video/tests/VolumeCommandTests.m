#import <Foundation/Foundation.h>
#import <dispatch/dispatch.h>
#import <math.h>

static char MainQueueKey;

// Compile the production command and its actual main-queue perform: wrapper.
// Only the AVPlayer/session and Valdi promise boundary are substituted.
@interface SCValdiUndefinedValue : NSObject
+ (instancetype)undefined;
@end
@implementation SCValdiUndefinedValue
+ (instancetype)undefined { return [self new]; }
@end

@interface SCValdiPromise<__covariant T> : NSObject
@end
@implementation SCValdiPromise
@end

@interface SCValdiResolvablePromise<T> : SCValdiPromise<T>
@property (nonatomic) dispatch_semaphore_t settled;
@property (nonatomic) NSError *error;
@property (nonatomic) BOOL succeeded;
- (void)fulfillWithError:(NSError *)error;
- (void)fulfillWithSuccessValue:(T)value;
@end
@implementation SCValdiResolvablePromise
- (instancetype)init {
    if ((self = [super init])) _settled = dispatch_semaphore_create(0);
    return self;
}
- (void)fulfillWithError:(NSError *)error { self.error = error; dispatch_semaphore_signal(self.settled); }
- (void)fulfillWithSuccessValue:(id)value { self.succeeded = YES; dispatch_semaphore_signal(self.settled); }
@end

@interface TestPlayer : NSObject
@property (nonatomic) float volume;
@property (nonatomic) NSUInteger writes;
@end
@implementation TestPlayer
- (void)setVolume:(float)volume {
    NSCAssert(dispatch_get_specific(&MainQueueKey) != NULL, @"Volume must be applied on main queue");
    _volume = volume;
    _writes++;
}
@end

@interface VRVideoSession : NSObject
@property (nonatomic) BOOL released;
@property (nonatomic) BOOL disposed;
@property (nonatomic) TestPlayer *player;
@property (nonatomic) NSUInteger events;
- (void)emitState;
@end
@implementation VRVideoSession
- (void)emitState { self.events++; }
@end

@interface VRVideoPlayerObject : NSObject
@property (nonatomic) VRVideoSession *session;
- (SCValdiPromise<SCValdiUndefinedValue *> *)perform:
    (void (^)(VRVideoSession *, SCValdiResolvablePromise<SCValdiUndefinedValue *> *))operation;
- (SCValdiPromise<SCValdiUndefinedValue *> *)setVolumeWithVolume:(double)volume;
@end

/* PRODUCTION_ERROR */
@implementation VRVideoPlayerObject
/* PRODUCTION_PERFORM */
/* PRODUCTION_SET_VOLUME */
@end

static void Check(VRVideoPlayerObject *object, double value, BOOL succeeds) {
    float previous = object.session.player.volume;
    NSUInteger writes = object.session.player.writes, events = object.session.events;
    SCValdiResolvablePromise *promise = (id)[object setVolumeWithVolume:value];
    NSCAssert(dispatch_semaphore_wait(promise.settled,
        dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC)) == 0, @"Promise did not settle");
    NSCAssert(promise.succeeded == succeeds && (promise.error != nil) == !succeeds,
        @"Unexpected setVolume(%g) outcome: %@", value, promise.error);
    NSCAssert(object.session.player.writes == writes + succeeds, @"Rejected input changed the player");
    NSCAssert(object.session.events == events + succeeds, @"Rejected input emitted state");
    NSCAssert(object.session.player.volume == (succeeds ? (float)value : previous), @"Incorrect volume");
}

int main(void) {
    dispatch_queue_set_specific(dispatch_get_main_queue(), &MainQueueKey, &MainQueueKey, NULL);
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_DEFAULT, 0), ^{
        @autoreleasepool {
            VRVideoPlayerObject *object = [VRVideoPlayerObject new];
            object.session = [VRVideoSession new];
            object.session.player = [TestPlayer new];
            for (NSNumber *value in @[@0, @0.25, @1, @(-0.0)]) Check(object, value.doubleValue, YES);
            double invalid[] = { -0.01, 1.01, -DBL_MIN, nextafter(1, INFINITY),
                                 NAN, INFINITY, -INFINITY, DBL_MAX };
            for (NSUInteger i = 0; i < sizeof(invalid) / sizeof(*invalid); i++) Check(object, invalid[i], NO);
            object.session.released = YES;
            Check(object, 0.5, NO);
            object.session.released = NO;
            object.session.disposed = YES;
            Check(object, 0.5, NO);
            puts("PASS iOS production setVolume: valid bounds, invalid inputs, no rejected mutation/event, released guards");
            exit(0);
        }
    });
    dispatch_main();
}
