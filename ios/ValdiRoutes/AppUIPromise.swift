import Foundation
import ValdiRuntime

/// The completion retains the native Promise until AppUI settles, even if the calling page disappears.
/// SCValdiPromise is the Promise ABI of the generated Objective-C VRAppUIHost protocol.
enum AppUIPromise {
    static func make<Value: AnyObject>(
        _ start: (@escaping (Result<Value, Error>) -> Void) -> Void
    ) -> SCValdiPromise<Value> {
        let promise = SCValdiResolvablePromise<Value>()
        start { [promise] result in
            switch result {
            case let .success(value):
                promise.fulfill(withSuccessValue: value)
            case let .failure(error):
                promise.fulfillWithError(NSError(domain: "AppUIHost", code: 0,
                                                userInfo: [NSLocalizedDescriptionKey: message(error)]))
            }
        }
        return promise
    }

    static func void(_ start: @escaping (@escaping (Result<Void, Error>) -> Void) -> Void)
        -> SCValdiPromise<SCValdiUndefinedValue> {
        ValdiVoidPromise.make { settle in
            start { result in
                switch result {
                case .success: settle(nil)
                case let .failure(error): settle(message(error))
                }
            }
        }
    }

    private static func message(_ error: Error) -> String {
        let message = error.localizedDescription
        return message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "AppUI operation failed" : message
    }
}
