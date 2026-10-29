#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Objective-C view of native_routes::vision::DemoResult (vision/cpp/VisionCore.hpp), for Swift.
@interface NRVisionPrediction : NSObject
@property (nonatomic, readonly, copy) NSString *label;
@property (nonatomic, readonly) double score;
@end

@interface NRVisionDemoResult : NSObject
@property (nonatomic, readonly, copy) NSString *opencvVersion;
@property (nonatomic, readonly, copy) NSString *ncnnVersion;
@property (nonatomic, readonly, copy) NSString *modelName;
@property (nonatomic, readonly, copy) NSString *modelDescription;
@property (nonatomic, readonly) double processingMs;
@property (nonatomic, readonly) double inferenceMs;
@property (nonatomic, readonly) NSInteger width;
@property (nonatomic, readonly) NSInteger height;
@property (nonatomic, readonly) NSInteger inferenceWidth;
@property (nonatomic, readonly) NSInteger inferenceHeight;
@property (nonatomic, readonly) NSInteger edgePixelCount;
/// data:image/png;base64,… as produced by VisionCore.
@property (nonatomic, readonly, copy) NSString *inputImageDataUrl;
@property (nonatomic, readonly, copy) NSString *edgeImageDataUrl;
@property (nonatomic, readonly, copy) NSArray<NRVisionPrediction *> *predictions;
@end

@interface NRVisionCore : NSObject
/// Runs the OpenCV + ncnn demo synchronously on the calling thread; a C++ exception becomes the error.
+ (nullable NRVisionDemoResult *)runDemoWithError:(NSError **)error;
@end

NS_ASSUME_NONNULL_END
