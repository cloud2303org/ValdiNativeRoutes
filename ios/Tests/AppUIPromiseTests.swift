import Foundation
import XCTest
import ValdiRuntime

/// Compile with app_ui AppUIPromise.swift, VRAppUIVoidPromise.m and canonical AppUI bindings.
/// These tests use the real runtime's native Promise and marshaller; no Promise stubs or Swift async bridge.
final class AppUIPromiseTests: XCTestCase {
    func testCompletionRetainsPromiseAfterCallerReleasesIt() {
        var complete: ((Result<VRScanCodeReply, Error>) -> Void)?
        weak var retained: SCValdiPromise<VRScanCodeReply>?
        var received: String?
        autoreleasepool {
            let promise: SCValdiPromise<VRScanCodeReply> = AppUIPromise.make { complete = $0 }
            retained = promise
            promise.onComplete(callbackBlock: { value, error in
                XCTAssertNil(error)
                received = value?.result
            })
        }
        XCTAssertNotNil(retained, "The outstanding AppUI callback must own the native Promise")
        autoreleasepool {
            complete?(.success(VRScanCodeReply(result: "closed", scanType: "QR_CODE")))
            complete = nil
        }
        XCTAssertEqual(received, "closed")
        XCTAssertNil(retained, "Releasing the settled callback must release its Promise")
    }

    func testVoidCompletionRetainsAndReleasesPromise() {
        var complete: ((Result<Void, Error>) -> Void)?
        weak var retained: SCValdiPromise<SCValdiUndefinedValue>?
        var observed = false
        autoreleasepool {
            let promise = AppUIPromise.void { complete = $0 }
            retained = promise
            promise.onComplete(callbackBlock: { value, error in
                XCTAssertNil(error)
                XCTAssertNotNil(value)
                observed = true
            })
        }
        XCTAssertNotNil(retained)
        autoreleasepool {
            complete?(.success(()))
            complete = nil
        }
        XCTAssertTrue(observed)
        XCTAssertNil(retained)
    }

    func testSynchronousValueReachesLateNativeObserver() {
        let promise: SCValdiPromise<VRScanCodeReply> = AppUIPromise.make {
            $0(.success(VRScanCodeReply(result: "ready", scanType: "QR_CODE")))
        }
        var observed = false
        observe(promise) { marshaller in
            XCTAssertFalse(SCValdiMarshallerIsError(marshaller, 0))
            let value = SCValdiMarshallableObjectUnmarshall(marshaller, 0, VRScanCodeReply.self) as? VRScanCodeReply
            XCTAssertEqual(value?.result, "ready")
            observed = true
        }
        XCTAssertTrue(observed)
    }

    func testPendingFailureReachesNativeErrorLaneAndReleasesPromise() {
        var complete: ((Result<VRScanCodeReply, Error>) -> Void)?
        weak var retained: SCValdiPromise<VRScanCodeReply>?
        var observed = false
        autoreleasepool {
            let promise: SCValdiPromise<VRScanCodeReply> = AppUIPromise.make { complete = $0 }
            retained = promise
            observe(promise) { marshaller in
                XCTAssertTrue(SCValdiMarshallerIsError(marshaller, 0))
                XCTAssertEqual(SCValdiMarshallerGetError(marshaller, 0).localizedDescription, "cancel")
                observed = true
            }
        }
        XCTAssertNotNil(retained)
        autoreleasepool {
            complete?(.failure(Failure(message: "cancel")))
            complete = nil
        }
        XCTAssertTrue(observed)
        XCTAssertNil(retained, "Settlement must break the native bridge peer's retain cycle")
    }

    func testEmptyTypedFailureStillRejects() {
        let promise: SCValdiPromise<VRScanCodeReply> = AppUIPromise.make { $0(.failure(Failure(message: ""))) }
        assertRejected(promise)
    }

    func testEmptyVoidFailureStillRejects() {
        let promise = AppUIPromise.void { $0(.failure(Failure(message: " \n"))) }
        assertRejected(promise)
    }

    func testVoidResolvesWithActualUndefined() {
        let promise = AppUIPromise.void { $0(.success(())) }
        var observed = false
        observe(promise) { marshaller in
            XCTAssertFalse(SCValdiMarshallerIsError(marshaller, 0))
            let expected = SCValdiMarshallerCreate()
            defer { SCValdiMarshallerDestroy(expected) }
            _ = SCValdiMarshallerPushUndefined(expected)
            XCTAssertTrue(SCValdiMarshallerEquals(marshaller, expected),
                          "Promise<void> must resolve undefined, rather than null, an empty string or a DTO")
            observed = true
        }
        XCTAssertTrue(observed)
    }

    func testCanceledAttachmentSelectionRemainsSuccessfulTypedReply() {
        let asset = VRAttachmentAsset(id2: "asset", uri: "file:///cache/asset", name: "asset.png",
                                     mimeType: "image/png", size: 42)
        let selection = VRAttachmentSelection(canceled: true, assets: [asset])
        let promise: SCValdiPromise<VRAttachmentSelection> = AppUIPromise.make { $0(.success(selection)) }
        var observed = false
        promise.onComplete(callbackBlock: { value, error in
            XCTAssertNil(error)
            XCTAssertTrue(value?.canceled == true)
            XCTAssertEqual(value?.assets.first?.id2, "asset")
            XCTAssertEqual(value?.assets.first?.size, 42)
            observed = true
        })
        XCTAssertTrue(observed)
    }

    private struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private func observe(_ promise: SCValdiPromise<VRScanCodeReply>,
                         _ inspect: @escaping (SCValdiMarshallerRef) -> Void) {
        let host = NativePromiseHost()
        host.scan = promise
        observe(host, field: 6, inspect)
    }

    private func observe(_ promise: SCValdiPromise<SCValdiUndefinedValue>,
                         _ inspect: @escaping (SCValdiMarshallerRef) -> Void) {
        let host = NativePromiseHost()
        host.void = promise
        observe(host, field: 10, inspect)
    }

    /// Invoke the canonical generated protocol bridge so its p<DTO>/p<v> schema marshals the Promise.
    /// Pushing an SCValdiPromise as an untyped NSObject does not exercise that bridge.
    private func observe(_ host: NativePromiseHost, field: Int,
                         _ inspect: @escaping (SCValdiMarshallerRef) -> Void) {
        let marshaller = SCValdiMarshallerCreate()
        defer { SCValdiMarshallerDestroy(marshaller) }
        let hostIndex = VRAppUIHostMarshall(marshaller, host)
        let objectIndex = SCValdiMarshallerUnwrapProxy(marshaller, hostIndex)
        let methodIndex = SCValdiMarshallerGetTypedObjectProperty(marshaller, field, objectIndex)
        let method = SCValdiMarshallerGetFunction(marshaller, methodIndex)
        let parameters = SCValdiMarshallerCreate()
        defer { SCValdiMarshallerDestroy(parameters) }
        XCTAssertTrue(method.perform(with: parameters))
        SCValdiMarshallerOnPromiseComplete(parameters, 0) { parameters in
            inspect(parameters)
            return true
        }
    }

    private func assertRejected<Value: AnyObject>(_ promise: SCValdiPromise<Value>,
                                                file: StaticString = #filePath, line: UInt = #line) {
        var observed = false
        promise.onComplete(callbackBlock: { value, error in
            XCTAssertNil(value, file: file, line: line)
            XCTAssertNotNil(error, file: file, line: line)
            XCTAssertFalse(error?.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true,
                           file: file, line: line)
            observed = true
        })
        XCTAssertTrue(observed, file: file, line: line)
    }
}

/// A native producer for the real generated VRAppUIHost bridge, without presenting UI in a unit test.
private final class NativePromiseHost: NSObject, VRAppUIHost {
    var scan: SCValdiPromise<VRScanCodeReply>!
    var void: SCValdiPromise<SCValdiUndefinedValue>!
    func scanCode() -> SCValdiPromise<VRScanCodeReply> { scan }
    func hideToast() -> SCValdiPromise<SCValdiUndefinedValue> { void }
    func showModal(with request: VRModalRequest) -> SCValdiPromise<VRModalReply> { fatalError() }
    func showActionSheet(with request: VRActionSheetRequest) -> SCValdiPromise<VRPresentationReply> { fatalError() }
    func showPicker(with request: VRPickerRequest) -> SCValdiPromise<VRPresentationReply> { fatalError() }
    func showDatePicker(with request: VRDatePickerRequest) -> SCValdiPromise<VRPresentationReply> { fatalError() }
    func showBottomSheet(with request: VRBottomSheetRequest) -> SCValdiPromise<VRPresentationReply> { fatalError() }
    func previewImage(with request: VRImagePreviewRequest) -> SCValdiPromise<VRPresentationReply> { fatalError() }
    func pickAttachments(withSource source: String, limit: Double, mimeTypes: [String])
        -> SCValdiPromise<VRAttachmentSelection> { fatalError() }
    func clearAttachmentCache() -> SCValdiPromise<SCValdiUndefinedValue> { fatalError() }
    func showToast(with request: VRToastRequest) -> SCValdiPromise<SCValdiUndefinedValue> { fatalError() }
    func showLoading(with request: VRLoadingRequest) -> SCValdiPromise<SCValdiUndefinedValue> { fatalError() }
    func hideLoading() -> SCValdiPromise<SCValdiUndefinedValue> { fatalError() }
}
