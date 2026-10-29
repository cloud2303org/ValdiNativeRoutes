package io.nativeroutes.ble

data class BlePeripheralServerInfo(
    val serverId: String
)

data class BlePeripheralProperties(
    val read: Boolean,
    val write: Boolean,
    val writeNoResponse: Boolean,
    val notify: Boolean,
    val indicate: Boolean
)

data class BlePeripheralPermissions(
    val readable: Boolean,
    val writeable: Boolean,
    val readEncryptionRequired: Boolean,
    val writeEncryptionRequired: Boolean
)

data class BlePeripheralDescriptorPermissions(
    val read: Boolean,
    val write: Boolean
)

data class BlePeripheralDescriptor(
    val uuid: String,
    val permission: BlePeripheralDescriptorPermissions,
    val value: ByteArray
)

data class BlePeripheralCharacteristic(
    val uuid: String,
    val properties: BlePeripheralProperties,
    val permission: BlePeripheralPermissions,
    val value: ByteArray,
    val descriptors: Array<BlePeripheralDescriptor>
)

data class BlePeripheralService(
    val uuid: String,
    val characteristics: Array<BlePeripheralCharacteristic>
)

data class BlePeripheralServiceParams(
    val serverId: String,
    val service: BlePeripheralService
)

data class BlePeripheralRemoveServiceParams(
    val serverId: String,
    val serviceId: String
)

data class BlePeripheralManufacturerData(
    val manufacturerId: Double,
    val manufacturerSpecificData: ByteArray
)

data class BlePeripheralBeacon(
    val uuid: String,
    val major: Double,
    val minor: Double,
    val measuredPower: Double
)

data class BlePeripheralAdvertisingParams(
    val serverId: String,
    val connectable: Boolean,
    val deviceName: String,
    val serviceUuids: Array<String>,
    val manufacturerData: Array<BlePeripheralManufacturerData>,
    val powerLevel: String,
    val beacon: BlePeripheralBeacon? = null
)

data class BlePeripheralWriteParams(
    val serverId: String,
    val serviceId: String,
    val characteristicId: String,
    val value: ByteArray,
    val needNotify: Boolean,
    val callbackId: Double? = null
)

data class BlePeripheralReadRequest(
    val serverId: String,
    val serviceId: String,
    val characteristicId: String,
    val callbackId: Double,
    val deviceId: String,
    val offset: Double
)

data class BlePeripheralWriteRequest(
    val serverId: String,
    val serviceId: String,
    val characteristicId: String,
    val callbackId: Double,
    val deviceId: String,
    val offset: Double,
    val value: ByteArray,
    val needResponse: Boolean
)

data class BlePeripheralSubscriptionEvent(
    val serverId: String,
    val serviceId: String,
    val characteristicId: String,
    val deviceId: String
)

data class BlePeripheralConnectionState(
    val serverId: String,
    val deviceId: String,
    val connected: Boolean
)
