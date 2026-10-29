#include "VisionCore.hpp"

#include <datareader.h>
#include <net.h>
#include <opencv2/core.hpp>
#include <opencv2/core/version.hpp>
#include <opencv2/highgui/highgui.hpp>
#include <opencv2/imgproc.hpp>
#include <platform.h>

#include <array>
#include <chrono>
#include <cmath>
#include <stdexcept>

namespace native_routes::vision {
namespace {

using Clock = std::chrono::steady_clock;
constexpr int ImageWidth = 256;
constexpr int ImageHeight = 192;
constexpr int InferenceSize = 64;

// This is a real ncnn graph with no trained weights. It reduces RGB planes to
// their means and normalizes them with Softmax. The labels below name channels,
// not semantic classes or ImageNet predictions.
constexpr char ChannelGraph[] =
    "7767517\n"
    "4 4\n"
    "Input input 0 1 rgb\n"
    "Pooling channel_average 1 1 rgb means 0=1 4=1\n"
    "Flatten flatten 1 1 means features\n"
    "Softmax channel_response 1 1 features responses 0=0 1=1\n";

double elapsedMs(Clock::time_point start, Clock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::string base64(const std::vector<std::uint8_t>& bytes) {
  constexpr char Alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string output;
  output.reserve((bytes.size() + 2) / 3 * 4);
  for (std::size_t index = 0; index < bytes.size(); index += 3) {
    const std::uint32_t a = bytes[index];
    const std::uint32_t b = index + 1 < bytes.size() ? bytes[index + 1] : 0;
    const std::uint32_t c = index + 2 < bytes.size() ? bytes[index + 2] : 0;
    const auto word = (a << 16) | (b << 8) | c;
    output.push_back(Alphabet[(word >> 18) & 63]);
    output.push_back(Alphabet[(word >> 12) & 63]);
    output.push_back(index + 1 < bytes.size() ? Alphabet[(word >> 6) & 63] : '=');
    output.push_back(index + 2 < bytes.size() ? Alphabet[word & 63] : '=');
  }
  return output;
}

std::string imageDataUrl(const cv::Mat& image) {
  std::vector<std::uint8_t> encoded;
  if (!cv::imencode(".png", image, encoded) || encoded.empty()) {
    throw std::runtime_error("OpenCV mobile failed to encode the demo PNG");
  }
  return "data:image/png;base64," + base64(encoded);
}

cv::Mat makeFixture() {
  cv::Mat image(ImageHeight, ImageWidth, CV_8UC3);
  for (int y = 0; y < image.rows; ++y) {
    auto* pixels = image.ptr<cv::Vec3b>(y);
    for (int x = 0; x < image.cols; ++x) {
      pixels[x] = cv::Vec3b(24 + y * 64 / ImageHeight, 28 + x * 96 / ImageWidth, 40);
    }
  }
  cv::rectangle(image, cv::Rect(24, 24, 88, 100), cv::Scalar(32, 48, 240), cv::FILLED);
  cv::circle(image, cv::Point(188, 75), 38, cv::Scalar(40, 220, 40), cv::FILLED);
  cv::line(image, cv::Point(24, 160), cv::Point(232, 144), cv::Scalar(240, 160, 40), 6);
  return image;
}

} // namespace

std::vector<Prediction> inferRgbChannels(const std::vector<std::uint8_t>& rgb, int width, int height) {
  if (width <= 0 || height <= 0 || width > 256 || height > 256) {
    throw std::invalid_argument("Vision fixture dimensions must be between 1 and 256");
  }
  const auto required = static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 3;
  if (rgb.size() != required) {
    throw std::invalid_argument("Vision fixture requires exactly width * height * 3 RGB bytes");
  }

  ncnn::Net net;
  net.opt.num_threads = 1;
  net.opt.use_vulkan_compute = false;
  net.opt.use_packing_layout = false;
  net.opt.use_fp16_packed = false;
  net.opt.use_fp16_storage = false;
  net.opt.use_fp16_arithmetic = false;
  net.opt.use_bf16_storage = false;
  if (net.load_param_mem(ChannelGraph) != 0) {
    throw std::runtime_error("ncnn failed to load the deterministic channel graph");
  }
  // load_model also initializes each layer's CPU pipeline. A weightless graph
  // consumes no bytes, but still goes through the real ncnn model-load path.
  alignas(16) static constexpr unsigned char EmptyWeights[4] = {};
  const unsigned char* cursor = EmptyWeights;
  ncnn::DataReaderFromMemory weights(cursor);
  if (net.load_model(weights) != 0 || cursor != EmptyWeights) {
    throw std::runtime_error("ncnn failed to initialize the weightless graph");
  }

  auto input = ncnn::Mat::from_pixels(rgb.data(), ncnn::Mat::PIXEL_RGB, width, height);
  if (input.empty()) {
    throw std::runtime_error("ncnn failed to allocate the RGB input tensor");
  }
  constexpr float normalization[] = {1.0f / 255, 1.0f / 255, 1.0f / 255};
  input.substract_mean_normalize(nullptr, normalization);
  auto extractor = net.create_extractor();
  if (extractor.input("rgb", input) != 0) {
    throw std::runtime_error("ncnn failed to bind the RGB input tensor");
  }
  ncnn::Mat output;
  const int extractionResult = extractor.extract("responses", output);
  if (extractionResult != 0) {
    throw std::runtime_error("ncnn failed to execute the channel response graph: " + std::to_string(extractionResult));
  }
  // Mat::total() counts aligned storage (three floats occupy four slots on
  // ARM64), whereas w is the logical length of this one-dimensional tensor.
  if (output.empty() || output.dims != 1 || output.w != 3 || output.elempack != 1 || output.elemsize != sizeof(float)) {
    throw std::runtime_error("ncnn channel response has unexpected shape: dims=" + std::to_string(output.dims) +
                             " w=" + std::to_string(output.w) + " h=" + std::to_string(output.h) +
                             " c=" + std::to_string(output.c) + " elempack=" + std::to_string(output.elempack) +
                             " total=" + std::to_string(output.total()));
  }
  const std::array<std::string, 3> labels = {"R channel", "G channel", "B channel"};
  std::vector<Prediction> predictions;
  predictions.reserve(3);
  for (int channel = 0; channel < 3; ++channel) {
    const double score = output[channel];
    if (!std::isfinite(score)) {
      throw std::runtime_error("ncnn returned a non-finite channel response");
    }
    predictions.push_back({labels[channel], score});
  }
  return predictions;
}

DemoResult runDemo() {
  const auto processingStart = Clock::now();
  auto inputImage = makeFixture();
  cv::Mat gray;
  cv::cvtColor(inputImage, gray, cv::COLOR_BGR2GRAY);
  cv::Mat edges;
  cv::Canny(gray, edges, 60, 120);
  cv::Mat resized;
  cv::resize(inputImage, resized, cv::Size(InferenceSize, InferenceSize), 0, 0, cv::INTER_AREA);
  cv::Mat rgb;
  cv::cvtColor(resized, rgb, cv::COLOR_BGR2RGB);
  std::vector<std::uint8_t> inputBytes(rgb.data, rgb.data + rgb.total() * rgb.elemSize());
  const auto processingEnd = Clock::now();

  const auto inferenceStart = Clock::now();
  auto predictions = inferRgbChannels(inputBytes, rgb.cols, rgb.rows);
  const auto inferenceEnd = Clock::now();

  return {
      CV_VERSION,
      NCNN_VERSION_STRING,
      "RGB channel response fixture",
      "Global average pooling + Softmax; deterministic CPU graph with no trained weights",
      elapsedMs(processingStart, processingEnd),
      elapsedMs(inferenceStart, inferenceEnd),
      inputImage.cols,
      inputImage.rows,
      rgb.cols,
      rgb.rows,
      cv::countNonZero(edges),
      imageDataUrl(inputImage),
      imageDataUrl(edges),
      std::move(predictions),
  };
}

} // namespace native_routes::vision
