import Foundation
import ValdiRuntime

private final class BluetoothModule: VRBluetoothNativeModule {
    private let host = BleHostImpl()
    func getHost() throws -> any VRBleHost { host }
}

@objc(VRBluetoothModuleFactory)
final class BluetoothModuleFactory: VRBluetoothNativeModuleFactory {
    private let module = BluetoothModule()
    override func onLoadModule() -> any VRBluetoothNativeModule { module }
}
