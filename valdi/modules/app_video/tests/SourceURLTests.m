#import <Foundation/Foundation.h>
#import "VRVideoSource.h"

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSBundle *bundle = [NSBundle bundleWithPath:@(argv[1])];
        NSCAssert(bundle != nil, @"Fixture bundle is invalid");
        NSError *error = nil;
        NSURL *url = VRVideoSourceURL(@"bundle:///sample.mp4", bundle, &error);
        NSCAssert(url.isFileURL && [url.lastPathComponent isEqual:@"sample.mp4"] && !error,
            @"Expected packaged root resource, got %@ / %@", url, error);
        NSCAssert([NSData dataWithContentsOfURL:url].length == 12, @"Wrong resource resolved");
        // Full basenames, rather than hardcoded video names/extensions, are supported.
        NSCAssert(VRVideoSourceURL(@"bundle:///other-file_2.mov", bundle, nil) != nil, @"Generic resource failed");
        NSCAssert(VRVideoSourceURL(@"https://example.test/live/stream.m3u8?token=test", bundle, nil) != nil,
            @"Existing HTTPS/HLS policy changed");
        NSCAssert(VRVideoSourceURL(url.absoluteString, bundle, nil) != nil, @"Existing file URL policy changed");
        NSArray *invalid = @[
            @"bundle:///missing.mp4", @"bundle:///", @"bundle:///.", @"bundle:///..",
            @"bundle:///../sample.mp4", @"bundle:///nested/sample.mp4", @"bundle:////sample.mp4",
            @"bundle:///nested/../sample.mp4", @"bundle:///sample.mp4/..",
            @"bundle://host/sample.mp4", @"bundle://user@host/sample.mp4",
            @"bundle://:80/sample.mp4", @"bundle:/sample.mp4", @"bundle:sample.mp4",
            @"bundle://localhost/sample.mp4", @"bundle://?query/sample.mp4",
            @"bundle:///sample.mp4?query", @"bundle:///sample.mp4#fragment",
            @"bundle:///sample%2Emp4", @"bundle:///%2e%2e%2fsample.mp4",
            @"bundle:///nested%2fsample.mp4", @"bundle:///%252e%252e%252fsample.mp4",
            @"bundle:///sample\\file.mp4", @"bundle:///sample file.mp4", @"bundle:///.hidden",
            @"bundle:///directory.mp4",
            @"http://example.test/video.mp4", @"asset:///sample.mp4", @"content:///video",
            @"ftp://example.test/video.mp4", @"file:///definitely-missing-valdi-video-file",
            @"sample.mp4", @"https:", @"https://", @""
        ];
        for (NSString *source in invalid) {
            error = nil;
            NSCAssert(VRVideoSourceURL(source, bundle, &error) == nil && error != nil,
                @"Unsafe/missing source accepted: %@", source);
            NSCAssert(VRVideoSourceURL(source, bundle, nil) == nil, @"A null error pointer must be safe");
        }
        printf("PASS iOS production source resolver: root resources, HTTPS/file compatibility, %lu rejections\n",
               (unsigned long)invalid.count);
    }
    return 0;
}
