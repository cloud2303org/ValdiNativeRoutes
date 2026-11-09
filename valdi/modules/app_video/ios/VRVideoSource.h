#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Resolves a caller-owned source without expanding the existing HTTPS/file URL policy.
/// bundle:///filename names one packaged resource; directories and URL decorations are rejected.
FOUNDATION_EXPORT NSURL *_Nullable VRVideoSourceURL(NSString *source, NSBundle *bundle, NSError **error);

NS_ASSUME_NONNULL_END
