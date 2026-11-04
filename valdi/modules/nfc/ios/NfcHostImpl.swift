import Foundation
import ValdiRuntime

/// The public NFC API remains Android-only. JS rejects before looking up this host on iOS;
/// direct consumers of the typed capability receive the same NOT_SUPPORTED error.
final class NfcHostImpl: NSObject, VRNfcHost {
    private func unsupported<T: AnyObject>() -> SCValdiPromise<T> {
        let promise = SCValdiResolvablePromise<T>()
        promise.fulfillWithError(NSError(domain: "NfcHost", code: 13000,
            userInfo: [NSLocalizedDescriptionKey: "E_NFC_NOT_SUPPORTED:NFC is Android-only"]))
        return promise
    }

    func setEventsWith(_ events: VRNfcHostEvents) {}
    func getAvailability() -> SCValdiPromise<VRNfcAvailability> { unsupported() }
    func startDiscovery() -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
    func stopDiscovery() -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
    func connect(with handle: VRNfcHandle) -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
    func close(with handle: VRNfcHandle) -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
    func isConnected(with handle: VRNfcHandle) -> SCValdiPromise<NSNumber> { unsupported() }
    func transceive(with handle: VRNfcHandle, data: Data) -> SCValdiPromise<NSData> { unsupported() }
    func getMaxTransceiveLength(with handle: VRNfcHandle) -> SCValdiPromise<NSNumber> { unsupported() }
    func setTimeoutWith(_ handle: VRNfcHandle, timeout: Double) -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
    func getAtqaWith(_ handle: VRNfcHandle) -> SCValdiPromise<NSData> { unsupported() }
    func getSakWith(_ handle: VRNfcHandle) -> SCValdiPromise<NSNumber> { unsupported() }
    func getHistoricalBytes(with handle: VRNfcHandle) -> SCValdiPromise<NSData> { unsupported() }
    func writeNdefMessage(with handle: VRNfcHandle, records: [VRNfcRecord], uris: [String], texts: [String])
        -> SCValdiPromise<SCValdiUndefinedValue> { unsupported() }
}
