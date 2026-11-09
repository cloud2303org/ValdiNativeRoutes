import SwiftUI
import UIKit

/// Example registration is composed by App, independently of the native-page registry.
enum NativeExamples {
    static func registerScreens() {
        NativeScreens.register("picker") { UIHostingController(rootView: PickerScreen(page: $0)) }
    }
}

private let fruits = ["苹果", "香蕉", "橙子", "葡萄", "西瓜"]

/// A plain SwiftUI page in the same stack, returning a result to the Valdi page that opened it.
struct PickerScreen: View {
    let page: NativePage

    var body: some View {
        List {
            Section("SwiftUI 页面，选一项返回给 Valdi 页面") {
                ForEach(fruits, id: \.self) { fruit in
                    Button(fruit) { page.finish(["value": fruit]) }
                }
            }
            Button("从原生页 push Valdi 详情页") {
                page.navigator.open("detail", params: ["id": 100, "from": "原生页"])
            }
            Button("原生调用 switchTab('wheels')") { page.navigator.switchTab("wheels") }
            // Native pages call the same AppUI directly, without going through JS.
            Button("原生调用 showModal") {
                Task {
                    let answer = try await app.ui.showModal(ModalOptions(title: "原生调用", content: "app.ui.showModal"))
                    _ = try await app.ui.showToast(ToastOptions(title: answer.confirm ? "原生页点了确定" : "原生页点了取消", icon: "none"))
                }
            }
        }
    }
}
