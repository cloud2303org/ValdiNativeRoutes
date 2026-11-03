#import <Foundation/Foundation.h>

#import "SCValdiWebViewControllerImpl.h"
#import "SCValdiWebViewNativeModule.h"
#import <SCCValdiWebViewTypes/SCCValdiWebViewTypes.h>

@interface SCValdiWebViewNativeModuleImpl : NSObject <SCCValdiWebViewWebViewNativeModule>
@end

@implementation SCValdiWebViewNativeModuleImpl

- (id<SCValdiWebViewController>)createNativeController
{
    return [SCValdiWebViewControllerImpl new];
}

@end

@interface SCValdiWebViewNativeModuleFactory : SCCValdiWebViewWebViewNativeModuleFactory
@end

@implementation SCValdiWebViewNativeModuleFactory

- (id<SCCValdiWebViewWebViewNativeModule>)onLoadModule
{
    return [SCValdiWebViewNativeModuleImpl new];
}

@end

id<SCNValdiCoreModuleFactory> ValdiWebViewCreateModuleFactory(void)
{
    return [SCValdiWebViewNativeModuleFactory new];
}
