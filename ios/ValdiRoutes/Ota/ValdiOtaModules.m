#import "ValdiOtaModules.h"

@implementation ValdiOtaModules {
    NSDictionary<NSString *, NSURL *> *_modules;
    NSDictionary<NSString *, NSString *> *_images;
}

- (instancetype)initWithModules:(NSDictionary<NSString *, NSURL *> *)modules
                         images:(NSDictionary<NSString *, NSString *> *)images
{
    if ((self = [super init])) {
        _modules = [modules copy];
        _images = [images copy];
    }
    return self;
}

// Declared nonnull by Valdi, though nil (with no error) means "the module in the app", as its comment says.
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wnullability"
- (NSData *)customModuleDataForPath:(NSString *)modulePath error:(NSError **)error
{
    NSURL *url = _modules[modulePath];
    if (url == nil) {
        // Not in the package: the module in the app.
        if (error != NULL) {
            *error = nil;
        }
        return nil;
    }
    // An unreadable module fails the launch (and the package is rolled back) instead of mixing in the app's version.
    return [NSData dataWithContentsOfURL:url options:NSDataReadingMappedIfSafe error:error];
}
#pragma clang diagnostic pop

- (nullable NSString *)assetURLForModule:(NSString *)moduleName resourcePath:(NSString *)resourcePath
{
    // As SCValdiImage names a module image in its bundle.
    NSString *name = [resourcePath stringByReplacingOccurrencesOfString:@"-" withString:@"_"];
    return _images[[NSString stringWithFormat:@"%@/%@", moduleName, name]];
}

@end
