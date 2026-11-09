#import "VRVideoSource.h"

static NSURL *VRVideoInvalidSource(NSError **error, NSString *message) {
    if (error) *error = [NSError errorWithDomain:@"AppVideo" code:1
                                      userInfo:@{NSLocalizedDescriptionKey: message}];
    return nil;
}

NSURL *VRVideoSourceURL(NSString *source, NSBundle *bundle, NSError **error) {
    NSURL *url = [NSURL URLWithString:source];
    NSString *scheme = url.scheme.lowercaseString;
    if ([scheme isEqual:@"bundle"]) {
        // Require the canonical spelling before decoding/normalization can hide traversal,
        // authorities, or escaped separators. Xcode may flatten copied resources to bundle root.
        NSString *prefix = @"bundle:///";
        if (![source hasPrefix:prefix]) {
            return VRVideoInvalidSource(error, @"Expected bundle:///filename");
        }
        NSString *name = [source substringFromIndex:prefix.length];
        NSCharacterSet *allowed = [NSCharacterSet characterSetWithCharactersInString:
            @"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-."];
        if (!name.length || [name hasPrefix:@"."] ||
            [name rangeOfCharacterFromSet:allowed.invertedSet].location != NSNotFound) {
            return VRVideoInvalidSource(error, @"Bundle video source must name one unescaped root resource");
        }
        url = [bundle URLForResource:name withExtension:nil];
        BOOL directory = NO;
        if (!url.isFileURL || ![NSFileManager.defaultManager fileExistsAtPath:url.path isDirectory:&directory] || directory) {
            return VRVideoInvalidSource(error, @"Bundle video resource was not found");
        }
        return url;
    }
    // Keep the prior source policy for progressive MP4 and HLS. No extension sniffing,
    // HTTP opt-in, arbitrary resource paths, or remote fallback for missing bundle resources.
    if (!url || !([scheme isEqual:@"https"] || url.isFileURL) ||
        ([scheme isEqual:@"https"] && !url.host.length) ||
        (url.isFileURL && ![NSFileManager.defaultManager fileExistsAtPath:url.path])) {
        return VRVideoInvalidSource(error, @"Expected an existing file URL, an HTTPS video/HLS URL, or bundle:///filename");
    }
    return url;
}
