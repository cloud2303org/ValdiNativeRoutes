#pragma once

#include <cstdint>
#include <string>
#include <vector>

// The Core has no React, Nitro, JNI or platform dependency. Native callers use
// this same implementation; only HybridVision converts its result to Nitro.
namespace native_routes::vision {

struct Prediction {
  std::string label;
  double score;
};

struct DemoResult {
  std::string opencvVersion;
  std::string ncnnVersion;
  std::string modelName;
  std::string modelDescription;
  double processingMs;
  double inferenceMs;
  int width;
  int height;
  int inferenceWidth;
  int inferenceHeight;
  int edgePixelCount;
  std::string inputImageDataUrl;
  std::string edgeImageDataUrl;
  std::vector<Prediction> predictions;
};

DemoResult runDemo();

// RGB interleaved pixels, bounded to a small CPU fixture. No global image
// handles or runtime-owned state cross this boundary.
std::vector<Prediction> inferRgbChannels(const std::vector<std::uint8_t>& rgb, int width, int height);

} // namespace native_routes::vision
