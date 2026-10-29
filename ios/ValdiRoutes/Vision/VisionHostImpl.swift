import Foundation
import ValdiRuntime

/// `VisionHost` (vision/VisionHost.ts) on the shared C++ VisionCore (OpenCV mobile + ncnn, statically linked from
/// vision/vendor). The PNG data URLs it returns are written to the caches directory and handed to Valdi as file:// URLs.
final class VisionHostImpl: NSObject, VRVisionHost {
    private let queue = DispatchQueue(label: "io.valdiroutes.vision", qos: .userInitiated)

    func runDemo(done: @escaping VRVisionHostRunDemoDoneBlock) {
        queue.async {
            do {
                done("", try Self.run())
            } catch {
                done((error as? LocalizedError)?.errorDescription ?? error.localizedDescription, nil)
            }
        }
    }

    private static func run() throws -> VRVisionDemoResult {
        let result = try NRVisionCore.runDemo()
        let directory = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("vision", isDirectory: true)
        // Each run gets new names, so an image view never shows a cached earlier file; the previous run's are removed.
        try? FileManager.default.removeItem(at: directory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let run = UUID().uuidString
        let input = try write(result.inputImageDataUrl, to: directory.appendingPathComponent("input-\(run).png"))
        let edges = try write(result.edgeImageDataUrl, to: directory.appendingPathComponent("edges-\(run).png"))
        return VRVisionDemoResult(
            opencvVersion: result.opencvVersion,
            ncnnVersion: result.ncnnVersion,
            modelName: result.modelName,
            modelDescription: result.modelDescription,
            processingMs: result.processingMs,
            inferenceMs: result.inferenceMs,
            width: Double(result.width),
            height: Double(result.height),
            inferenceWidth: Double(result.inferenceWidth),
            inferenceHeight: Double(result.inferenceHeight),
            edgePixelCount: Double(result.edgePixelCount),
            inputImageUrl: input.absoluteString,
            edgeImageUrl: edges.absoluteString,
            predictions: result.predictions.map { VRVisionPrediction(label: $0.label, score: $0.score) }
        )
    }

    private static func write(_ dataUrl: String, to file: URL) throws -> URL {
        let prefix = "data:image/png;base64,"
        guard dataUrl.hasPrefix(prefix), let data = Data(base64Encoded: String(dataUrl.dropFirst(prefix.count))) else {
            throw VisionError(message: "VisionCore returned an invalid PNG data URL")
        }
        try data.write(to: file, options: .atomic)
        return file
    }
}

private struct VisionError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
