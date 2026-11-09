#import "WheelBindingRecorder.h"

@implementation VRWheelBindingRecorder
- (void)bindAttribute:(NSString *)name
    invalidateLayoutOnChange:(BOOL)invalidate
            withUntypedBlock:(SCValdiAttributeBindMethodUntyped)block
                  resetBlock:(SCValdiAttributeBindMethodReset)reset
{
    NSAssert([name isEqualToString:@"config"], @"Unexpected untyped binding");
    NSAssert(!invalidate, @"Wheel config must not invalidate layout");
    self.configBlock = block;
    self.configReset = reset;
}

- (void)bindAttribute:(NSString *)name
    withFunctionBlock:(SCValdiAttributeBindMethodFunction)block
           resetBlock:(SCValdiAttributeBindMethodResetNonAnimatable)reset
{
    NSAssert([name isEqualToString:@"onChange"], @"Unexpected callback binding");
    self.changeBlock = block;
    self.changeReset = reset;
}
@end
