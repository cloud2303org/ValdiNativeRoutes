#import "VisionCoreBridge.h"

#include "VisionCore.hpp"

#include <exception>

static NSString *NRString(const std::string &value) {
  return [[NSString alloc] initWithBytes:value.data() length:value.size() encoding:NSUTF8StringEncoding] ?: @"";
}

@implementation NRVisionPrediction
- (instancetype)initWithPrediction:(const native_routes::vision::Prediction &)prediction {
  if ((self = [super init])) {
    _label = NRString(prediction.label);
    _score = prediction.score;
  }
  return self;
}
@end

@implementation NRVisionDemoResult
- (instancetype)initWithResult:(const native_routes::vision::DemoResult &)result {
  if ((self = [super init])) {
    _opencvVersion = NRString(result.opencvVersion);
    _ncnnVersion = NRString(result.ncnnVersion);
    _modelName = NRString(result.modelName);
    _modelDescription = NRString(result.modelDescription);
    _processingMs = result.processingMs;
    _inferenceMs = result.inferenceMs;
    _width = result.width;
    _height = result.height;
    _inferenceWidth = result.inferenceWidth;
    _inferenceHeight = result.inferenceHeight;
    _edgePixelCount = result.edgePixelCount;
    _inputImageDataUrl = NRString(result.inputImageDataUrl);
    _edgeImageDataUrl = NRString(result.edgeImageDataUrl);
    NSMutableArray<NRVisionPrediction *> *predictions = [NSMutableArray arrayWithCapacity:result.predictions.size()];
    for (const auto &prediction : result.predictions) {
      [predictions addObject:[[NRVisionPrediction alloc] initWithPrediction:prediction]];
    }
    _predictions = predictions;
  }
  return self;
}
@end

@implementation NRVisionCore
+ (NRVisionDemoResult *)runDemoWithError:(NSError **)error {
  NSString *message;
  try {
    return [[NRVisionDemoResult alloc] initWithResult:native_routes::vision::runDemo()];
  } catch (const std::exception &exception) {
    message = [NSString stringWithUTF8String:exception.what()] ?: @"VisionCore failed";
  } catch (...) {
    message = @"VisionCore failed";
  }
  if (error) {
    *error = [NSError errorWithDomain:@"NRVisionCore" code:1 userInfo:@{NSLocalizedDescriptionKey : message}];
  }
  return nil;
}
@end
