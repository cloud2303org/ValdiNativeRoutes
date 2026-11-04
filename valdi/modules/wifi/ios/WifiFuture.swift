// From ExpoNativeRoutes ios/native/wifi/Core/WifiFuture.swift.
import Foundation

/// A native result shared by the Swift facade and the Valdi host (WifiHostImpl).
public final class WifiFuture<T> {
  private let lock = NSLock()
  private var result: Result<T, Error>?
  private var observers: [(Result<T, Error>) -> Void] = []
  public init() {}
  public func observe(_ callback: @escaping (Result<T, Error>) -> Void) {
    lock.lock()
    let completed = result
    if completed == nil { observers.append(callback) }
    lock.unlock()
    if let completed { callback(completed) }
  }
  public func resolve(withResult value: T) { finish(.success(value)) }
  public func reject(withError error: Error) { finish(.failure(error)) }
  private func finish(_ value: Result<T, Error>) {
    lock.lock()
    guard result == nil else { lock.unlock(); return }
    result = value
    let callbacks = observers
    observers.removeAll()
    lock.unlock()
    callbacks.forEach { $0(value) }
  }
  public func value() async throws -> T {
    try await withCheckedThrowingContinuation { continuation in observe { continuation.resume(with: $0) } }
  }
}
