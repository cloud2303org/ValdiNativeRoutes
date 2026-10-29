import UIKit

/// The showModal dialog, after ExpoNativeRoutes' UIKit Dialog / ScrollDialog / PopupActionButtons and their UiDesign
/// tokens: over the whole window (so it covers the sheet too), a centered card capped at 360 wide, a scrolling body
/// with a pinned title and footer. The keyboard comes from KeyboardObserver and only lifts the card when it overlaps.
@MainActor
final class AppDialogView: UIView {
    private enum Tokens {
        static let surface = UIColor.white
        static let text = UIColor(red: 0x17 / 255, green: 0x20 / 255, blue: 0x33 / 255, alpha: 1)
        static let muted = UIColor(red: 0x66 / 255, green: 0x70 / 255, blue: 0x85 / 255, alpha: 1)
        static let border = UIColor(red: 0xe8 / 255, green: 0xec / 255, blue: 0xf1 / 255, alpha: 1)
        static let scrim = UIColor(red: 0x10 / 255, green: 0x18 / 255, blue: 0x28 / 255, alpha: 0x52 / 255)
        static let shadow = UIColor(red: 0x10 / 255, green: 0x2b / 255, blue: 0x52 / 255, alpha: 0.18)
        static let primary = UIColor(red: 0x1e / 255, green: 0x62 / 255, blue: 0xd0 / 255, alpha: 1)
        static let secondary = UIColor(red: 0xee / 255, green: 0xf2 / 255, blue: 0xf7 / 255, alpha: 1)
        static let onSecondary = UIColor(red: 0x1d / 255, green: 0x29 / 255, blue: 0x39 / 255, alpha: 1)
        static let field = UIColor(red: 0xf3 / 255, green: 0xf4 / 255, blue: 0xf6 / 255, alpha: 1)
        static let padding: CGFloat = 24
        static let gap: CGFloat = 12
        static let bodyGap: CGFloat = 16
        static let width: CGFloat = 360
        static let maxHeight: CGFloat = 600
    }

    private let options: ModalOptions
    private let onClose: (ModalResult) -> Void
    private let scrim = UIControl()
    private let card = UIView()
    private let surface = UIView()
    private let scroll = UIScrollView()
    private let field = UITextField()
    private var keyboardBoundary: NSLayoutConstraint!
    private var heightLimit: NSLayoutConstraint!
    private var keyboardSubscription: KeyboardSubscription?
    private var closing = false

    init(options: ModalOptions, onClose: @escaping (ModalResult) -> Void) {
        self.options = options
        self.onClose = onClose
        super.init(frame: .zero)
        build()
    }

    required init?(coder: NSCoder) { fatalError() }

    func present(in window: UIWindow) {
        frame = window.bounds
        autoresizingMask = [.flexibleWidth, .flexibleHeight]
        window.addSubview(self)
        keyboardSubscription = KeyboardObserver.shared.observe { [weak self] _ in self?.keyboardDidMove() }
        keyboardDidMove()
        layoutIfNeeded()
        scrim.alpha = 0
        card.alpha = 0
        card.transform = CGAffineTransform(scaleX: 0.96, y: 0.96)
        UIView.animate(withDuration: 0.16, delay: 0, options: .curveEaseInOut) {
            self.scrim.alpha = 1
            self.card.alpha = 1
        }
        UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0) {
            self.card.transform = .identity
        }
        UIAccessibility.post(notification: .screenChanged, argument: card)
    }

    func dismiss(completion: @escaping () -> Void) {
        endEditing(true)
        isUserInteractionEnabled = false
        UIView.animate(withDuration: 0.15, delay: 0, options: .curveEaseInOut, animations: {
            self.scrim.alpha = 0
            self.card.alpha = 0
            self.card.transform = CGAffineTransform(scaleX: 0.98, y: 0.98)
        }, completion: { _ in
            self.removeFromSuperview()
            completion()
        })
    }

    private func requestClose(confirm: Bool) {
        guard !closing else { return }
        closing = true
        onClose(ModalResult(confirm: confirm, cancel: !confirm, content: options.editable ? field.text ?? "" : ""))
    }

    private func keyboardDidMove() {
        // Only an actual overlap moves the card: its bottom stays above the keyboard by the dialog margin.
        keyboardBoundary.constant = -(KeyboardObserver.shared.height + Tokens.padding)
        layoutIfNeeded()
    }

    override func layoutSubviews() {
        let top = safeAreaInsets.top + Tokens.padding
        let bottom = safeAreaInsets.bottom + Tokens.padding
        // Whole-window centering: cap the card by the larger margin on both sides.
        heightLimit.constant = max(0, min(Tokens.maxHeight, bounds.height - 2 * max(top, bottom)))
        super.layoutSubviews()
        card.layer.shadowPath = UIBezierPath(roundedRect: card.bounds, cornerRadius: 20).cgPath
    }

    override func accessibilityPerformEscape() -> Bool {
        requestClose(confirm: false)
        return true
    }

    // MARK: - Layout

    private func build() {
        scrim.translatesAutoresizingMaskIntoConstraints = false
        scrim.backgroundColor = Tokens.scrim
        scrim.addAction(UIAction { [weak self] _ in self?.requestClose(confirm: false) }, for: .touchUpInside)
        addSubview(scrim)

        card.translatesAutoresizingMaskIntoConstraints = false
        card.accessibilityViewIsModal = true
        card.layer.shadowColor = Tokens.shadow.cgColor
        card.layer.shadowOpacity = 1
        card.layer.shadowRadius = 24
        card.layer.shadowOffset = CGSize(width: 0, height: 16)
        addSubview(card)
        surface.translatesAutoresizingMaskIntoConstraints = false
        surface.backgroundColor = Tokens.surface
        surface.layer.cornerRadius = 20
        surface.layer.borderWidth = 1 / UIScreen.main.scale
        surface.layer.borderColor = Tokens.border.cgColor
        surface.clipsToBounds = true
        card.addSubview(surface)

        let column = UIStackView()
        column.axis = .vertical
        column.translatesAutoresizingMaskIntoConstraints = false
        surface.addSubview(column)

        let hasBody = !options.content.isEmpty || options.editable
        if !options.title.isEmpty {
            let title = label(options.title, size: 18, lineHeight: 26, weight: .semibold, color: Tokens.text)
            title.accessibilityTraits = .header
            column.addArrangedSubview(padded(title, top: Tokens.padding, bottom: 0))
        }
        if hasBody {
            let body = UIStackView()
            body.axis = .vertical
            body.spacing = Tokens.bodyGap
            body.translatesAutoresizingMaskIntoConstraints = false
            if !options.content.isEmpty {
                body.addArrangedSubview(label(options.content, size: 15, lineHeight: 22, weight: .regular, color: Tokens.muted))
            }
            if options.editable { body.addArrangedSubview(makeField()) }
            scroll.translatesAutoresizingMaskIntoConstraints = false
            scroll.keyboardDismissMode = .interactive
            scroll.bounces = false
            scroll.contentInsetAdjustmentBehavior = .never
            scroll.addSubview(body)
            let bodyTop = options.title.isEmpty ? Tokens.padding : Tokens.gap
            // The scroll hugs its content unless the card runs out of room.
            let hug = scroll.frameLayoutGuide.heightAnchor.constraint(equalTo: body.heightAnchor, constant: bodyTop)
            hug.priority = UILayoutPriority(740)
            NSLayoutConstraint.activate([
                body.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: bodyTop),
                body.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
                body.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: Tokens.padding),
                body.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -Tokens.padding),
                body.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -2 * Tokens.padding),
                hug,
            ])
            column.addArrangedSubview(scroll)
        }
        column.addArrangedSubview(padded(footer(), top: Tokens.padding, bottom: Tokens.padding))

        keyboardBoundary = card.bottomAnchor.constraint(lessThanOrEqualTo: bottomAnchor)
        let centered = card.centerYAnchor.constraint(equalTo: centerYAnchor)
        // Keep the content height before the centering: a keyboard overlap lifts the card before shrinking it.
        centered.priority = UILayoutPriority(730)
        heightLimit = card.heightAnchor.constraint(lessThanOrEqualToConstant: Tokens.maxHeight)
        let wide = card.widthAnchor.constraint(equalTo: widthAnchor, constant: -2 * Tokens.padding)
        wide.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scrim.topAnchor.constraint(equalTo: topAnchor),
            scrim.bottomAnchor.constraint(equalTo: bottomAnchor),
            scrim.leadingAnchor.constraint(equalTo: leadingAnchor),
            scrim.trailingAnchor.constraint(equalTo: trailingAnchor),
            card.centerXAnchor.constraint(equalTo: centerXAnchor),
            card.topAnchor.constraint(greaterThanOrEqualTo: safeAreaLayoutGuide.topAnchor, constant: Tokens.padding),
            card.bottomAnchor.constraint(lessThanOrEqualTo: safeAreaLayoutGuide.bottomAnchor, constant: -Tokens.padding),
            card.widthAnchor.constraint(lessThanOrEqualToConstant: Tokens.width),
            keyboardBoundary, centered, wide, heightLimit,
            surface.topAnchor.constraint(equalTo: card.topAnchor),
            surface.bottomAnchor.constraint(equalTo: card.bottomAnchor),
            surface.leadingAnchor.constraint(equalTo: card.leadingAnchor),
            surface.trailingAnchor.constraint(equalTo: card.trailingAnchor),
            column.topAnchor.constraint(equalTo: surface.topAnchor),
            column.bottomAnchor.constraint(equalTo: surface.bottomAnchor),
            column.leadingAnchor.constraint(equalTo: surface.leadingAnchor),
            column.trailingAnchor.constraint(equalTo: surface.trailingAnchor),
        ])
    }

    private func label(_ text: String, size: CGFloat, lineHeight: CGFloat, weight: UIFont.Weight, color: UIColor) -> UILabel {
        let label = UILabel()
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        paragraph.minimumLineHeight = lineHeight
        paragraph.maximumLineHeight = lineHeight
        label.attributedText = NSAttributedString(string: text, attributes: [
            .font: UIFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color, .paragraphStyle: paragraph,
        ])
        label.numberOfLines = 0
        return label
    }

    private func padded(_ view: UIView, top: CGFloat, bottom: CGFloat) -> UIView {
        let container = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(view)
        NSLayoutConstraint.activate([
            view.topAnchor.constraint(equalTo: container.topAnchor, constant: top),
            view.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -bottom),
            view.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: Tokens.padding),
            view.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -Tokens.padding),
        ])
        return container
    }

    private func makeField() -> UIView {
        field.text = options.defaultText
        field.attributedPlaceholder = NSAttributedString(string: options.placeholderText, attributes: [
            .foregroundColor: UIColor(red: 0x9c / 255, green: 0xa3 / 255, blue: 0xaf / 255, alpha: 1),
        ])
        field.font = .systemFont(ofSize: 16)
        field.textColor = Tokens.text
        field.backgroundColor = Tokens.field
        field.layer.cornerRadius = 12
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1))
        field.leftViewMode = .always
        field.clearButtonMode = .whileEditing
        field.returnKeyType = .done
        field.accessibilityIdentifier = "app-modal-input"
        field.addAction(UIAction { [weak self] _ in self?.requestClose(confirm: true) }, for: .editingDidEndOnExit)
        field.heightAnchor.constraint(equalToConstant: 48).isActive = true
        return field
    }

    private func footer() -> UIView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = Tokens.gap
        row.distribution = .fillEqually
        if options.showCancel {
            row.addArrangedSubview(button(options.cancelText, fill: Tokens.secondary, text: Tokens.onSecondary) { [weak self] in
                self?.requestClose(confirm: false)
            })
        }
        row.addArrangedSubview(button(options.confirmText, fill: Tokens.primary, text: .white) { [weak self] in
            self?.requestClose(confirm: true)
        })
        return row
    }

    private func button(_ title: String, fill: UIColor, text: UIColor, action: @escaping () -> Void) -> UIButton {
        var configuration = UIButton.Configuration.filled()
        configuration.baseBackgroundColor = fill
        configuration.baseForegroundColor = text
        configuration.background.cornerRadius = 14
        configuration.cornerStyle = .fixed
        configuration.attributedTitle = AttributedString(title, attributes: AttributeContainer([
            .font: UIFont.systemFont(ofSize: 16, weight: .semibold),
        ]))
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20)
        let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
        button.configurationUpdateHandler = { button in
            button.alpha = button.isHighlighted ? 0.82 : 1
            button.transform = button.isHighlighted ? CGAffineTransform(scaleX: 0.97, y: 0.97) : .identity
        }
        return button
    }
}
