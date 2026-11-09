//
// VRVideoMode.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "AppVideoTypes.h"

VRVideoMode VRVideoModeInline = @"inline";
VRVideoMode VRVideoModeFullscreen = @"fullscreen";
VRVideoMode VRVideoModePictureInPicture = @"pictureInPicture";
VALDI_STRING_ENUM(VRVideoMode, VRVideoModeInline, VRVideoModeFullscreen, VRVideoModePictureInPicture)
NSArray<NSString *> * _Nonnull VRVideoModeGetAllCases() {
    static dispatch_once_t onceToken;
    static NSArray<NSString *> *kAllCases;
    dispatch_once(&onceToken, ^{
        kAllCases = @[VRVideoModeInline, VRVideoModeFullscreen, VRVideoModePictureInPicture];
    });
    return kAllCases;
}

//
// VRVideoNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppVideoTypes.h"


//
// VRVideoNativeModuleFactory.m
//

#import "AppVideoTypes.h"

@implementation VRVideoNativeModuleFactory

- (id<VRVideoNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_video/src/Video";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRVideoNativeModule);
}

@end

//
// VRVideoState.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppVideoTypes.h"

@implementation VRVideoState

@dynamic currentTimeMs;
@dynamic durationMs;
@dynamic playing;
@dynamic requestedPlayback;
@dynamic mode;
@dynamic supportsPictureInPicture;
@dynamic error;
@dynamic loaded;
@dynamic ended;
@dynamic volume;
@dynamic playbackRate;
@dynamic sequence;

- (instancetype _Nonnull)initWithCurrentTimeMs:(double)currentTimeMs durationMs:(double)durationMs playing:(BOOL)playing requestedPlayback:(BOOL)requestedPlayback mode:(VRVideoMode _Nonnull)mode supportsPictureInPicture:(BOOL)supportsPictureInPicture error:(NSString * _Nonnull)error loaded:(BOOL)loaded ended:(BOOL)ended volume:(double)volume playbackRate:(double)playbackRate sequence:(double)sequence
{
    return [super initWithFieldValues:nil, currentTimeMs, durationMs, playing, requestedPlayback, mode, supportsPictureInPicture, error, loaded, ended, volume, playbackRate, sequence];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "currentTimeMs", .selName = nil, .type = "d"},
        {.name = "durationMs", .selName = nil, .type = "d"},
        {.name = "playing", .selName = nil, .type = "b"},
        {.name = "requestedPlayback", .selName = nil, .type = "b"},
        {.name = "mode", .selName = nil, .type = "r:'[0]'"},
        {.name = "supportsPictureInPicture", .selName = nil, .type = "b"},
        {.name = "error", .selName = nil, .type = "s"},
        {.name = "loaded", .selName = nil, .type = "b"},
        {.name = "ended", .selName = nil, .type = "b"},
        {.name = "volume", .selName = nil, .type = "d"},
        {.name = "playbackRate", .selName = nil, .type = "d"},
        {.name = "sequence", .selName = nil, .type = "d"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRVideoMode",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, nil, SCValdiMarshallableObjectTypeClass);
}

@end


//
// VRVideoHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppVideoTypes.h"


//
// VRVideoPlayer.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppVideoTypes.h"


//
// VRVideoSubscription.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "AppVideoTypes.h"


