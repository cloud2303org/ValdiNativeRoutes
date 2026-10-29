// Adapted from Valdi's polyglot_bridge_module template (MIT).
#import "SCCCalculatorModuleFactory.h"
#import <CalculatorTypes/CalculatorTypes.h>
#import <Foundation/Foundation.h>

@interface SCCCalculatorModule : NSObject<CalculatorCalculatorModule>
@end

@implementation SCCCalculatorModule
- (double)multiplyWithLeft:(double)left right:(double)right {
    return left * right;
}
@end

@interface SCCCalculatorModuleFactoryImpl : CalculatorCalculatorModuleFactory
@end

@implementation SCCCalculatorModuleFactoryImpl
- (id<CalculatorCalculatorModule>)onLoadModule {
    return [SCCCalculatorModule new];
}
@end

id<SCNValdiCoreModuleFactory> CalculatorCreateModuleFactory(void) {
    return [SCCCalculatorModuleFactoryImpl new];
}
