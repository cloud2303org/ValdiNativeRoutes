// From ExpoNativeRoutes ios/native/wifi/Core/WifiCore.swift.
import Foundation

private final class WeakWifiSession {
  weak var value: WifiSession?
  init(_ value: WifiSession) { self.value = value }
}

private final class WifiConfigurationLease {
  let params: WifiConnectionParams
  var owners: Set<UUID> = []
  init(_ params: WifiConnectionParams) { self.params = params }
}

private final class WifiConnectOperation {
  let session: WifiSession
  var generation: UInt64 = 0
  let params: WifiConnectionParams
  let output = WifiFuture<WifiNetworkInfo>()
  var ended = false
  var applying = false
  var createdConfiguration = false
  var cancelTimeout: (() -> Void)?
  var cancelPoll: (() -> Void)?
  init(_ session: WifiSession, _ params: WifiConnectionParams) {
    self.session = session; self.params = params
  }
}

/// One application Wi-Fi core, shared by RN and native host sessions.
/// Constructing a core or registering listeners never requests OS permission.
public final class WifiCore {
  public static let shared = WifiCore(system: WifiPlatform())
  private let system: WifiSystem
  private let schedule: WifiSchedule
  private let connectionTimeout: TimeInterval
  private let pollInterval: TimeInterval
  private var sessions: [UUID: WeakWifiSession] = [:]
  private var configurations: [String: WifiConfigurationLease] = [:]
  private var connection: WifiConnectOperation?
  private var observerCleanup: (() -> Void)?
  private var observationGeneration: UInt64 = 0
  private var lastNetworkKey: String?
  private var nextListenerId: Double = 1

  init(system: WifiSystem, connectionTimeout: TimeInterval = 30, pollInterval: TimeInterval = 0.5, schedule: @escaping WifiSchedule = scheduleWifiWork) {
    self.system = system; self.connectionTimeout = connectionTimeout
    self.pollInterval = pollInterval; self.schedule = schedule
  }
  func main(_ action: @escaping () -> Void) {
    if Thread.isMainThread { action() } else { DispatchQueue.main.async(execute: action) }
  }
  func sync<T>(_ action: () throws -> T) rethrows -> T {
    if Thread.isMainThread { return try action() }
    return try DispatchQueue.main.sync(execute: action)
  }
  public func createSession() -> WifiSession {
    sync {
      let session = WifiSession(core: self)
      sessions[session.id] = WeakWifiSession(session)
      return session
    }
  }

  fileprivate func start(_ session: WifiSession) -> WifiFuture<Void> {
    let output = WifiFuture<Void>()
    main {
      guard !session.released else { output.reject(withError: session.releaseError); return }
      if let error = self.system.availabilityError() { output.reject(withError: error); return }
      session.started = true
      self.updateObserver()
      output.resolve(withResult: ())
    }
    return output
  }
  fileprivate func stop(_ session: WifiSession, release: Bool) -> WifiFuture<Void> {
    let output = WifiFuture<Void>()
    main {
      if session.released {
        if release { output.resolve(withResult: ()) } else { output.reject(withError: session.releaseError) }
        return
      }
      session.started = false
      session.generation &+= 1
      if release { session.released = true; session.listeners.removeAll(); self.sessions.removeValue(forKey: session.id) }
      // Mutate ownership before callbacks, which may synchronously start a new session.
      for SSID in Array(self.configurations.keys) {
        self.configurations[SSID]?.owners.remove(session.id)
        if self.configurations[SSID]?.owners.isEmpty == true {
          self.configurations.removeValue(forKey: SSID)
          self.system.removeConfiguration(SSID: SSID)
        }
      }
      self.updateObserver()
      let cancellations = Array(session.pending.values)
      session.pending.removeAll()
      if let operation = self.connection, operation.session === session {
        self.finish(operation, .failure(release ? session.releaseError : session.stoppedError))
      }
      cancellations.forEach { $0(release ? session.releaseError : session.stoppedError) }
      output.resolve(withResult: ())
    }
    return output
  }
  private func activeSessions() -> [WifiSession] {
    sessions = sessions.filter { $0.value.value != nil }
    return sessions.values.compactMap(\.value).filter { $0.started && !$0.released }
  }
  fileprivate func discardSession(_ id: UUID) {
    sessions.removeValue(forKey: id)
    for SSID in Array(configurations.keys) {
      configurations[SSID]?.owners.remove(id)
      if configurations[SSID]?.owners.isEmpty == true {
        configurations.removeValue(forKey: SSID)
        system.removeConfiguration(SSID: SSID)
      }
    }
    updateObserver()
  }
  private func updateObserver() {
    if activeSessions().isEmpty {
      observationGeneration &+= 1
      observerCleanup?(); observerCleanup = nil; lastNetworkKey = nil
    } else if observerCleanup == nil {
      observationGeneration &+= 1
      let generation = observationGeneration
      observerCleanup = system.observeNetworkChanges { [weak self] in self?.main {
        guard let self, self.observationGeneration == generation, self.observerCleanup != nil else { return }
        self.refreshObservedNetwork(generation)
      } }
      refreshObservedNetwork(generation)
    }
  }
  private func refreshObservedNetwork(_ generation: UInt64) {
    system.fetchCurrent { [weak self] network in self?.main {
      guard let self, self.observationGeneration == generation, self.observerCleanup != nil else { return }
      guard let network else { self.lastNetworkKey = nil; return }
      self.publish(network)
    } }
  }
  private func publish(_ network: WifiNetworkInfo) {
    let key = network.SSID + "\u{0}" + (network.BSSID ?? "")
    guard key != lastNetworkKey else { return }
    lastNetworkKey = key
    for session in activeSessions() {
      let generation = session.generation
      for (id, callback) in Array(session.listeners) {
        guard session.started, !session.released, session.generation == generation, session.listeners[id] != nil else { continue }
        callback(network)
      }
    }
  }

  fileprivate func connect(_ session: WifiSession, params: WifiConnectionParams) -> WifiFuture<WifiNetworkInfo> {
    let operation = WifiConnectOperation(session, params)
    main { [self, operation] in
      do {
        try session.requireStarted()
        try self.validate(params)
        if let error = self.system.availabilityError() { throw error }
        guard self.connection == nil else { throw wifiError(12004, "E_WIFI_DUPLICATE_REQUEST", "A system Wi-Fi request is still pending") }
        for lease in self.configurations.values where !lease.owners.subtracting([session.id]).isEmpty {
          guard lease.params.sameConfiguration(as: params) else {
            throw wifiError(12004, "E_WIFI_CONNECTION_OWNED", "Another session owns a different device hotspot")
          }
        }
        operation.generation = session.generation
        self.connection = operation
        operation.cancelTimeout = self.schedule(self.connectionTimeout) { [weak self, weak operation] in
          guard let self, let operation else { return }
          self.main { self.finish(operation, .failure(wifiError(12010, "E_WIFI_CONNECTION_UNCONFIRMED", "The current SSID could not be confirmed before the deadline"))) }
        }
        self.system.fetchCurrent { network in self.main {
          guard self.isLive(operation) else { return }
          if let network, network.SSID == params.SSID {
            self.succeed(operation, network)
          } else { self.prepareConfiguration(operation) }
        } }
      } catch { operation.output.reject(withError: error) }
    }
    return operation.output
  }
  private func validate(_ params: WifiConnectionParams) throws {
    guard !params.SSID.isEmpty, params.SSID.utf8.count <= 32, !params.SSID.contains("\u{0}") else {
      throw wifiError(12008, "E_WIFI_INVALID_SSID", "SSID must contain 1 to 32 UTF-8 bytes")
    }
    guard params.BSSID.isEmpty else { throw wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", "iOS cannot constrain a connection to a BSSID") }
    guard !params.maunal else { throw wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", "iOS has no public URL for the Wi-Fi Settings page; select the device hotspot in Settings") }
    if !params.password.isEmpty {
      let bytes = Array(params.password.utf8)
      let asciiPassphrase = (8...63).contains(bytes.count) && bytes.allSatisfy { (0x20...0x7e).contains($0) }
      let hexKey = bytes.count == 64 && bytes.allSatisfy { (0x30...0x39).contains($0) || (0x41...0x46).contains($0) || (0x61...0x66).contains($0) }
      guard asciiPassphrase || hexKey else { throw wifiError(12014, "E_WIFI_INVALID_PASSWORD", "Use an open network or a valid WPA/WPA2 Personal password") }
    }
  }
  private func isLive(_ operation: WifiConnectOperation) -> Bool {
    connection === operation && !operation.ended && !operation.session.released && operation.session.started && operation.session.generation == operation.generation
  }
  private func prepareConfiguration(_ operation: WifiConnectOperation) {
    system.configuredSSIDs { SSIDs in self.main {
      guard self.isLive(operation) else { return }
      let SSID = operation.params.SSID
      let lease = self.configurations[SSID]
      if SSIDs.contains(SSID) && lease == nil {
        self.finish(operation, .failure(wifiError(12004, "E_WIFI_CONNECTION_OWNED", "This app already configured this SSID outside this Wi-Fi core")))
        return
      }
      if let lease {
        guard lease.params.sameConfiguration(as: operation.params) else {
          self.finish(operation, .failure(wifiError(12004, "E_WIFI_CONNECTION_OWNED", "The existing device hotspot uses a different configuration")))
          return
        }
        // Sharing an owned network must not reconfigure or briefly disconnect its other callers.
        self.verifyConnection(operation)
        return
      }
      operation.applying = true
      self.system.apply(operation.params) { result in self.main {
        operation.applying = false
        if case .success(.configured) = result { operation.createdConfiguration = true }
        guard self.isLive(operation) else {
          self.cleanupConfiguration(operation)
          if self.connection === operation { self.connection = nil }
          return
        }
        switch result {
        case .success: self.verifyConnection(operation)
        case .failure(let error): self.finish(operation, .failure(error))
        }
      } }
    } }
  }
  private func verifyConnection(_ operation: WifiConnectOperation) {
    guard isLive(operation) else { return }
    system.fetchCurrent { [self, operation] network in self.main {
      guard self.isLive(operation) else { return }
      if let network, network.SSID == operation.params.SSID {
        self.succeed(operation, network)
      } else {
        operation.cancelPoll = self.schedule(self.pollInterval) { [weak self, weak operation] in
          guard let self, let operation else { return }
          self.main { self.verifyConnection(operation) }
        }
      }
    } }
  }
  private func succeed(_ operation: WifiConnectOperation, _ network: WifiNetworkInfo) {
    guard isLive(operation) else { return }
    if operation.createdConfiguration {
      // All OS calls are serialized through this core, so only the creator may acquire this lease.
      let lease = WifiConfigurationLease(operation.params)
      lease.owners.insert(operation.session.id)
      configurations[operation.params.SSID] = lease
      operation.createdConfiguration = false
    } else if let lease = configurations[operation.params.SSID], lease.params.sameConfiguration(as: operation.params) {
      lease.owners.insert(operation.session.id)
    }
    // Replacing a session's own hotspot relinquishes its prior leases only after the new SSID is confirmed.
    for SSID in Array(configurations.keys) where SSID != operation.params.SSID {
      configurations[SSID]?.owners.remove(operation.session.id)
      if configurations[SSID]?.owners.isEmpty == true {
        configurations.removeValue(forKey: SSID)
        system.removeConfiguration(SSID: SSID)
      }
    }
    finish(operation, .success(operation.params.partialInfo ? network.partial() : network))
    if operation.session.started, !operation.session.released, operation.session.generation == operation.generation { publish(network) }
  }
  private func cleanupConfiguration(_ operation: WifiConnectOperation) {
    guard operation.createdConfiguration else { return }
    operation.createdConfiguration = false
    // Never remove a pre-existing app configuration, or a live lease acquired by a different session.
    if configurations[operation.params.SSID] == nil { system.removeConfiguration(SSID: operation.params.SSID) }
  }
  private func finish(_ operation: WifiConnectOperation, _ result: Result<WifiNetworkInfo, Error>) {
    guard connection === operation, !operation.ended else { return }
    operation.ended = true
    operation.cancelTimeout?(); operation.cancelTimeout = nil
    operation.cancelPoll?(); operation.cancelPoll = nil
    if case .failure = result { cleanupConfiguration(operation) }
    // apply has no cancellation API. Keep its slot until the OS callback arrives, then clean a late join.
    if !operation.applying { connection = nil }
    switch result {
    case .success(let value): operation.output.resolve(withResult: value)
    case .failure(let error): operation.output.reject(withError: error)
    }
  }

  fileprivate func read(_ session: WifiSession, partialInfo: Bool) -> WifiFuture<WifiNetworkInfo> {
    tracked(session, requiresStart: true, timeout: 10) { _, complete in
      if let error = self.system.availabilityError() { complete(.failure(error)); return }
      let generation = session.generation
      self.system.fetchCurrent { network in self.main {
        guard session.started, !session.released, session.generation == generation else { return }
        if let network { complete(.success(partialInfo ? network.partial() : network)) }
        else { complete(.failure(self.system.infoUnavailableError())) }
      } }
    }
  }
  fileprivate func permission(_ session: WifiSession, request: Bool) -> WifiFuture<WifiLocationPermissionState> {
    tracked(session, requiresStart: false, timeout: request ? 60 : 10) { _, complete in
      if request { self.system.requestLocationPermission().observe { result in self.main { complete(result) } } }
      else { complete(.success(self.system.getLocationPermissionState())) }
    }
  }
  private func tracked<T>(_ session: WifiSession, requiresStart: Bool, timeout: TimeInterval,
    action: @escaping (WifiFuture<T>, @escaping (Result<T, Error>) -> Void) -> Void) -> WifiFuture<T> {
    let output = WifiFuture<T>()
    main {
      do {
        if requiresStart { try session.requireStarted() } else if session.released { throw session.releaseError }
        let token = UUID(), generation = session.generation
        var cancelTimeout: (() -> Void)?
        let complete: (Result<T, Error>) -> Void = { result in
          guard session.pending.removeValue(forKey: token) != nil else { return }
          cancelTimeout?()
          guard !session.released, session.generation == generation else { output.reject(withError: session.releaseError); return }
          switch result { case .success(let value): output.resolve(withResult: value); case .failure(let error): output.reject(withError: error) }
        }
        session.pending[token] = { error in cancelTimeout?(); output.reject(withError: error) }
        cancelTimeout = self.schedule(timeout) { self.main { complete(.failure(wifiError(12010, "E_WIFI_SYSTEM_TIMEOUT", "The system did not answer this Wi-Fi request"))) } }
        action(output, complete)
      } catch { output.reject(withError: error) }
    }
    return output
  }
  fileprivate func listen(_ session: WifiSession, callback: @escaping (WifiNetworkInfo) -> Void) throws -> Double {
    try sync {
      guard !session.released else { throw session.releaseError }
      let id = nextListenerId; nextListenerId += 1
      session.listeners[id] = callback
      return id
    }
  }
}

public final class WifiSession {
  fileprivate let core: WifiCore
  fileprivate let id = UUID()
  fileprivate var generation: UInt64 = 0
  fileprivate var released = false
  fileprivate var started = false
  fileprivate var pending: [UUID: (Error) -> Void] = [:]
  fileprivate var listeners: [Double: (WifiNetworkInfo) -> Void] = [:]
  fileprivate var releaseError: Error { wifiError(12010, "E_WIFI_SESSION_RELEASED", "Session released") }
  fileprivate var stoppedError: Error { wifiError(12000, "E_WIFI_NOT_INITIALIZED", "Wi-Fi session stopped") }
  fileprivate init(core: WifiCore) { self.core = core }
  deinit {
    let core = core, id = id
    core.main { core.discardSession(id) }
  }
  fileprivate func requireStarted() throws {
    guard !released else { throw releaseError }
    guard started else { throw wifiError(12000, "E_WIFI_NOT_INITIALIZED", "Call startWifi before using Wi-Fi") }
  }
  public func startWifi() -> WifiFuture<Void> { core.start(self) }
  public func stopWifi() -> WifiFuture<Void> { core.stop(self, release: false) }
  public func connectWifi(params: WifiConnectionParams) -> WifiFuture<WifiNetworkInfo> { core.connect(self, params: params) }
  public func getConnectedWifi(partialInfo: Bool = false) -> WifiFuture<WifiNetworkInfo> { core.read(self, partialInfo: partialInfo) }
  public func getWifiList() -> WifiFuture<Void> { unsupported("iOS cannot scan nearby Wi-Fi networks through a public API") }
  public func setWifiList(wifiList: [WifiCredentialModel]) -> WifiFuture<Void> { unsupported("iOS candidate lists require the restricted Hotspot Helper entitlement") }
  private func unsupported(_ message: String) -> WifiFuture<Void> {
    let output = WifiFuture<Void>()
    core.main {
      do { try self.requireStarted(); output.reject(withError: wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", message)) }
      catch { output.reject(withError: error) }
    }
    return output
  }
  public func onWifiConnected(_ callback: @escaping (WifiNetworkInfo) -> Void) throws -> Double { try core.listen(self, callback: callback) }
  public func removeWifiConnectedListener(subscriptionId: Double) { core.main { self.listeners.removeValue(forKey: subscriptionId) } }
  public func onGetWifiList(_ callback: @escaping ([WifiNetworkInfo]) -> Void) throws -> Double {
    try core.sync {
      guard !released else { throw releaseError }
      throw wifiError(12001, "E_WIFI_SYSTEM_NOT_SUPPORTED", "iOS cannot observe nearby Wi-Fi lists through a public API")
    }
  }
  public func removeGetWifiListListener(subscriptionId: Double) {}
  public func getLocationPermissionState() -> WifiFuture<WifiLocationPermissionState> { core.permission(self, request: false) }
  public func requestLocationPermission() -> WifiFuture<WifiLocationPermissionState> { core.permission(self, request: true) }
  public func release() { _ = core.stop(self, release: true) }
}
