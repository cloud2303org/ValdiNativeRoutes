//
// VRStartApp.m
//

#import <ValdiRuntime/SCValdiJSConversionUtils.h>
#import <ValdiRuntime/SCValdiMarshallableObjectRegistry.h>

#import "app_pages.h"

static SCValdiFieldValue SCValdiFunctionInvokeOB_o(const void *function, SCValdiFieldValue* fields) {
    const void * result = ((const void * (*) (const void *, BOOL ))function)(SCValdiFieldValueGetPtr(fields[0]), SCValdiFieldValueGetBool(fields[1]));
    return SCValdiFieldValueMakePtr(result);
}

static id SCValdiBlockCreateOB_o(SCValdiBlockTrampoline trampoline) {
    return ^const void *(BOOL p0) {
        return SCValdiFieldValueGetPtr(trampoline(nil, SCValdiFieldValueMakeBool(p0)));
    };
}

@implementation VRStartApp

+ (NSString *)modulePath
{
    return @"app_pages/src/app";
}

+ (BOOL)asyncStrictMode
{
    return NO;
}
- (VRRouteDeclaration * _Nonnull)startAppWithDebug:(BOOL)debug{
    VRStartAppBlock callBlock = (VRStartAppBlock)self.callBlock;
    return callBlock(debug);
}

+ (void)invokeWithJSRuntimeProvider:(id<SCValdiJSRuntime> _Nonnull (^ _Nonnull)(void))jsRuntimeProvider debug:(BOOL)debug completionHandler:(void (^ _Nonnull)(VRRouteDeclaration * _Nonnull))completionHandler
{
    id<SCValdiJSRuntime> runtime = jsRuntimeProvider();
    [runtime dispatchInJsThread:^{
        VRStartApp *function = [VRStartApp functionWithJSRuntime:runtime];
        VRStartAppBlock callBlock = (VRStartAppBlock)function.callBlock;
        VRRouteDeclaration * _Nonnull result = callBlock(debug);
        completionHandler(result);
    } attribution:@"generated.invokeWithJSRuntime:app_pages/src/app#startApp"];
}

+ (SCValdiMarshallableObjectDescriptor)valdiMarshallableObjectDescriptor
{
    static const SCValdiMarshallableObjectBlockSupport kBlocks[] = {
        { .typeEncoding = "ob:o", .invoker = &SCValdiFunctionInvokeOB_o, .factory = &SCValdiBlockCreateOB_o },
        { .typeEncoding = nil },
    };
    static const SCValdiMarshallableObjectFieldDescriptor kFields[] = {
        {.name = "startApp", .selName = nil, .type = "f(b): r:'[0]'"},
        {.name = nil},
    };
    static const char *const kIdentifiers[] = {
        "VRRouteDeclaration",
        nil
    };
    return SCValdiMarshallableObjectDescriptorMake(kFields, kIdentifiers, kBlocks, SCValdiMarshallableObjectTypeFunction);
}

@end


