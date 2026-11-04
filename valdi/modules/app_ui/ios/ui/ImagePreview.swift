// From ExpoNativeRoutes ios/native/ui/Sources/NativeRoutesUI/ImagePreview.swift.
import UIKit

@MainActor
private final class PreviewZoomPage: UIScrollView, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  private let imageView = UIImageView()
  private let message = UILabel()
  private let retry = UIButton(type: .system)
  private let imageLoader: NativeImageLoading.Loader
  private var cancelLoad: (() -> Void)?
  private var generation = 0
  private var source: URL?
  private var loading = false
  private var lastSize = CGSize.zero
  var onTap: (() -> Void)?

  init(source: URL?, imageLoader: @escaping NativeImageLoading.Loader) {
    self.source = source
    self.imageLoader = imageLoader
    super.init(frame: .zero)
    backgroundColor = .clear
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    contentInsetAdjustmentBehavior = .never
    minimumZoomScale = 1
    maximumZoomScale = 4
    delegate = self

    imageView.contentMode = .scaleAspectFit
    imageView.backgroundColor = .clear
    addSubview(imageView)

    message.textColor = UiDesign.media.text
    message.font = .systemFont(ofSize: UiDesign.font.title)
    message.textAlignment = .center
    message.numberOfLines = 0
    message.translatesAutoresizingMaskIntoConstraints = false
    addSubview(message)

    retry.setTitle("重新加载", for: .normal)
    retry.setImage(UIImage(systemName: "arrow.clockwise", withConfiguration:
      UIImage.SymbolConfiguration(pointSize: 14, weight: .semibold)), for: .normal)
    retry.setTitleColor(UiDesign.media.text, for: .normal)
    retry.tintColor = UiDesign.media.text
    retry.titleLabel?.font = .systemFont(ofSize: UiDesign.font.title, weight: .semibold)
    retry.addAction(UIAction { [weak self] _ in self?.load() }, for: .touchUpInside)
    retry.translatesAutoresizingMaskIntoConstraints = false
    addSubview(retry)

    NSLayoutConstraint.activate([
      message.centerXAnchor.constraint(equalTo: centerXAnchor),
      message.centerYAnchor.constraint(equalTo: centerYAnchor),
      message.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 24),
      message.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -24),
      retry.topAnchor.constraint(equalTo: message.bottomAnchor, constant: 12),
      retry.centerXAnchor.constraint(equalTo: centerXAnchor),
      retry.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
    ])
    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(toggleZoom(_:)))
    doubleTap.numberOfTapsRequired = 2
    addGestureRecognizer(doubleTap)
    let tap = UITapGestureRecognizer(target: self, action: #selector(singleTap))
    tap.delegate = self
    tap.require(toFail: doubleTap)
    tap.cancelsTouchesInView = false
    addGestureRecognizer(tap)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.size != lastSize else { return }
    lastSize = bounds.size
    if zoomScale != minimumZoomScale { setZoomScale(minimumZoomScale, animated: false) }
    layoutImage()
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { imageView.image == nil ? nil : imageView }

  func scrollViewDidZoom(_ scrollView: UIScrollView) { centerImage() }

  func cancelRequest() {
    generation += 1
    let cancel = cancelLoad
    cancelLoad = nil
    loading = false
    cancel?()
  }

  func loadIfNeeded() { load() }

  override func willMove(toWindow newWindow: UIWindow?) {
    if newWindow == nil { cancelRequest() }
    super.willMove(toWindow: newWindow)
  }

  private func load() {
    guard !loading, imageView.image == nil else { return }
    guard let source else {
      message.text = "图片地址无效"
      message.isHidden = false
      retry.isHidden = true
      return
    }
    cancelRequest()
    loading = true
    message.text = "正在加载图片…"
    message.isHidden = false
    retry.isHidden = true
    let token = generation
    let cancel = imageLoader(source) { [weak self] result in
      guard let self, self.generation == token, self.loading else { return }
      switch result {
      case let .success(image): self.finish(image, failed: false)
      case .failure: self.finish(nil, failed: true)
      }
    }
    if generation == token && loading { cancelLoad = cancel }
    else if generation != token { cancel?() }
  }

  private func finish(_ image: UIImage?, failed: Bool) {
    cancelLoad = nil
    loading = false
    if let image {
      imageView.image = image
      message.isHidden = true
      retry.isHidden = true
      setZoomScale(minimumZoomScale, animated: false)
      layoutImage()
    } else {
      message.text = failed ? "图片加载失败" : "图片无法显示"
      message.isHidden = false
      retry.isHidden = false
    }
  }

  deinit { cancelLoad?() }
  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    // Filter at touch-down: retry can hide itself before a single tap is confirmed.
    var target = touch.view
    while let view = target, view !== self {
      if view is UIControl { return false }
      target = view.superview
    }
    return true
  }

  @objc private func singleTap(_ gesture: UITapGestureRecognizer) { onTap?() }

  @objc private func toggleZoom(_ recognizer: UITapGestureRecognizer) {
    guard imageView.image != nil else { return }
    if zoomScale > minimumZoomScale + 0.01 {
      setZoomScale(minimumZoomScale, animated: true)
    } else {
      let scale = min(maximumZoomScale, 2.5)
      let point = recognizer.location(in: imageView)
      let size = CGSize(width: imageView.bounds.width / scale, height: imageView.bounds.height / scale)
      let rect = CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                        width: size.width, height: size.height).intersection(imageView.bounds)
      if !rect.isNull && !rect.isEmpty { zoom(to: rect, animated: true) }
    }
  }

  private func layoutImage() {
    guard let image = imageView.image, image.size.width > 0, image.size.height > 0,
          bounds.width > 0, bounds.height > 0 else {
      imageView.frame = CGRect(origin: .zero, size: bounds.size)
      contentSize = bounds.size
      centerImage()
      return
    }
    let fitScale = min(bounds.width / image.size.width, bounds.height / image.size.height)
    let fittedSize = CGSize(width: image.size.width * fitScale, height: image.size.height * fitScale)
    imageView.frame = CGRect(origin: .zero, size: fittedSize)
    contentSize = fittedSize
    centerImage()
  }

  private func centerImage() {
    let horizontal = max(0, (bounds.width - imageView.frame.width) / 2)
    let vertical = max(0, (bounds.height - imageView.frame.height) / 2)
    contentInset = UIEdgeInsets(top: vertical, left: horizontal, bottom: vertical, right: horizontal)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError() }
}

@MainActor
final class ImagePreviewContentView: UIView, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  var onIndexChange: (Int) -> Void = { _ in }
  var onRequestClose: (DialogDismissReason) -> Void = { _ in }

  var sources: [URL?] = [] {
    didSet { if oldValue != sources { renderPages() } }
  }
  var index: Int = 0 {
    didSet { if oldValue != index { show(index, animated: false, notify: false) } }
  }
  var topInset: CGFloat? { didSet { setNeedsLayout() } }
  var active: Bool = true {
    didSet {
      isUserInteractionEnabled = active
      if active { updateRequests() } else { cancelRequests() }
    }
  }

  private(set) var dismissing = false
  private var dragOrigin = CGPoint.zero
  private lazy var dismissPan = UIPanGestureRecognizer(target: self, action: #selector(dragToDismiss(_:)))
  private let scrim = UIView()
  private let pages = UIScrollView()
  private let indexLabel = UILabel()
  private var indexTop: NSLayoutConstraint!
  private var imagePages: [PreviewZoomPage] = []
  private var current = 0
  private var lastPageSize = CGSize.zero
  private let imageLoader: NativeImageLoading.Loader

  init(imageLoader: @escaping NativeImageLoading.Loader) {
    self.imageLoader = imageLoader
    super.init(frame: .zero)
    clipsToBounds = true
    backgroundColor = .clear
    scrim.backgroundColor = .black
    scrim.translatesAutoresizingMaskIntoConstraints = false
    addSubview(scrim)

    pages.isPagingEnabled = true
    pages.showsHorizontalScrollIndicator = false
    pages.showsVerticalScrollIndicator = false
    pages.contentInsetAdjustmentBehavior = .never
    pages.backgroundColor = .clear
    pages.delegate = self
    dismissPan.maximumNumberOfTouches = 1
    dismissPan.delegate = self
    addGestureRecognizer(dismissPan)
    pages.panGestureRecognizer.require(toFail: dismissPan)
    pages.translatesAutoresizingMaskIntoConstraints = false
    addSubview(pages)

    indexLabel.font = .systemFont(ofSize: UiDesign.font.title, weight: .semibold)
    indexLabel.textColor = UiDesign.media.text
    indexLabel.textAlignment = .center
    indexLabel.backgroundColor = UIColor(white: 0.16, alpha: 0.78)
    indexLabel.layer.cornerRadius = UiDesign.radius.control
    indexLabel.layer.masksToBounds = true
    indexLabel.accessibilityTraits = .updatesFrequently
    indexLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(indexLabel)

    indexTop = indexLabel.topAnchor.constraint(equalTo: topAnchor, constant: 24)
    NSLayoutConstraint.activate([
      scrim.topAnchor.constraint(equalTo: topAnchor), scrim.bottomAnchor.constraint(equalTo: bottomAnchor),
      scrim.leadingAnchor.constraint(equalTo: leadingAnchor), scrim.trailingAnchor.constraint(equalTo: trailingAnchor),
      pages.topAnchor.constraint(equalTo: topAnchor), pages.bottomAnchor.constraint(equalTo: bottomAnchor),
      pages.leadingAnchor.constraint(equalTo: leadingAnchor), pages.trailingAnchor.constraint(equalTo: trailingAnchor),
      indexLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 60),
      indexLabel.heightAnchor.constraint(equalToConstant: 28),
      indexLabel.centerXAnchor.constraint(equalTo: centerXAnchor), indexTop,
      indexLabel.leadingAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.leadingAnchor, constant: 16),
      indexLabel.trailingAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.trailingAnchor, constant: -16),
    ])
    renderPages()
  }

  override func layoutSubviews() {
    indexTop.constant = (topInset ?? safeAreaInsets.top) + 24
    super.layoutSubviews()
    layoutPages()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { cancelRequests() } else if active { updateRequests() }
  }

  override func accessibilityPerformEscape() -> Bool {
    onRequestClose(.back)
    return true
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) { updateFromUserScroll() }
  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) { updateFromUserScroll() }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
    var target = touch.view
    while let view = target, view !== self {
      if view is UIControl { return false }
      target = view.superview
    }
    return true
  }

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === dismissPan else { return true }
    guard active, !dismissing, imagePages.indices.contains(current), !pages.isDecelerating else { return false }
    let page = imagePages[current]
    let velocity = dismissPan.velocity(in: self)
    return page.zoomScale <= page.minimumZoomScale + 0.01 && velocity.y > abs(velocity.x)
  }

  @objc private func dragToDismiss(_ gesture: UIPanGestureRecognizer) {
    let offset = gesture.translation(in: self)
    switch gesture.state {
    case .began:
      let location = gesture.location(in: self)
      dragOrigin = CGPoint(x: location.x - offset.x, y: location.y - offset.y)
      pages.isScrollEnabled = false
      fallthrough
    case .changed:
      let progress = min(1, max(0, offset.y) / max(1, bounds.height * 0.5))
      let scale = 1 - 0.25 * progress
      pages.transform = CGAffineTransform(
        translationX: offset.x + (dragOrigin.x - bounds.width / 2) * (1 - scale),
        y: max(0, offset.y) + (dragOrigin.y - bounds.height / 2) * (1 - scale)
      ).scaledBy(x: scale, y: scale)
      scrim.alpha = 1 - progress
      indexLabel.alpha = 1 - progress
    case .ended:
      let velocity = gesture.velocity(in: self).y
      if (offset.y > 40 || (offset.y > 12 && velocity > 650)) && velocity > -120 {
        dismissPreview()
      } else { restorePreview() }
    case .cancelled, .failed: restorePreview()
    default: break
    }
  }

  private func dismissPreview() {
    guard active, !dismissing else { return }
    dismissing = true
    pages.isScrollEnabled = false
    UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseOut], animations: {
      self.scrim.alpha = 0
      self.indexLabel.alpha = 0
      self.pages.alpha = 0
      self.pages.transform = self.pages.transform.scaledBy(x: 0.92, y: 0.92)
    }, completion: { [weak self] _ in
      guard let self, self.active, self.dismissing else { return }
      self.onRequestClose(.backdrop)
    })
  }

  private func restorePreview() {
    UIView.animate(withDuration: 0.22, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) {
      self.resetDismissal()
    }
  }

  private func resetDismissal() {
    dismissing = false
    pages.transform = .identity
    pages.alpha = 1
    pages.isScrollEnabled = true
    scrim.alpha = 1
    indexLabel.alpha = 1
  }

  private func updateFromUserScroll() {
    guard bounds.width > 0 else { return }
    let next = min(max(0, Int(round(pages.contentOffset.x / bounds.width))), max(0, imagePages.count - 1))
    guard next != current else { return }
    current = next
    refreshChrome()
    updateRequests()
    onIndexChange(current)
  }

  func reset() { renderPages() }

  private func renderPages() {
    cancelRequests()
    imagePages.forEach { $0.removeFromSuperview() }
    imagePages = sources.map { source in PreviewZoomPage(source: source, imageLoader: imageLoader) }
    resetDismissal()
    imagePages.forEach { page in
      page.onTap = { [weak self] in self?.dismissPreview() }
      page.panGestureRecognizer.require(toFail: dismissPan)
      pages.addSubview(page)
    }
    current = min(max(0, index), max(0, imagePages.count - 1))
    layoutPages(forcePosition: true)
    refreshChrome()
    updateRequests()
  }

  private func layoutPages(forcePosition: Bool = false) {
    let pageSize = bounds.size
    let sizeChanged = pageSize != lastPageSize
    guard forcePosition || sizeChanged else { return }
    lastPageSize = pageSize
    pages.contentSize = CGSize(width: pageSize.width * CGFloat(imagePages.count), height: pageSize.height)
    imagePages.enumerated().forEach { page, view in
      view.frame = CGRect(x: pageSize.width * CGFloat(page), y: 0, width: pageSize.width, height: pageSize.height)
    }
    pages.contentOffset = CGPoint(x: pageSize.width * CGFloat(current), y: 0)
  }

  private func show(_ requested: Int, animated: Bool, notify: Bool) {
    guard !imagePages.isEmpty else { current = 0; return }
    current = min(max(0, requested), imagePages.count - 1)
    pages.setContentOffset(CGPoint(x: CGFloat(current) * bounds.width, y: 0), animated: animated)
    refreshChrome()
    updateRequests()
    if notify { onIndexChange(current) }
  }

  private func refreshChrome() {
    indexLabel.text = sources.isEmpty ? "0 / 0" : "\(current + 1) / \(sources.count)"
    indexLabel.accessibilityLabel = sources.isEmpty ? "没有图片" : "第 \(current + 1) 张，共 \(sources.count) 张"
  }

  private func updateRequests() {
    guard active, window != nil else { cancelRequests(); return }
    for (page, view) in imagePages.enumerated() {
      if abs(page - current) <= 1 { view.loadIfNeeded() }
      else { view.cancelRequest() }
    }
  }

  private func cancelRequests() { imagePages.forEach { $0.cancelRequest() } }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(imageLoader:)") }
}


/// Full-screen, page-scoped image preview. Pin it over the page view; OverlayScope owns its lifetime.
@MainActor
public final class ImagePreview: UIView {
  public var sources: [URL] = [] { didSet { if open { content.sources = sources.map(Optional.some) } } }
  public var index: Int = 0 { didSet { if open { content.index = index } } }
  public var onOpenChange: (Bool, DialogDismissReason) -> Void {
    get { presenter.onOpenChange } set { presenter.onOpenChange = newValue }
  }
  public var onClosed: (OverlayCloseReason) -> Void { get { presenter.onClosed } set { presenter.onClosed = newValue } }
  public var onIndexChange: (Int) -> Void = { _ in }
  public var open: Bool { get { presenter.open } set { presenter.setOpen(newValue) } }
  public var active = true { didSet { coveredChanged() } }

  private lazy var presenter = OverlayPresenter<DialogDismissReason>(view: self, back: .back, navigation: .navigation)
  private let content: ImagePreviewContentView

  public init(imageLoader: @escaping NativeImageLoading.Loader,
              onOpenChange: @escaping (Bool, DialogDismissReason) -> Void = { _, _ in }) {
    content = ImagePreviewContentView(imageLoader: imageLoader)
    super.init(frame: .zero)
    translatesAutoresizingMaskIntoConstraints = false
    isHidden = true
    content.active = false
    addSubview(content)
    content.onIndexChange = { [weak self] in self?.onIndexChange($0) }
    content.onRequestClose = { [weak self] in self?.presenter.requestClose($0) }
    presenter.onOpenChange = onOpenChange
    presenter.render = { [weak self] animated, closed in self?.render(animated: animated, closed: closed) }
    presenter.coveredChanged = { [weak self] in self?.coveredChanged() }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    content.frame = bounds
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil { presenter.forceRemove(.unmount) }
    coveredChanged()
  }

  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    guard !isHidden, presenter.top, bounds.contains(point) else { return nil }
    return presenter.open ? super.hitTest(point, with: event) : self
  }

  public override func accessibilityPerformEscape() -> Bool {
    presenter.requestClose(.back)
    return true
  }

  private func coveredChanged() {
    isUserInteractionEnabled = presenter.top
    accessibilityElementsHidden = !presenter.interactive
    content.active = active && presenter.interactive
  }

  private func render(animated: Bool, closed: @escaping () -> Void) {
    coveredChanged()
    if presenter.open {
      content.index = index
      let urls = sources.map(Optional.some)
      if content.sources == urls { content.reset() }
      else { content.sources = urls }
      if isHidden {
        isHidden = false
        alpha = 0
        layoutIfNeeded()
      }
      guard animated else { alpha = 1; return }
      UIView.animate(withDuration: 0.2, delay: 0, options: [.beginFromCurrentState, .curveEaseOut]) { self.alpha = 1 }
    } else {
      let finish = { [weak self] in
        guard let self, !self.presenter.open else { return }
        self.isHidden = true
        closed()
      }
      guard animated && !content.dismissing else { finish(); return }
      UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .curveEaseIn], animations: {
        self.alpha = 0
      }, completion: { _ in finish() })
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("Use init(imageLoader:onOpenChange:)") }
}
