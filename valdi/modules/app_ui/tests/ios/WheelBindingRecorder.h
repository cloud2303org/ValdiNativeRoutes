#import <ValdiRuntime/SCValdiAttributesBinder.h>

NS_ASSUME_NONNULL_BEGIN

/// Captures the real SDK's binding blocks without creating a JS runtime.
/// Every block invoked by the tests is registered by production bindAttributes.
@interface VRWheelBindingRecorder : SCValdiAttributesBinder
@property (nonatomic, copy) SCValdiAttributeBindMethodUntyped configBlock;
@property (nonatomic, copy) SCValdiAttributeBindMethodReset configReset;
@property (nonatomic, copy) SCValdiAttributeBindMethodFunction changeBlock;
@property (nonatomic, copy) SCValdiAttributeBindMethodResetNonAnimatable changeReset;
@end

NS_ASSUME_NONNULL_END
