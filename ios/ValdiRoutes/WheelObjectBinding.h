#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCValdiMarshallableObject.h>

NS_ASSUME_NONNULL_BEGIN

/// Keep Objective-C exceptions from crossing a Swift attribute-binding frame.
@interface VRWheelObjectBinding : NSObject
+ (nullable SCValdiMarshallableObject *)decode:(nullable id)value
                                      asClass:(Class)modelClass
                                        error:(NSError *_Nullable *_Nullable)error
    NS_SWIFT_NAME(decode(_:as:));
@end

NS_ASSUME_NONNULL_END
