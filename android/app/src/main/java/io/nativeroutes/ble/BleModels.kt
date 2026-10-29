package io.nativeroutes.ble

data class BleMTU(
    val mtu: Double
)

data class BleNotifyParams(
    val deviceId: String,
    val serviceId: String,
    val characteristicId: String,
    val state: Boolean,
    val type: String? = null
)

data class BleMTUParams(
    val deviceId: String,
    val mtu: Double
)

data class BleScanWithAddressesParams(
    val peripheralAddresses: Array<String>
)

data class BleDeviceServiceParams(
    val deviceId: String,
    val serviceId: String
)

data class BleConnectedDevicesResult(
    val devices: Array<BleConnectedDeviceItem>
)

data class BleCharacteristicProperties(
    val read: Boolean,
    val write: Boolean,
    val writeDefault: Boolean,
    val writeNoResponse: Boolean,
    val notify: Boolean,
    val indicate: Boolean
)

data class BleWriteParams(
    val deviceId: String,
    val serviceId: String,
    val characteristicId: String,
    val value: ByteArray,
    val writeType: String? = null
)

data class BleCharacteristicValue(
    val deviceId: String,
    val serviceId: String,
    val characteristicId: String,
    val value: ByteArray
)

data class BleCharacteristicList(
    val characteristics: Array<BleCharacteristic>
)

data class BleDeviceList(
    val devices: Array<BleDevice>
)

data class BleReadParams(
    val deviceId: String,
    val serviceId: String,
    val characteristicId: String
)

data class BleDeviceIdParams(
    val deviceId: String,
    val writeType: String? = null
)

data class BleConnectStateChange(
    val deviceId: String,
    val connected: Boolean
)

data class BleService(
    val uuid: String,
    val isPrimary: Boolean
)

data class BleAdapterState(
    val available: Boolean,
    val discovering: Boolean,
    val peripheralAvailable: Boolean? = null
)

data class BlePairParams(
    val deviceId: String,
    val pin: String,
    val timeout: Double
)

data class BleCharacteristic(
    val uuid: String,
    val properties: BleCharacteristicProperties
)

data class BleMTUChange(
    val deviceId: String,
    val mtu: Double
)

data class BleDeviceRSSI(
    val RSSI: Double
)

data class BleConnectedDevicesParams(
    val services: Array<String>
)

data class BleServiceList(
    val services: Array<BleService>
)

data class BleDevice(
    val RSSI: Double,
    val advertisData: DoubleArray,
    val advertisServiceUUIDs: Array<String>,
    val deviceId: String,
    val localName: String,
    val name: String,
    val serviceData: Map<String, ByteArray>,
    val connectable: Boolean? = null
)

data class BleScanParams(
    val services: Array<String>? = null,
    val allowDuplicatesKey: Boolean? = null,
    val interval: Double? = null,
    val powerLevel: String? = null
)

data class BleScanWithNameParams(
    val peripheralNames: Array<String>
)

data class BleConnectedDeviceItem(
    val deviceId: String,
    val name: String
)
