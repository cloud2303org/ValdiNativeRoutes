//
// VRVisionDemoResult.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_visionTypes.h"

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
// VRVisionNativeModule.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_visionTypes.h"


//
// VRVisionNativeModuleFactory.m
//

#import "app_visionTypes.h"

@implementation VRVisionNativeModuleFactory

- (id<VRVisionNativeModule>)onLoadModule
{
    return [self onLoadModule];
}

- (NSString *)getModulePath
{
    return @"app_vision/src/Vision";
}

- (Protocol *)moduleProtocol
{
    return @protocol(VRVisionNativeModule);
}

@end

//
// VRVisionPrediction.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_visionTypes.h"

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
// VRVisionHost.m
//

#import <ValdiRuntime/SCValdiBuiltinTrampolines.h>
#import <ValdiRuntime/SCValdiMarshallableObjectDescriptor.h>

#import "app_visionTypes.h"


