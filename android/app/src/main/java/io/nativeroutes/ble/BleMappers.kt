package io.nativeroutes.ble

import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.bluetooth.le.ScanResult
import android.os.Build
import androidx.core.util.size
import com.welie.blessed.BluetoothPeripheral
import java.util.Locale
import java.util.UUID

internal fun BluetoothPeripheral.toDevice(scanResult: ScanResult): BleDevice {
    val scanRecord = scanResult.scanRecord
    val advertisData = mutableListOf<Double>()
    scanRecord?.manufacturerSpecificData?.let { sparseArray ->
        for (i in 0 until sparseArray.size) {
            val manufacturerId = sparseArray.keyAt(i)
            val data = sparseArray.valueAt(i) ?: continue
            advertisData.add((manufacturerId and 0xFF).toDouble())
            advertisData.add(((manufacturerId shr 8) and 0xFF).toDouble())
            data.forEach { byte ->
                advertisData.add((byte.toInt() and 0xFF).toDouble())
            }
        }
    }

    val serviceData = mutableMapOf<String, ByteArray>()
    scanRecord?.serviceData?.forEach { (uuid, data) ->
        if (data != null && data.isNotEmpty()) {
            serviceData[uuid.uuid.toNormalizedString()] = data.copyOf()
        }
    }

    val serviceUUIDs = scanRecord?.serviceUuids
        ?.map { it.uuid.toNormalizedString() }
        ?: emptyList()

    val connectable = scanResult.isConnectable

    return BleDevice(
        RSSI = scanResult.rssi.toDouble(),
        advertisData = advertisData.toDoubleArray(),
        advertisServiceUUIDs = serviceUUIDs.toTypedArray(),
        deviceId = address,
        localName = scanRecord?.deviceName ?: "",
        name = name,
        serviceData = serviceData,
        connectable = connectable,
    )
}

internal fun BluetoothGattService.toServiceModel(): BleService = BleService(
    uuid = uuid.toNormalizedString(),
    isPrimary = type == BluetoothGattService.SERVICE_TYPE_PRIMARY,
)

internal fun BluetoothGattCharacteristic.toCharacteristicModel(): BleCharacteristic {
    val props = properties
    return BleCharacteristic(
        uuid = uuid.toNormalizedString(),
        properties = BleCharacteristicProperties(
            read = props and BluetoothGattCharacteristic.PROPERTY_READ != 0,
            write = props and (
                BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE
                ) != 0,
            writeDefault = props and BluetoothGattCharacteristic.PROPERTY_WRITE != 0,
            writeNoResponse = props and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0,
            notify = props and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0,
            indicate = props and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0,
        ),
    )
}

internal fun UUID.toNormalizedString(): String = toString().lowercase(Locale.US)

internal fun String.toUuid(): UUID {
    val normalized = trim().lowercase(Locale.US)
    return try {
        when (normalized.length) {
            4 -> UUID.fromString("0000$normalized-0000-1000-8000-00805f9b34fb")
            8 -> UUID.fromString("$normalized-0000-1000-8000-00805f9b34fb")
            else -> UUID.fromString(normalized)
        }
    } catch (error: IllegalArgumentException) {
        throw BleOperationException("E_BLE_INVALID_DATA:Invalid Bluetooth UUID $this")
    }
}
