import CryptoKit
import Foundation

struct ValdiOtaError: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}

/// One request, one serial delegate queue. Only small metadata is accumulated in memory;
/// payload chunks are bounded before writing to a private .part file.
final class ValdiOtaDownloader: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private let url: URL
    private let limit: Int
    private let expected: ValdiOtaClient.Descriptor?
    private let destination: URL?
    private let timeout: TimeInterval
    private var handle: FileHandle?
    private var continuation: CheckedContinuation<Data, Error>?
    private var session: URLSession?
    private var received = 0
    private var metadata = Data()
    private var hasher = SHA256()
    private var failure: Error?

    private init(url: URL, limit: Int, expected: ValdiOtaClient.Descriptor?,
                 destination: URL?, timeout: TimeInterval) {
        self.url = url
        self.limit = limit
        self.expected = expected
        self.destination = destination
        self.timeout = timeout
    }

    static func metadata(_ url: URL, limit: Int, timeout: TimeInterval) async throws -> Data {
        try await ValdiOtaDownloader(url: url, limit: limit, expected: nil, destination: nil, timeout: timeout).run()
    }

    static func file(_ url: URL, descriptor: ValdiOtaClient.Descriptor,
                     to destination: URL, timeout: TimeInterval) async throws {
        _ = try await ValdiOtaDownloader(url: url, limit: descriptor.size, expected: descriptor,
                                         destination: destination, timeout: timeout).run()
    }

    private func run() async throws -> Data {
        if let destination {
            guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
                throw ValdiOtaError("Cannot create download file")
            }
            do { handle = try FileHandle(forWritingTo: destination) }
            catch { try? FileManager.default.removeItem(at: destination); throw error }
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
            self.session = session
            var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: timeout)
            request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            request.setValue("no-cache, no-store", forHTTPHeaderField: "Cache-Control")
            request.setValue("no-cache", forHTTPHeaderField: "Pragma")
            session.dataTask(with: request).resume()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        failure = ValdiOtaError("OTA redirects are forbidden")
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              (http.value(forHTTPHeaderField: "Content-Encoding") ?? "identity").lowercased() == "identity",
              response.expectedContentLength == -1 ||
                (response.expectedContentLength <= Int64(limit) &&
                 (expected == nil || response.expectedContentLength == Int64(limit))) else {
            failure = ValdiOtaError("OTA response status, encoding or length rejected")
            completionHandler(.cancel)
            return
        }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard failure == nil else { return }
        guard data.count <= limit - received else {
            failure = ValdiOtaError("OTA response exceeds byte limit")
            dataTask.cancel()
            return
        }
        received += data.count
        if let handle {
            do { try handle.write(contentsOf: data); hasher.update(data: data) }
            catch { failure = error; dataTask.cancel() }
        } else {
            metadata.append(data)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if failure == nil { failure = error }
        if failure == nil, let expected {
            let actualHash = hasher.finalize().map { String(format: "%02x", $0) }.joined()
            if received != expected.size || actualHash != expected.sha256 {
                failure = ValdiOtaError("OTA file length or SHA256 mismatch")
            }
        }
        do {
            if failure == nil { try handle?.synchronize() }
            try handle?.close()
        } catch { if failure == nil { failure = error } }
        handle = nil
        if failure != nil, let destination { try? FileManager.default.removeItem(at: destination) }
        let continuation = self.continuation
        self.continuation = nil
        session.finishTasksAndInvalidate()
        self.session = nil
        if let failure { continuation?.resume(throwing: failure) }
        else { continuation?.resume(returning: metadata) }
    }
}
