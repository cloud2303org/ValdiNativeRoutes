import Foundation
import ValdiRuntime

/// `api` requests are validated in TypeScript. AppUI keeps presentation scheduling and page ownership.
final class AppUIHostImpl: NSObject, VRAppUIHost {
    func showModal(with request: VRModalRequest) -> SCValdiPromise<VRModalReply> {
        let options = ModalOptions(
            title: request.title, content: request.content, showCancel: request.showCancel,
            confirmText: request.confirmText, cancelText: request.cancelText, editable: request.editable,
            placeholderText: request.placeholderText, defaultText: request.defaultText
        )
        return AppUIPromise.make { complete in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    _ = AppUI.shared.showModal(options) { result in
                        complete(result.map {
                            VRModalReply(confirm: $0.confirm, cancel: $0.cancel, content: $0.content)
                        })
                    }
                }
            }
        }
    }

    func showActionSheet(with request: VRActionSheetRequest) -> SCValdiPromise<VRPresentationReply> {
        present(.actionSheet(ActionSheetOptions(alertText: request.title, itemList: request.itemList)))
    }

    func showPicker(with request: VRPickerRequest) -> SCValdiPromise<VRPresentationReply> {
        present(.picker(PickerOptions(
            title: request.title, options: request.options.map { PickerOption($0.value, label: $0.label) },
            value: request.value, confirmText: request.confirmText, cancelText: request.cancelText
        )))
    }

    func showDatePicker(with request: VRDatePickerRequest) -> SCValdiPromise<VRPresentationReply> {
        present(.datePicker(DatePickerOptions(
            title: request.title, mode: request.mode.rawValue, value: request.value, minYear: Int(request.minYear),
            maxYear: Int(request.maxYear), confirmText: request.confirmText, cancelText: request.cancelText
        )))
    }

    func showBottomSheet(with request: VRBottomSheetRequest) -> SCValdiPromise<VRPresentationReply> {
        present(.bottomSheet(BottomSheetOptions(
            title: request.title, content: request.content, confirmText: request.confirmText,
            cancelText: request.cancelText, showCancel: request.showCancel, dismissible: request.dismissible
        )))
    }

    func previewImage(with request: VRImagePreviewRequest) -> SCValdiPromise<VRPresentationReply> {
        present(.imagePreview(ImagePreviewOptions(urls: request.urls, current: request.current)))
    }

    func scanCode() -> SCValdiPromise<VRScanCodeReply> {
        AppUIPromise.make { complete in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    AppUI.shared.scanCode { result in
                        complete(result.map { VRScanCodeReply(result: $0.result, scanType: $0.scanType) })
                    }
                }
            }
        }
    }

    func pickAttachments(withSource source: VRAttachmentSource, limit: Double, mimeTypes: [String])
        -> SCValdiPromise<VRAttachmentSelection> {
        let options = AttachmentPickOptions(limit: limit.isFinite ? Int(min(max(1, limit), 20)) : 1, mimeTypes: mimeTypes)
        return AppUIPromise.make { complete in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    AppUI.shared.pickAttachments(source.rawValue, options) { result in
                        complete(result.map { selection in
                            VRAttachmentSelection(canceled: selection.canceled, assets: selection.assets.map {
                                VRAttachmentAsset(id2: $0.id, uri: $0.uri, name: $0.name, mimeType: $0.mimeType, size: $0.size)
                            })
                        })
                    }
                }
            }
        }
    }

    func clearAttachmentCache() -> SCValdiPromise<SCValdiUndefinedValue> {
        AppUIPromise.void { complete in
            Task {
                do {
                    try await AppUI.clearAttachmentCache()
                    complete(.success(()))
                } catch {
                    complete(.failure(error))
                }
            }
        }
    }

    func showToast(with request: VRToastRequest) -> SCValdiPromise<SCValdiUndefinedValue> {
        onMain {
            try AppUI.shared.showToast(ToastOptions(title: request.title, icon: request.icon.rawValue,
                                                    duration: request.duration, mask: request.mask))
        }
    }

    func hideToast() -> SCValdiPromise<SCValdiUndefinedValue> {
        onMain { AppUI.shared.hideToast() }
    }

    func showLoading(with request: VRLoadingRequest) -> SCValdiPromise<SCValdiUndefinedValue> {
        onMain { try AppUI.shared.showLoading(LoadingOptions(title: request.title, mask: request.mask)) }
    }

    func hideLoading() -> SCValdiPromise<SCValdiUndefinedValue> {
        onMain { AppUI.shared.hideLoading() }
    }

    private func present(_ options: PresentationOptions) -> SCValdiPromise<VRPresentationReply> {
        AppUIPromise.make { complete in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    _ = AppUI.shared.showPresentation(options) { result in
                        complete(result.map {
                            VRPresentationReply(confirm: $0.confirm, cancel: $0.cancel, value: $0.value,
                                                index: Double($0.index))
                        })
                    }
                }
            }
        }
    }

    private func onMain(_ action: @escaping @MainActor () throws -> Void) -> SCValdiPromise<SCValdiUndefinedValue> {
        AppUIPromise.void { complete in
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    do {
                        try action()
                        complete(.success(()))
                    } catch {
                        complete(.failure(error))
                    }
                }
            }
        }
    }
}
