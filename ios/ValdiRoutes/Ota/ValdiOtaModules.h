#import <Foundation/Foundation.h>
#import <ValdiRuntime/SCValdiCustomModuleProvider.h>

NS_ASSUME_NONNULL_BEGIN

/// The custom module provider of ValdiOta.swift, for one package. In Objective-C because "load the app's own module"
/// is nil without an error, which a Swift `throws -> Data` implementation can't return.
@interface ValdiOtaModules : NSObject <SCValdiCustomModuleProvider>

/// modules: module file name (app_pages.valdimodule, app_pages.map.json) → file.
/// images: "<module>/<resource path>" → file URL string.
- (instancetype)initWithModules:(NSDictionary<NSString *, NSURL *> *)modules
                         images:(NSDictionary<NSString *, NSString *> *)images NS_DESIGNATED_INITIALIZER;

- (instancetype)init NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
