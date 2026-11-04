// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/Scanner.swift.
import AVFoundation
import UIKit

public struct ScannerResult {
  public let value: String
  public let type: String

  public init(value: String, type: String) {
    self.value = value
    self.type = type
  }
}

/// Reusable camera scanner. Navigation and interpretation of results belong to its caller.
@MainActor
public final class ScannerView: UIView {
  public var active = false {
    didSet {
      guard active != oldValue else { return }
      if active { didReportResult = false }
      reconcileCamera()
    }
  }
  public var topInset: CGFloat = 0 { didSet { setNeedsLayout() } }
  public var bottomInset: CGFloat = 0 { didSet { setNeedsLayout() } }
  public var errorMessage = "" { didSet { reconcileCamera(); renderState() } }
  public var onScan: ((ScannerResult) -> Void)?
  public var onBack: (() -> Void)?

  private let camera = ScannerCamera()
  private let preview = AVCaptureVideoPreviewLayer()
  private let scrim = CAShapeLayer()
  private let corners = CAShapeLayer()
  private let scanLine = CAGradientLayer()
  private let titleLabel = UILabel()
  private let backButton = UIButton(type: .system)
  private let torchButton = UIButton(type: .system)
  private let torchLabel = UILabel()
  private let statePanel = UIView()
  private let stateIcon = UIImageView(image: UIImage(systemName: "camera", withConfiguration:
    UIImage.SymbolConfiguration(pointSize: 32, weight: .regular)))
  private let stateTitle = UILabel()
  private let stateMessage = UILabel()
  private lazy var stateButton = ActionButton(title: "返回", identifier: "scanner-state-action") { [weak self] in
    self?.performStateAction()
  }
  private var state: ScannerCameraState = .idle
  private var stateAction: ScannerStateAction = .retry
  private var observers: [NSObjectProtocol] = []
  private var foreground = UIApplication.shared.applicationState == .active
  private var didReportResult = false
  private var torchEnabled = false
  private var generation = 0
  private var requestedRunning = false
  private var animationRect = CGRect.zero

  public override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    clipsToBounds = true
    preview.session = camera.session
    preview.videoGravity = .resizeAspectFill
    layer.addSublayer(preview)
    scrim.fillColor = UIColor(white: 0, alpha: 0.42).cgColor
    scrim.fillRule = .evenOdd
    layer.addSublayer(scrim)
    corners.strokeColor = UiDesign.media.text.cgColor
    corners.fillColor = UIColor.clear.cgColor
    corners.lineWidth = 3
    layer.addSublayer(corners)
    scanLine.colors = [UiDesign.palette.blueLight.withAlphaComponent(0).cgColor,
                       UiDesign.palette.blueLight.cgColor, UiDesign.palette.blueLight.withAlphaComponent(0).cgColor]
    scanLine.startPoint = CGPoint(x: 0, y: 0.5)
    scanLine.endPoint = CGPoint(x: 1, y: 0.5)
    layer.addSublayer(scanLine)

    titleLabel.text = "扫一扫"
    titleLabel.font = .systemFont(ofSize: UiDesign.font.nav, weight: .bold)
    titleLabel.textAlignment = .center
    titleLabel.textColor = UiDesign.media.text
    addSubview(titleLabel)
    backButton.setImage(UIImage(systemName: "chevron.left"), for: .normal)
    backButton.tintColor = UiDesign.media.text
    backButton.accessibilityLabel = "返回"
    backButton.addTarget(self, action: #selector(goBack), for: .touchUpInside)
    addSubview(backButton)
    torchButton.tintColor = UiDesign.media.text
    torchButton.backgroundColor = UIColor(white: 1, alpha: 0.18)
    torchButton.addTarget(self, action: #selector(toggleTorch), for: .touchUpInside)
    addSubview(torchButton)
    torchLabel.textColor = UiDesign.media.text
    torchLabel.textAlignment = .center
    torchLabel.font = .systemFont(ofSize: UiDesign.font.content)
    addSubview(torchLabel)
    updateTorch(false)

    statePanel.backgroundColor = UiTheme.page
    addSubview(statePanel)
    stateIcon.contentMode = .scaleAspectFit
    stateIcon.tintColor = UiTheme.muted
    stateIcon.isAccessibilityElement = false
    statePanel.addSubview(stateIcon)
    stateTitle.font = .systemFont(ofSize: UiDesign.font.sheetTitle, weight: .semibold)
    stateTitle.textColor = UiTheme.text
    stateTitle.textAlignment = .center
    stateTitle.numberOfLines = 0
    statePanel.addSubview(stateTitle)
    stateMessage.font = .systemFont(ofSize: UiDesign.font.title)
    stateMessage.textColor = UiTheme.muted
    stateMessage.textAlignment = .center
    stateMessage.numberOfLines = 0
    statePanel.addSubview(stateMessage)
    stateButton.translatesAutoresizingMaskIntoConstraints = true
    statePanel.addSubview(stateButton)
    // Keep the native header above the failure surface so Back is always available.
    bringSubviewToFront(titleLabel)
    bringSubviewToFront(backButton)

    camera.onState = { [weak self] generation, state in
      guard let self, self.generation == generation, self.requestedRunning else { return }
      self.state = state
      self.renderState()
      self.setNeedsLayout()
    }
    camera.onResult = { [weak self] generation, result in
      guard let self, self.generation == generation, self.requestedRunning, !self.didReportResult else { return }
      self.didReportResult = true
      self.reconcileCamera()
      self.onScan?(result)
    }
    camera.onTorch = { [weak self] generation, enabled in
      guard let self, self.generation == generation else { return }
      self.updateTorch(enabled)
    }
    // Follows the scene it is shown in; other scenes' activation doesn't concern this camera.
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) { [weak self] note in
      self?.sceneChanged(note, active: false)
    })
    observers.append(center.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] note in
      self?.sceneChanged(note, active: true)
    })
    renderState()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(frame:)") }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
    camera.stop()
  }

  private func sceneChanged(_ note: Notification, active: Bool) {
    if let scene = window?.windowScene, note.object as? UIScene !== scene { return }
    foreground = active
    reconcileCamera()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if let scene = window?.windowScene { foreground = scene.activationState == .foregroundActive }
    reconcileCamera()
  }

  public override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    setNeedsLayout()
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    let top = max(safeAreaInsets.top, max(0, topInset))
    let bottom = max(safeAreaInsets.bottom, max(0, bottomInset))
    let left = safeAreaInsets.left + UiDesign.space.content
    let right = safeAreaInsets.right + UiDesign.space.content
    let contentWidth = max(0, bounds.width - left - right)
    let headerHeight = UiDesign.size.navNative
    backButton.frame = CGRect(x: safeAreaInsets.left + UiDesign.space.sm, y: top + (headerHeight - UiDesign.size.back) / 2,
                              width: UiDesign.size.back, height: UiDesign.size.back)
    titleLabel.frame = CGRect(x: left + UiDesign.size.back, y: top, width: max(0, contentWidth - UiDesign.size.back * 2), height: headerHeight)
    let areaTop = min(bounds.height, top + headerHeight + UiDesign.space.md)
    let areaBottom = max(areaTop, bounds.height - bottom - UiDesign.space.lg)
    let availableHeight = max(0, areaBottom - areaTop)
    // Reserve 36pt more below the scan frame, lifting the centered controls by 18pt.
    let torchHeight: CGFloat = min(120, availableHeight)
    let side = max(0, min(280, contentWidth, availableHeight - torchHeight - UiDesign.space.content))
    let contentCenter = left + contentWidth / 2
    let scanRect = CGRect(x: contentCenter - side / 2, y: areaTop + max(0, (availableHeight - side - torchHeight - UiDesign.space.content) / 2),
                          width: side, height: side)
    let torchSize = min(56, torchHeight)
    torchButton.frame = CGRect(x: contentCenter - torchSize / 2, y: scanRect.maxY + min(UiDesign.space.content, max(0, availableHeight - side - torchHeight)),
                               width: torchSize, height: torchSize)
    torchButton.layer.cornerRadius = torchSize / 2
    torchLabel.frame = CGRect(x: left, y: torchButton.frame.maxY + 8, width: contentWidth,
                             height: min(20, max(0, torchHeight - torchSize - 8)))

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    preview.frame = bounds
    scrim.frame = bounds
    corners.frame = bounds
    let shade = UIBezierPath(rect: bounds)
    shade.append(UIBezierPath(rect: scanRect))
    scrim.path = shade.cgPath
    corners.path = cornerPath(scanRect).cgPath
    scanLine.frame = CGRect(x: scanRect.minX + 3, y: scanRect.minY + 3, width: max(0, side - 6), height: 2)
    CATransaction.commit()
    if let connection = preview.connection, connection.isVideoOrientationSupported {
      connection.videoOrientation = captureOrientation()
    }
    camera.updateRegion(preview.metadataOutputRectConverted(fromLayerRect: scanRect), orientation: captureOrientation())
    if animationRect != scanRect {
      animationRect = scanRect
      scanLine.removeAnimation(forKey: "scan")
    }
    updateScanAnimation()

    let panelTop = min(bounds.height, top + headerHeight)
    statePanel.frame = CGRect(x: 0, y: panelTop, width: bounds.width, height: max(0, bounds.height - panelTop))
    let messageWidth = min(UiDesign.size.dialogWidth, contentWidth)
    let titleHeight = stateTitle.sizeThatFits(CGSize(width: messageWidth, height: .greatestFiniteMagnitude)).height
    let messageHeight = stateMessage.sizeThatFits(CGSize(width: messageWidth, height: .greatestFiniteMagnitude)).height
    let totalHeight = UiDesign.size.back + titleHeight + messageHeight + UiDesign.space.lg * 3 + UiDesign.size.button
    let stateTop = UiDesign.space.md + max(0, (availableHeight - totalHeight) / 2)
    stateIcon.frame = CGRect(x: contentCenter - UiDesign.size.back / 2, y: stateTop,
                            width: UiDesign.size.back, height: UiDesign.size.back)
    stateTitle.frame = CGRect(x: contentCenter - messageWidth / 2, y: stateIcon.frame.maxY + UiDesign.space.lg, width: messageWidth, height: titleHeight)
    stateMessage.frame = CGRect(x: contentCenter - messageWidth / 2, y: stateTitle.frame.maxY + UiDesign.space.lg, width: messageWidth, height: messageHeight)
    stateButton.frame = CGRect(x: contentCenter - min(180, messageWidth) / 2, y: stateMessage.frame.maxY + UiDesign.space.lg,
                               width: min(180, messageWidth), height: UiDesign.size.button)
  }

  private func cornerPath(_ rect: CGRect) -> UIBezierPath {
    let path = UIBezierPath()
    let length = min(22, rect.width / 4)
    for (x, y, dx, dy) in [(rect.minX, rect.minY, CGFloat(1), CGFloat(1)),
                           (rect.maxX, rect.minY, CGFloat(-1), CGFloat(1)),
                           (rect.minX, rect.maxY, CGFloat(1), CGFloat(-1)),
                           (rect.maxX, rect.maxY, CGFloat(-1), CGFloat(-1))] {
      path.move(to: CGPoint(x: x + dx * length, y: y))
      path.addLine(to: CGPoint(x: x, y: y))
      path.addLine(to: CGPoint(x: x, y: y + dy * length))
    }
    return path
  }

  private func captureOrientation() -> AVCaptureVideoOrientation {
    switch window?.windowScene?.interfaceOrientation {
    case .landscapeLeft: return .landscapeLeft
    case .landscapeRight: return .landscapeRight
    case .portraitUpsideDown: return .portraitUpsideDown
    default: return .portrait
    }
  }

  private func reconcileCamera() {
    let shouldRun = active && window != nil && foreground && !didReportResult && errorMessage.isEmpty
    guard shouldRun != requestedRunning else { updateScanAnimation(); return }
    requestedRunning = shouldRun
    generation += 1
    updateTorch(false)
    if shouldRun {
      state = .loading
      camera.start(generation: generation)
    } else {
      state = .idle
      camera.stop()
    }
    renderState()
  }

  private func renderState() {
    var failure: (String, String, String, ScannerStateAction)?
    if !errorMessage.isEmpty {
      failure = ("暂时无法完成扫码", errorMessage, "返回", .back)
    } else if case let .failure(title, message, actionTitle, action) = state {
      failure = (title, message, actionTitle, action)
    }
    statePanel.isHidden = failure == nil
    if let failure {
      stateTitle.text = failure.0
      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = .center
      paragraph.minimumLineHeight = 22
      paragraph.maximumLineHeight = 22
      stateMessage.attributedText = NSAttributedString(string: failure.1, attributes: [
        .font: UIFont.systemFont(ofSize: UiDesign.font.title), .foregroundColor: UiTheme.muted, .paragraphStyle: paragraph,
      ])
      stateButton.title = failure.2
      stateAction = failure.3
    }
    titleLabel.textColor = UiDesign.media.text
    backButton.tintColor = UiDesign.media.text
    var torchAvailable = false
    if case let .running(hasTorch) = state { torchAvailable = hasTorch }
    torchButton.isHidden = failure != nil || !torchAvailable
    torchLabel.isHidden = torchButton.isHidden
    corners.isHidden = failure != nil
    updateScanAnimation()
    setNeedsLayout()
  }

  private func updateScanAnimation() {
    let running: Bool
    if case .running = state { running = true } else { running = false }
    scanLine.isHidden = !running || !requestedRunning || !errorMessage.isEmpty || animationRect.height < 8
    if scanLine.isHidden {
      scanLine.removeAnimation(forKey: "scan")
    } else if scanLine.animation(forKey: "scan") == nil {
      let animation = CABasicAnimation(keyPath: "transform.translation.y")
      animation.fromValue = 0
      animation.toValue = max(0, animationRect.height - 8)
      animation.duration = 2
      animation.autoreverses = true
      animation.repeatCount = .infinity
      animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      scanLine.add(animation, forKey: "scan")
    }
  }

  private func updateTorch(_ enabled: Bool) {
    torchEnabled = enabled
    torchButton.setImage(UIImage(systemName: enabled ? "flashlight.on.fill" : "flashlight.off.fill",
                                withConfiguration: UIImage.SymbolConfiguration(pointSize: 26, weight: .regular)), for: .normal)
    torchButton.backgroundColor = enabled ? UiTheme.primary : UiDesign.media.torchOff
    torchLabel.text = enabled ? "轻触关闭" : "轻触照亮"
    torchButton.accessibilityLabel = torchLabel.text
    torchButton.accessibilityValue = enabled ? "已开启" : "已关闭"
  }

  @objc private func toggleTorch() {
    guard requestedRunning else { return }
    camera.setTorch(!torchEnabled, generation: generation)
  }

  @objc private func goBack() { onBack?() }

  @objc private func performStateAction() {
    switch stateAction {
    case .back: onBack?()
    case .settings:
      if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    case .retry:
      guard requestedRunning else { return }
      generation += 1
      state = .loading
      renderState()
      camera.start(generation: generation)
    }
  }
}

private enum ScannerStateAction { case settings, retry, back }
private enum ScannerCameraState {
  case idle, loading
  case running(hasTorch: Bool)
  case failure(String, String, String, ScannerStateAction)
}

/// All session configuration, capture and torch operations are serialized off the main thread.
private final class ScannerCamera: NSObject, AVCaptureMetadataOutputObjectsDelegate {
  let session = AVCaptureSession()
  var onState: ((Int, ScannerCameraState) -> Void)?
  var onResult: ((Int, ScannerResult) -> Void)?
  var onTorch: ((Int, Bool) -> Void)?
  private let queue = DispatchQueue(label: "NativeRoutesUI.Scanner.camera", qos: .userInitiated)
  private var device: AVCaptureDevice?
  private var output: AVCaptureMetadataOutput?
  private var configured = false
  private var desiredRunning = false
  private var generation = 0
  private var reported = false
  private var permissionPending = false
  private var region = CGRect(x: 0, y: 0, width: 1, height: 1)
  private var orientation: AVCaptureVideoOrientation = .portrait
  private var observers: [NSObjectProtocol] = []

  override init() {
    super.init()
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: .AVCaptureSessionWasInterrupted, object: session, queue: nil) { [weak self] _ in
      self?.queue.async { [weak self] in
        guard let self, self.desiredRunning else { return }
        self.turnTorchOff()
        self.publish(.failure("相机暂时不可用", "相机被其他应用占用或已中断，请稍后重试。", "重试", .retry))
      }
    })
    observers.append(center.addObserver(forName: .AVCaptureSessionInterruptionEnded, object: session, queue: nil) { [weak self] _ in
      self?.queue.async { [weak self] in
        guard let self, self.desiredRunning, !self.reported else { return }
        self.authorizeAndStart()
      }
    })
    observers.append(center.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: nil) { [weak self] _ in
      self?.queue.async { [weak self] in
        guard let self, self.desiredRunning else { return }
        self.turnTorchOff()
        if self.session.isRunning { self.session.stopRunning() }
        self.publish(.failure("相机启动失败", "无法使用相机，请重试或返回。", "重试", .retry))
      }
    })
  }

  deinit { observers.forEach(NotificationCenter.default.removeObserver) }

  func start(generation: Int) {
    queue.async { [weak self] in
      guard let self else { return }
      self.generation = generation
      self.desiredRunning = true
      self.reported = false
      self.authorizeAndStart()
    }
  }

  func stop() {
    // Retain the capture owner until its resources have been shut down, even during view deinit.
    queue.async {
      self.desiredRunning = false
      self.turnTorchOff()
      if self.session.isRunning { self.session.stopRunning() }
    }
  }

  private func authorizeAndStart() {
    guard desiredRunning else { return }
    #if targetEnvironment(simulator)
    publish(.failure("当前设备没有可用相机", "模拟器无法扫码，请在配备相机的 iPhone 上使用。", "返回", .back))
    return
    #else
    guard let usage = Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String,
          !usage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      publish(.failure("相机配置不完整", "此应用尚未配置相机权限说明，请联系应用开发者。", "返回", .back))
      return
    }
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: startAuthorized()
    case .notDetermined:
      guard !permissionPending else { return }
      permissionPending = true
      AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in
        self?.queue.async { [weak self] in
          guard let self else { return }
          self.permissionPending = false
          self.authorizeAndStart()
        }
      }
    case .denied:
      publish(.failure("需要相机权限", "请在系统设置中允许此应用访问相机，然后返回继续扫码。", "打开设置", .settings))
    case .restricted:
      publish(.failure("相机访问受限", "当前设备限制了相机访问，请检查系统限制或联系设备管理员。", "返回", .back))
    @unknown default:
      publish(.failure("相机暂时不可用", "无法确认相机权限，请稍后重试。", "重试", .retry))
    }
    #endif
  }

  private func startAuthorized() {
    guard desiredRunning, !reported else { return }
    if !configured {
      guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
        publish(.failure("当前设备没有可用相机", "请在配备后置相机的设备上使用扫码。", "返回", .back))
        return
      }
      do {
        let input = try AVCaptureDeviceInput(device: camera)
        let metadata = AVCaptureMetadataOutput()
        session.beginConfiguration()
        if session.canSetSessionPreset(.high) { session.sessionPreset = .high }
        guard session.canAddInput(input) else {
          session.commitConfiguration()
          publish(.failure("相机启动失败", "无法连接后置相机，请稍后重试。", "重试", .retry))
          return
        }
        session.addInput(input)
        guard session.canAddOutput(metadata) else {
          session.removeInput(input)
          session.commitConfiguration()
          publish(.failure("当前设备不支持扫码", "无法启用条码识别，请在其他设备上重试。", "返回", .back))
          return
        }
        session.addOutput(metadata)
        metadata.setMetadataObjectsDelegate(self, queue: queue)
        let types: [AVMetadataObject.ObjectType] = [.qr, .ean13, .ean8, .code128, .code39]
        metadata.metadataObjectTypes = types.filter { metadata.availableMetadataObjectTypes.contains($0) }
        guard !metadata.metadataObjectTypes.isEmpty else {
          session.removeOutput(metadata)
          session.removeInput(input)
          session.commitConfiguration()
          publish(.failure("当前设备不支持扫码", "无法启用条码识别，请在其他设备上重试。", "返回", .back))
          return
        }
        device = camera
        output = metadata
        configured = true
        session.commitConfiguration()
      } catch {
        publish(.failure("相机启动失败", "无法连接后置相机，请稍后重试。", "重试", .retry))
        return
      }
    }
    applyRegion()
    if !session.isRunning { session.startRunning() }
    guard session.isRunning else {
      publish(.failure("相机启动失败", "相机尚未就绪，请稍后重试。", "重试", .retry))
      return
    }
    publish(.running(hasTorch: device?.hasTorch == true && device?.isTorchAvailable == true))
  }

  func updateRegion(_ region: CGRect, orientation: AVCaptureVideoOrientation) {
    queue.async { [weak self] in
      guard let self else { return }
      let clipped = region.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      guard !clipped.isNull, !clipped.isEmpty else { return }
      self.region = clipped
      self.orientation = orientation
      self.applyRegion()
    }
  }

  private func applyRegion() {
    if let connection = output?.connection(with: .video), connection.isVideoOrientationSupported {
      connection.videoOrientation = orientation
    }
    output?.rectOfInterest = region
  }

  func setTorch(_ enabled: Bool, generation: Int) {
    queue.async { [weak self] in
      guard let self, self.generation == generation, self.desiredRunning, !self.reported,
            self.session.isRunning, let device = self.device, device.hasTorch, device.isTorchAvailable else { return }
      do {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        if enabled { try device.setTorchModeOn(level: min(1, AVCaptureDevice.maxAvailableTorchLevel)) }
        else { device.torchMode = .off }
        DispatchQueue.main.async { [weak self] in self?.onTorch?(generation, enabled) }
      } catch {
        self.turnTorchOff()
        if self.session.isRunning { self.session.stopRunning() }
        self.publish(.failure("手电筒暂时不可用", "无法开启照明，请稍后重试。", "重试", .retry))
      }
    }
  }

  private func turnTorchOff() {
    guard let device, device.hasTorch else { return }
    do {
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      device.torchMode = .off
    } catch { /* Capture shutdown still proceeds if the camera is no longer available. */ }
    let generation = generation
    DispatchQueue.main.async { [weak self] in self?.onTorch?(generation, false) }
  }

  private func publish(_ state: ScannerCameraState) {
    let generation = generation
    DispatchQueue.main.async { [weak self] in self?.onState?(generation, state) }
  }

  func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
    guard desiredRunning, !reported, session.isRunning, !session.isInterrupted else { return }
    for case let object as AVMetadataMachineReadableCodeObject in metadataObjects {
      guard let raw = object.stringValue, !raw.isEmpty else { continue }
      let type: String
      var value = raw
      switch object.type {
      case .qr: type = "qr"
      case .ean13:
        // AVFoundation represents UPC-A as EAN-13 with an extra leading zero.
        if raw.count == 13 && raw.hasPrefix("0") { type = "upc_a"; value = String(raw.dropFirst()) }
        else { type = "ean13" }
      case .ean8: type = "ean8"
      case .code128: type = "code128"
      case .code39: type = "code39"
      default: continue
      }
      reported = true
      turnTorchOff()
      if session.isRunning { session.stopRunning() }
      let result = ScannerResult(value: value, type: type)
      let generation = generation
      DispatchQueue.main.async { [weak self] in self?.onResult?(generation, result) }
      return
    }
  }
}
