#import "WheelObjectBinding.h"
#import <ValdiRuntime/SCValdiMarshaller.h>

@implementation VRWheelObjectBinding

+ (SCValdiMarshallableObject *)decode:(id)value asClass:(Class)modelClass error:(NSError **)error
{
    SCValdiMarshallerRef marshaller = SCValdiMarshallerCreate();
    @try {
        NSInteger index = SCValdiMarshallerPushUntyped(marshaller, value);
        SCValdiMarshallerCheck(marshaller);
        SCValdiMarshallableObject *object = SCValdiMarshallableObjectUnmarshall(marshaller, index, modelClass);
        SCValdiMarshallerCheck(marshaller);
        if (![object isKindOfClass:modelClass]) {
            if (error) {
                *error = [NSError errorWithDomain:@"VRWheelObjectBinding" code:1
                    userInfo:@{NSLocalizedDescriptionKey: @"Invalid wheel config object"}];
            }
            return nil;
        }
        return object;
    } @catch (NSException *exception) {
        if (error) {
            *error = [NSError errorWithDomain:@"VRWheelObjectBinding" code:1
                userInfo:@{NSLocalizedDescriptionKey: exception.reason ?: @"Invalid wheel config object"}];
        }
        return nil;
    } @finally {
        SCValdiMarshallerDestroy(marshaller);
    }
}

@end
