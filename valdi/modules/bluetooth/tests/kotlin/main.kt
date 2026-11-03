package io.nativeroutes.ble

import android.content.Context
import android.content.Intent
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattService
import android.os.TestClock
import com.welie.blessed.BluetoothCentralManager
import com.welie.blessed.BluetoothPeripheral
import com.welie.blessed.ConnectionState
import com.welie.blessed.GattStatus
import com.welie.blessed.HciStatus
import com.welie.blessed.BondState
import kotlin.system.exitProcess

private class Observed<T>(future: BleFuture<T>) {
    val results = mutableListOf<Result<T>>()
    init { future.observe { results.add(it) } }
    val failed get() = results.firstOrNull()?.isFailure == true
    val succeeded get() = results.firstOrNull()?.isSuccess == true
    val message get() = results.firstOrNull()?.exceptionOrNull()?.message.orEmpty()
}
private val appContext = Context()
private val core = BleCore.install(appContext)
private const val id = "AA:BB:CC:DD:EE:01"
private fun submittedPairingPin(): ByteArray? {
    val device = BluetoothDevice(id)
    appContext.sendBroadcast(Intent(BluetoothDevice.ACTION_PAIRING_REQUEST)
        .putExtra(BluetoothDevice.EXTRA_DEVICE, device))
    return device.submittedPins.lastOrNull()
}
private var failures = 0
private var caseIndex = 0
private var selected: String? = null
private fun expect(condition: Boolean, message: String) {
    if (!condition) { failures++; println("FAIL $message") }
}
private fun test(name: String, action: () -> Unit) {
    caseIndex++
    if (selected == "--list") { println("CASE:$caseIndex"); return }
    if (selected != null && selected != "$caseIndex") return
    val before = failures
    try { action() } catch (error: Throwable) { failures++; println("FAIL $name: $error") }
    println("${if (failures == before) "PASS" else "FAILED"} $name")
}
private fun fixture(): Triple<BleSession, BluetoothCentralManager, BluetoothPeripheral> {
    val session = core.createSession()
    session.closeBluetoothAdapter()
    session.openBluetoothAdapter()
    val manager = BluetoothCentralManager.last
    val peripheral = manager.getPeripheral(id)
    peripheral.connectionState = ConnectionState.CONNECTED
    return Triple(session, manager, peripheral)
}

fun main(args: Array<String>) {
    selected = args.firstOrNull()
    test("disconnect fences successor before engine rejection and event") {
        val (session, manager, peripheral) = fixture()
        val active = Observed(session.getBLEDeviceRSSI(id))
        var dispatched = false
        val queued = Observed(core.submit(session, id) {
            dispatched = true; BleFuture.async {}
        })
        var cancelledBeforeEvent = false
        session.onConnectStateChange {
            if (!it.connected) cancelledBeforeEvent = active.failed && queued.failed
        }
        manager.disconnected(peripheral)
        expect(!dispatched, "disconnect dispatched old successor")
        expect(active.failed && queued.failed, "disconnect did not reject active and queued work")
        expect(cancelledBeforeEvent, "disconnect event preceded cancellation")
        session.release()
    }
    test("power loss cancels adapter and device queues before callbacks drain") {
        val (session, manager, _) = fixture()
        val active = Observed(session.getBLEDeviceRSSI(id))
        val adapterGate = BleFuture<Unit>()
        val adapter = Observed(core.submit(session, "@adapter") { adapterGate })
        var dispatched = false
        val queued = Observed(core.submit(session, id) { dispatched = true; BleFuture<Unit>() })
        manager.poweredOff()
        expect(active.failed && adapter.failed && queued.failed, "power loss left a native operation pending")
        expect(!dispatched, "power loss dispatched an old generation")
        adapterGate.resolve(Unit)
        expect(adapter.failed && adapter.results.size == 1, "late adapter success beat cancellation")
        session.release()
    }
    test("late success cannot settle cancelled work or pop replacement queue") {
        val (session, manager, peripheral) = fixture()
        val oldGate = BleFuture<Unit>()
        val old = Observed(core.submit(session, id) { oldGate })
        manager.disconnected(peripheral)
        expect(old.failed, "disconnect did not immediately cancel synthetic active work")
        peripheral.connectionState = ConnectionState.CONNECTED
        val newGate = BleFuture<Unit>()
        val replacement = Observed(core.submit(session, id) { newGate })
        var successor = false
        core.submit(session, id) { successor = true; BleFuture<Unit>() }
        oldGate.resolve(Unit)
        expect(old.failed && old.results.size == 1, "late old success was delivered")
        expect(!successor && replacement.results.isEmpty(), "late old completion advanced replacement queue")
        newGate.resolve(Unit)
        expect(successor, "replacement completion failed to advance its own queue")
        session.release()
    }
    test("identical admitted connects join across sessions; fresh connect rejects") {
        val (a, manager, peripheral) = fixture()
        val b = core.createSession()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val first = Observed(a.createBLEConnection(id))
        val second = Observed(b.createBLEConnection(id.lowercase()))
        expect(manager.connects == 1, "duplicate connect reached OS twice")
        manager.connected(peripheral)
        expect(first.succeeded && second.succeeded, "duplicate native connect did not join")
        val fresh = Observed(b.createBLEConnection(id))
        expect(fresh.failed && fresh.message.contains("ALREADY_CONNECTED"), "fresh already-connected call did not reject")
        a.release(); b.release()
    }
    test("release cancels one connect waiter without cancelling another session") {
        val (a, manager, peripheral) = fixture()
        val b = core.createSession()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val first = Observed(a.createBLEConnection(id))
        val second = Observed(b.createBLEConnection(id))
        a.release()
        expect(first.failed && first.message.contains("SESSION_RELEASED"), "released connect waiter remained active")
        expect(second.results.isEmpty(), "releasing first session cancelled other waiter")
        manager.connected(peripheral)
        expect(second.succeeded && first.results.size == 1, "other owner's connect did not complete")
        b.release()
    }
    test("explicit disconnect cancels a connecting attempt and queued old work") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val connecting = Observed(session.createBLEConnection(id))
        var dispatched = false
        val queued = Observed(core.submit(session, id) { dispatched = true; BleFuture<Unit>() })
        val closing = Observed(session.closeBLEConnection(id))
        expect(connecting.failed && queued.failed && !dispatched, "explicit close did not cancel old work immediately")
        manager.disconnected(peripheral)
        expect(closing.succeeded, "hardware disconnect no longer completes")
        val reconnect = Observed(session.createBLEConnection(id))
        manager.connected(peripheral)
        expect(reconnect.succeeded, "replacement connection was cancelled by old generation")
        session.release()
    }
    test("reentrant reconnect waits for disconnect cleanup before entering engine") {
        val (session, manager, peripheral) = fixture()
        var reconnect: Observed<Unit>? = null
        session.getBLEDeviceRSSI(id).observe { reconnect = Observed(session.createBLEConnection(id)) }
        manager.disconnected(peripheral)
        expect(manager.connects == 1 && reconnect?.results?.isEmpty() == true, "reentrant connect was rejected or consumed by old cleanup")
        manager.connected(peripheral)
        expect(reconnect?.succeeded == true, "reentrant replacement failed")
        session.release()
    }
    test("session release preserves other session FIFO and scan lease") {
        val (a, manager, _) = fixture()
        val b = core.createSession()
        a.startBluetoothDevicesDiscovery(BleScanParams())
        b.startBluetoothDevicesDiscovery(BleScanParams())
        val stops = manager.scanStops
        val gate = BleFuture<Unit>()
        val first = Observed(core.submit(a, id) { gate })
        val otherGate = BleFuture<Unit>()
        val other = Observed(core.submit(b, id) { otherGate })
        a.release()
        expect(first.failed && other.results.isEmpty(), "session release cancelled another owner")
        expect(manager.scanStops == stops, "release stopped another owner's scan")
        gate.resolve(Unit)
        otherGate.resolve(Unit)
        expect(other.succeeded && first.results.size == 1, "other owner could not continue")
        b.release()
        expect(manager.scanStops == stops + 1, "last-owner scan cleanup was lost")
    }
    test("different devices progress independently and disconnect only cancels its own device") {
        val (session, manager, peripheral) = fixture()
        val otherId = "AA:BB:CC:DD:EE:02"
        val other = manager.getPeripheral(otherId)
        session.createBLEConnection(otherId)
        manager.connected(other)
        val first = Observed(session.getBLEDeviceRSSI(id))
        val second = Observed(session.getBLEDeviceRSSI(otherId))
        expect(peripheral.rssiReads == 1 && other.rssiReads == 1, "different devices blocked each other")
        manager.disconnected(peripheral)
        expect(first.failed && second.results.isEmpty(), "disconnect cancelled another device")
        other.callback!!.onReadRemoteRssi(other, -40, GattStatus.SUCCESS)
        expect(second.succeeded, "other device could not complete")
        session.release()
    }
    test("release removes queued owner work without touching the active owner") {
        val (a, _, _) = fixture()
        val b = core.createSession()
        val gate = BleFuture<Unit>()
        val active = Observed(core.submit(b, id) { gate })
        var releasedDispatch = false
        val queued = Observed(core.submit(a, id) { releasedDispatch = true; BleFuture<Unit>() })
        var following = false
        core.submit(b, id) { following = true; BleFuture.async {} }
        a.release()
        expect(queued.failed && active.results.isEmpty(), "queued release touched the active owner")
        gate.resolve(Unit)
        expect(!releasedDispatch && following && active.succeeded, "released queued work was not skipped")
        b.release()
    }
    test("disconnect retires old notification lease before a new owner acquires it") {
        val (a, manager, peripheral) = fixture()
        val b = core.createSession()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        a.createBLEConnection(id)
        manager.connected(peripheral)
        val service = BluetoothGattService("180d".toUuid())
        val characteristic = BluetoothGattCharacteristic("2a37".toUuid(), service)
        service.characteristics.add(characteristic)
        peripheral.services.add(service)
        val params = BleNotifyParams(id, "180d", "2a37", true)
        a.notifyBLECharacteristicValueChange(params)
        peripheral.notifying = true
        peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
        manager.disconnected(peripheral)
        b.createBLEConnection(id)
        manager.connected(peripheral)
        peripheral.notifying = false
        b.notifyBLECharacteristicValueChange(params)
        peripheral.notifying = true
        peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
        val changes = peripheral.notifyChanges
        b.release()
        expect(peripheral.notifyChanges == changes + 1, "old connection's lease blocked last-owner notification cleanup")
        peripheral.notifying = false
        peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
        a.release()
    }
    test("power loss retires scan signature so recovery can start another scan") {
        val (a, manager, _) = fixture()
        val b = core.createSession()
        a.startBluetoothDevicesDiscovery(BleScanParams(services = arrayOf("180d")))
        manager.poweredOff()
        manager.isBluetoothEnabled = true
        manager.callback.onBluetoothAdapterStateChanged(android.bluetooth.BluetoothAdapter.STATE_ON)
        val recovery = Observed(b.startBluetoothDevicesDiscovery(BleScanParams(services = arrayOf("180f"))))
        expect(recovery.succeeded, "old scan signature survived power loss")
        a.release(); b.release()
    }
    test("connect failure cancels queued old-generation work before its event") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val connecting = Observed(session.createBLEConnection(id))
        var dispatched = false
        val queued = Observed(core.submit(session, id) { dispatched = true; BleFuture<Unit>() })
        peripheral.connectionState = ConnectionState.DISCONNECTED
        manager.callback.onConnectionFailed(peripheral, HciStatus.FAILURE)
        expect(connecting.failed && queued.failed && !dispatched, "failed connect drained old work")
        session.release()
    }
    test("identical connects coalesce at admission while waiting behind other work") {
        val (a, manager, peripheral) = fixture()
        val b = core.createSession()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val gate = BleFuture<Unit>()
        core.submit(a, id) { gate }
        val first = Observed(a.createBLEConnection(id))
        val second = Observed(b.createBLEConnection(id))
        expect(manager.connects == 0, "connect bypassed active native work")
        gate.resolve(Unit)
        expect(manager.connects == 1, "queued duplicate connect reached OS twice")
        manager.connected(peripheral)
        expect(first.succeeded && second.succeeded, "queued identical connect did not join")
        a.release(); b.release()
    }
    test("explicit adapter close cancels unresolved work and still closes hardware") {
        val (session, _, _) = fixture()
        val gate = BleFuture<Unit>()
        val active = Observed(core.submit(session, id) { gate })
        val closed = Observed(session.closeBluetoothAdapter())
        expect(active.failed && closed.succeeded, "adapter close left active work unresolved or cancelled itself")
        gate.resolve(Unit)
        expect(active.failed && active.results.size == 1, "adapter close lost to late success")
        expect(Observed(session.getBluetoothAdapterState()).failed, "hardware close became session release")
        session.release()
    }
    test("retired native callback cannot resolve a replacement connection's RSSI request") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        session.createBLEConnection(id)
        manager.connected(peripheral)
        val old = Observed(session.getBLEDeviceRSSI(id))
        val retired = peripheral.callback!!
        manager.disconnected(peripheral)
        session.createBLEConnection(id)
        manager.connected(peripheral)
        val fresh = Observed(session.getBLEDeviceRSSI(id))
        retired.onReadRemoteRssi(peripheral, -99, GattStatus.SUCCESS)
        expect(old.failed && fresh.results.isEmpty(), "retired connection callback completed fresh work")
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        expect(fresh.succeeded, "current connection callback could not complete fresh work")
        session.release()
    }
    test("retired manager callback cannot cancel a replacement adapter queue") {
        val (session, retired, _) = fixture()
        session.closeBluetoothAdapter()
        session.openBluetoothAdapter()
        val gate = BleFuture<Unit>()
        val fresh = Observed(core.submit(session, "@adapter") { gate })
        retired.poweredOff()
        expect(fresh.results.isEmpty(), "retired adapter callback invalidated replacement adapter")
        gate.resolve(Unit)
        expect(fresh.succeeded, "replacement adapter failed after retired callback")
        session.release()
    }
    test("session event tokens are removed independently") {
        val (a, manager, peripheral) = fixture()
        val b = core.createSession()
        var aEvents = 0
        var bEvents = 0
        a.onConnectStateChange { aEvents++ }
        val token = b.onConnectStateChange { bEvents++ }
        a.release()
        manager.disconnected(peripheral)
        expect(aEvents == 0 && bEvents == 1, "one session's release removed another session's event token")
        b.removeConnectStateListener(token)
        manager.disconnected(peripheral)
        expect(bEvents == 1, "removed event token remained live")
        b.release()
    }
    test("a read completion that closes hardware cannot emit an old value event") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        session.createBLEConnection(id)
        manager.connected(peripheral)
        val service = BluetoothGattService("180d".toUuid())
        val characteristic = BluetoothGattCharacteristic("2a37".toUuid(), service)
        service.characteristics.add(characteristic)
        peripheral.services.add(service)
        var values = 0
        session.onCharacteristicUpdate { values++ }
        session.readBLECharacteristicValue(BleReadParams(id, "180d", "2a37")).observe {
            session.closeBLEConnection(id)
        }
        peripheral.callback!!.onCharacteristicUpdate(peripheral, byteArrayOf(1), characteristic, GattStatus.SUCCESS)
        expect(values == 0, "read emitted a value after reentrant connection close")
        manager.disconnected(peripheral)
        session.release()
    }
    test("a connect completion that closes hardware cannot emit connected afterward") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        var connectedEvents = 0
        session.onConnectStateChange { if (it.connected) connectedEvents++ }
        session.createBLEConnection(id).observe { session.closeBLEConnection(id) }
        manager.connected(peripheral)
        expect(connectedEvents == 0, "connect emitted connected after reentrant connection close")
        manager.disconnected(peripheral)
        session.release()
    }
    test("explicit close invalidates queued work even when OS already reports disconnected") {
        val (session, _, peripheral) = fixture()
        val gate = BleFuture<Unit>()
        val active = Observed(core.submit(session, id) { gate })
        var dispatched = false
        val queued = Observed(core.submit(session, id) { dispatched = true; BleFuture<Unit>() })
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val closed = Observed(session.closeBLEConnection(id))
        expect(active.failed && queued.failed && closed.succeeded && !dispatched,
            "already-disconnected close bypassed native cancellation")
        gate.resolve(Unit)
        expect(active.results.size == 1 && !dispatched, "late success advanced a closed device")
        session.release()
    }
    for (delivery in listOf("disconnected", "connected", "failed")) {
        test("delayed old $delivery central callback cannot retire a distinct replacement peripheral") {
            val (session, manager, first) = fixture()
            first.connectionState = ConnectionState.DISCONNECTED
            session.createBLEConnection(id)
            manager.connected(first)
            val old = Observed(session.getBLEDeviceRSSI(id))
            val deliverDisconnect = manager.deferredDisconnect(first)
            // The explicit control call observes Blessed's disconnected cache
            // state and retires old queued work before P1's posted callback.
            expect(Observed(session.closeBLEConnection(id)).succeeded && old.failed,
                "control close did not retire the disconnected first peripheral")
            val replacement = Observed(session.createBLEConnection(id))
            val second = manager.getPeripheral(id)
            expect(second !== first && manager.connects == 2, "boundary did not model distinct reconnect instances")
            var disconnectedEvents = 0
            session.onConnectStateChange { if (!it.connected) disconnectedEvents++ }
            val queued = Observed(session.getBLEDeviceRSSI(id))
            when (delivery) {
                "disconnected" -> deliverDisconnect()
                "connected" -> manager.callback.onConnected(first)
                else -> manager.callback.onConnectionFailed(first, HciStatus.FAILURE)
            }
            expect(replacement.results.isEmpty() && queued.results.isEmpty() && disconnectedEvents == 0,
                "old $delivery callback settled or invalidated replacement work")
            manager.connected(second)
            expect(replacement.succeeded && second.rssiReads == 1,
                "replacement did not connect and start its queued RSSI")
            second.callback!!.onReadRemoteRssi(second, -40, GattStatus.SUCCESS)
            expect(queued.succeeded && replacement.results.size == 1,
                "replacement callback token was retired by the old peripheral")
            session.release()
        }
    }
    for (releasedWhileEnabling in listOf(false, true)) {
        test("queued notification cleanup rechecks new owner after ${if (releasedWhileEnabling) "pending enable" else "last lease"} release") {
            val (a, manager, peripheral) = fixture()
            val b = core.createSession()
            peripheral.connectionState = ConnectionState.DISCONNECTED
            a.createBLEConnection(id)
            manager.connected(peripheral)
            val service = BluetoothGattService("180d".toUuid())
            val characteristic = BluetoothGattCharacteristic("2a37".toUuid(), service)
            service.characteristics.add(characteristic)
            peripheral.services.add(service)
            val params = BleNotifyParams(id, "180d", "2a37", true)
            val first = Observed(a.notifyBLECharacteristicValueChange(params))
            if (!releasedWhileEnabling) {
                peripheral.notifying = true
                peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
            }
            val busy = if (!releasedWhileEnabling) Observed(a.getBLEDeviceRSSI(id)) else null
            val second = Observed(b.notifyBLECharacteristicValueChange(params))
            expect(second.results.isEmpty(), "B enable did not queue behind the active operation")
            a.release()
            if (releasedWhileEnabling) {
                peripheral.notifying = true
                peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
            } else {
                peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
            }
            expect(second.succeeded && (busy == null || busy.failed), "B did not acquire the notification lease")
            expect(peripheral.notifyChanges == 1 && peripheral.notifying,
                "stale cleanup disabled notifications after B acquired the lease")
            expect(first.results.size == 1, "A enable settled more than once")
            b.release()
            expect(peripheral.notifyChanges == 2, "last current owner's release did not disable notifications")
            peripheral.notifying = false
            peripheral.callback!!.onNotificationStateUpdate(peripheral, characteristic, GattStatus.SUCCESS)
        }
    }
    test("synchronous scan state listener release cannot detach the enabling session's lease") {
        val (a, manager, _) = fixture()
        val b = core.createSession()
        val params = BleScanParams()
        expect(Observed(a.startBluetoothDevicesDiscovery(params)).succeeded, "A could not acquire the initial scan lease")
        val stops = manager.scanStops
        var insideBStart = false
        var releasedDuringBStart = false
        a.onAdapterStateChange { state ->
            if (insideBStart && state.discovering && !releasedDuringBStart) {
                releasedDuringBStart = true
                expect(manager.scanStarts == 2, "release did not reenter from B's actual engine scan start")
                a.release()
            }
        }
        insideBStart = true
        val enabling = Observed(b.startBluetoothDevicesDiscovery(params))
        insideBStart = false
        expect(releasedDuringBStart, "engine did not synchronously emit adapter state during B enable")
        expect(enabling.succeeded && enabling.results.size == 1, "B scan enable did not settle successfully once")
        expect(manager.isScanning && manager.scanStops == stops,
            "A's queued cleanup stopped B's successfully enabled scan")
        val stopsBeforeBRelease = manager.scanStops
        b.release()
        expect(!manager.isScanning && manager.scanStops == stopsBeforeBRelease + 1,
            "B's last-owner release did not retain and clean up its actual scan lease")
        val stopsAfterBRelease = manager.scanStops
        a.release()
        expect(manager.scanStops == stopsAfterBRelease, "repeated release duplicated scan cleanup")
    }
    for (delivery in listOf("disconnected", "disconnectFailure", "failed", "connected")) {
        test("pending retired close handles old $delivery independently of the current close") {
            val (session, manager, first) = fixture()
            val firstClose = Observed(session.closeBLEConnection(id))
            val firstJoin = Observed(session.closeBLEConnection(id))
            expect(firstClose.results.isEmpty() && firstJoin.results.isEmpty() &&
                manager.cancellations.count { it === first } == 1,
                "P1 close was not pending or its repeated close did not join")
            // Eviction happens after cancelConnection, before the central
            // callback. P1 still has a genuine pending engine close promise.
            val deliverFirstDisconnect = manager.deferredDisconnect(first)
            val connecting = Observed(session.createBLEConnection(id))
            val second = manager.getPeripheral(id)
            expect(second !== first, "reconnect did not use a distinct peripheral")
            manager.connected(second)
            expect(connecting.succeeded, "P2 reconnect failed while P1 close was pending")
            var disconnectedEvents = 0
            session.onConnectStateChange { if (!it.connected) disconnectedEvents++ }
            val secondClose = Observed(session.closeBLEConnection(id))
            val secondJoin = Observed(session.closeBLEConnection(id))
            expect(manager.cancellations.count { it === second } == 1 &&
                second.getState() == ConnectionState.DISCONNECTING,
                "P2 close joined P1's address waiter instead of cancelling P2 once")
            when (delivery) {
                "disconnected" -> deliverFirstDisconnect()
                "disconnectFailure" -> manager.callback.onDisconnected(first, HciStatus.FAILURE)
                "failed" -> manager.callback.onConnectionFailed(first, HciStatus.FAILURE)
                else -> manager.callback.onConnected(first)
            }
            if (delivery == "connected") {
                expect(firstClose.results.isEmpty() && firstJoin.results.isEmpty(),
                    "old connected callback prematurely settled its pending close")
            } else {
                val success = delivery == "disconnected"
                expect(firstClose.results.size == 1 && firstJoin.results.size == 1 &&
                    firstClose.succeeded == success && firstClose.failed != success &&
                    firstJoin.succeeded == success && firstJoin.failed != success,
                    "old terminal callback did not settle only P1's close and joiners")
            }
            expect(secondClose.results.isEmpty() && secondJoin.results.isEmpty() && disconnectedEvents == 0,
                "old callback settled P2 close or emitted a current disconnect event")
            // For connected, this is P1's actual terminal delivery. For other
            // cases it is a duplicate that must not consume P2's close.
            deliverFirstDisconnect()
            expect(firstClose.results.size == 1 && firstJoin.results.size == 1 &&
                secondClose.results.isEmpty() && secondJoin.results.isEmpty(),
                "P1 terminal settlement was lost, repeated, or consumed P2's waiter")
            manager.disconnected(second)
            expect(secondClose.succeeded && secondJoin.succeeded &&
                secondClose.results.size == 1 && secondJoin.results.size == 1 && disconnectedEvents == 1,
                "P2's own terminal callback did not settle its independent close once")
            deliverFirstDisconnect()
            manager.callback.onConnectionFailed(first, HciStatus.FAILURE)
            manager.callback.onConnected(first)
            expect(firstClose.results.size == 1 && firstJoin.results.size == 1 &&
                secondClose.results.size == 1 && secondJoin.results.size == 1 && disconnectedEvents == 1,
                "late P1 callback changed terminal results or current state")
            expect(manager.cancellations.size == 2, "SDK cancellations did not match one close per peripheral")
            session.release()
        }
    }
    for (shutdown in listOf(false, true)) {
        test("${if (shutdown) "adapter shutdown" else "power loss"} rejects all retired and current disconnect waiters once") {
            val (session, manager, first) = fixture()
            val firstClose = Observed(session.closeBLEConnection(id))
            val firstJoin = Observed(session.closeBLEConnection(id))
            val deliverFirst = manager.deferredDisconnect(first)
            session.createBLEConnection(id)
            val second = manager.getPeripheral(id)
            manager.connected(second)
            val secondClose = Observed(session.closeBLEConnection(id))
            val deliverSecond = manager.deferredDisconnect(second)
            session.createBLEConnection(id)
            val third = manager.getPeripheral(id)
            manager.connected(third)
            val thirdClose = Observed(session.closeBLEConnection(id))
            expect(manager.cancellations.count { it === first } == 1 &&
                manager.cancellations.count { it === second } == 1 &&
                manager.cancellations.count { it === third } == 1,
                "shutdown setup did not retain three independent native close requests")
            expect(listOf(firstClose, firstJoin, secondClose, thirdClose).all { it.results.isEmpty() },
                "a disconnect waiter settled before global shutdown")
            if (shutdown) expect(Observed(session.closeBluetoothAdapter()).succeeded, "adapter shutdown failed")
            else manager.poweredOff()
            val results = listOf(firstClose, firstJoin, secondClose, thirdClose)
            expect(results.all { it.failed && it.results.size == 1 },
                "global shutdown left a retired/current disconnect waiter pending")
            val messages = results.map { it.message }
            deliverFirst()
            deliverSecond()
            manager.disconnected(third)
            manager.callback.onConnectionFailed(first, HciStatus.FAILURE)
            manager.callback.onConnected(second)
            expect(results.all { it.failed && it.results.size == 1 } && results.map { it.message } == messages,
                "late terminal delivery overwrote a globally cancelled close")
            session.release()
        }
    }
    test("retired close observer can close the replacement without old cleanup consuming its waiter") {
        val (session, manager, first) = fixture()
        val closing = session.closeBLEConnection(id)
        val firstClose = Observed(closing)
        val deliverFirst = manager.deferredDisconnect(first)
        session.createBLEConnection(id)
        val second = manager.getPeripheral(id)
        manager.connected(second)
        var secondClose: Observed<Unit>? = null
        closing.observe { secondClose = Observed(session.closeBLEConnection(id)) }
        deliverFirst()
        expect(firstClose.succeeded && firstClose.results.size == 1 &&
            manager.cancellations.count { it === second } == 1 && secondClose?.results?.isEmpty() == true,
            "retired settlement lost reentrant P2 close or consumed its waiter")
        manager.disconnected(second)
        expect(secondClose?.succeeded == true && secondClose?.results?.size == 1,
            "reentrant P2 close did not settle on its own terminal callback")
        session.release()
    }
    test("retired pair timer cannot reject a successor, delete its PIN, or drain its FIFO") {
        val (session, manager, peripheral) = fixture()
        val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        val queued = Observed(session.getBLEDeviceRSSI(id))
        expect(manager.bonds == 1, "second pair bypassed the active native FIFO")
        peripheral.bondState = BondState.NONE
        peripheral.callback!!.onBondingFailed(peripheral)
        TestClock.runPosted()
        expect(first.failed && second.results.isEmpty() && manager.bonds == 2, "early failure did not admit B")
        TestClock.advanceBy(100)
        expect(TestClock.executed == 1, "retired production timer did not execute")
        expect(second.results.isEmpty() && queued.results.isEmpty() && peripheral.rssiReads == 0,
            "retired A timeout rejected B or drained its queued RSSI")
        expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true,
            "retired A timeout deleted B's PIN before the real receiver could submit it")
        peripheral.bondState = BondState.BONDED
        peripheral.callback!!.onBondingSucceeded(peripheral)
        TestClock.runPosted()
        expect(second.succeeded && second.results.size == 1 && peripheral.rssiReads == 1,
            "B's own bond success did not settle it and advance its FIFO")
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        TestClock.advanceBy(1_000)
        expect(first.results.size == 1 && second.succeeded && second.results.size == 1 && queued.succeeded,
            "late B timer changed completed pair results")
        session.release()
    }
    test("active pair timeout cannot delete a PIN created by its reentrant failure observer") {
        val (session, manager, peripheral) = fixture()
        val pairing = session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0))
        val first = Observed(pairing)
        var second: Observed<Unit>? = null
        pairing.observe {
            peripheral.bondState = BondState.NONE
            second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        }
        TestClock.advanceBy(100)
        expect(first.failed && first.message.contains("PAIR_TIMEOUT") &&
            second?.results?.isEmpty() == true && manager.bonds == 1,
            "active timeout admitted its observer's successor before native drain")
        peripheral.deferredBondTerminal("failure")()
        TestClock.runPosted()
        expect(manager.bonds == 2, "native drain did not admit the observer's successor")
        expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true,
            "completed timer removed the reentrant successor's PIN")
        val queued = Observed(session.getBLEDeviceRSSI(id))
        expect(queued.results.isEmpty() && peripheral.rssiReads == 0, "B did not retain the device FIFO")
        peripheral.bondState = BondState.BONDED
        peripheral.callback!!.onBondingSucceeded(peripheral)
        TestClock.runPosted()
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        TestClock.advanceBy(1_000)
        expect(first.results.size == 1 && second?.succeeded == true &&
            second?.results?.size == 1 && queued.succeeded, "reentrant pair did not finish independently")
        session.release()
    }
    test("adapter reopen retires pair timers before a new manager owns the same address and PIN") {
        val (session, _, oldPeripheral) = fixture()
        val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        session.closeBluetoothAdapter()
        session.openBluetoothAdapter()
        val manager = BluetoothCentralManager.last
        val peripheral = manager.getPeripheral(id)
        peripheral.connectionState = ConnectionState.CONNECTED
        val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        val queued = Observed(session.getBLEDeviceRSSI(id))
        TestClock.advanceBy(100)
        expect(TestClock.executed == 1 && first.failed && first.results.size == 1,
            "old manager's pending timer or cancellation was not exercised")
        expect(second.results.isEmpty() && queued.results.isEmpty() && peripheral.rssiReads == 0,
            "old adapter timer rejected fresh work or advanced its FIFO")
        expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true,
            "old adapter timer deleted the new manager's pairing PIN")
        oldPeripheral.callback!!.onBondingFailed(oldPeripheral)
        expect(second.results.isEmpty(), "old adapter callback rejected the new pair")
        peripheral.bondState = BondState.NONE
        peripheral.callback!!.onBondingFailed(peripheral)
        TestClock.runPosted()
        expect(second.failed && second.message.contains("PAIR_FAILED") && peripheral.rssiReads == 1,
            "B's own failure did not settle it and advance the FIFO")
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        TestClock.advanceBy(1_000)
        expect(second.results.size == 1 && queued.succeeded, "late timer changed B's terminal failure")
        session.release()
    }
    test("successor pair retains its own deadline after the retired timer runs") {
        val (session, _, peripheral) = fixture()
        val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        val queued = Observed(session.getBLEDeviceRSSI(id))
        peripheral.bondState = BondState.NONE
        peripheral.callback!!.onBondingFailed(peripheral)
        TestClock.runPosted()
        TestClock.advanceBy(100)
        expect(second.results.isEmpty() && peripheral.rssiReads == 0, "retired timer beat B's deadline")
        expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true, "B lost its pending PIN")
        TestClock.advanceBy(899)
        expect(second.results.isEmpty() && queued.results.isEmpty(), "B timeout ran before its own deadline")
        TestClock.advanceBy(1)
        expect(second.failed && second.message.contains("PAIR_TIMEOUT") &&
            second.results.size == 1 && peripheral.rssiReads == 0 && queued.results.isEmpty(),
            "B's own timer failed to settle its caller while pinning the native FIFO")
        expect(submittedPairingPin() == null, "B's terminal timeout retained its PIN")
        peripheral.deferredBondTerminal("failure")()
        TestClock.runPosted()
        expect(peripheral.rssiReads == 1, "B's terminal drain did not release the native FIFO")
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        expect(first.results.size == 1 && queued.succeeded, "pair timeout overwrote A or lost queued RSSI")
        session.release()
    }
    for (terminal in listOf("failure", "lost")) {
        test("pair timeout pins the native device until deferred $terminal delivery drains") {
            val (session, manager, peripheral) = fixture()
            // The old implementation's manager entrypoint is only valid while
            // disconnected. This setup isolates the drain race from admission.
            peripheral.connectionState = ConnectionState.DISCONNECTED
            val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
            val retiredCallback = peripheral.callback!!
            val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
            val queued = Observed(session.getBLEDeviceRSSI(id))
            val deliverFirst = peripheral.deferredBondTerminal(terminal)
            TestClock.advanceBy(100)
            expect(first.failed && first.message.contains("PAIR_TIMEOUT") && first.results.size == 1,
                "caller timeout was delayed until native drain")
            expect(manager.bonds == 1 && second.results.isEmpty() && peripheral.rssiReads == 0,
                "OS NONE freed the device before its posted terminal callback")
            expect(submittedPairingPin() == null, "timed-out attempt retained a PIN")
            val other = manager.getPeripheral("AA:BB:CC:DD:EE:02")
            session.createBLEConnection(other.address)
            manager.connected(other)
            val otherResult = Observed(session.getBLEDeviceRSSI(other.address))
            expect(other.rssiReads == 1 && otherResult.results.isEmpty(), "pair drain blocked another device")
            deliverFirst()
            expect(manager.bonds == 1 && second.results.isEmpty(), "terminal callback resumed B before its handler drain")
            TestClock.runPosted()
            expect(manager.bonds == 2 && second.results.isEmpty() && peripheral.rssiReads == 0,
                "terminal drain did not admit exactly one B pair")
            peripheral.connectionState = ConnectionState.CONNECTED
            expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true, "B did not own its PIN after drain")
            val deliverSecond = peripheral.deferredBondTerminal("failure")
            retiredCallback.onBondingFailed(peripheral)
            TestClock.runPosted()
            expect(second.results.isEmpty() && peripheral.rssiReads == 0,
                "late captured A terminal freed or rejected B's next fence")
            deliverSecond()
            TestClock.runPosted()
            expect(second.failed && second.message.contains("PAIR_FAILED") &&
                second.results.size == 1 && peripheral.rssiReads == 1, "B's own terminal did not release its device")
            peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
            other.callback!!.onReadRemoteRssi(other, -40, GattStatus.SUCCESS)
            expect(queued.succeeded && otherResult.succeeded && first.results.size == 1,
                "native drain overwrote timeout or lost either device's successor")
            session.release()
        }
    }
    test("posted duplicate pair terminals drain before a mutable SDK callback can become B") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        val terminal = peripheral.deferredBondTerminal("failure")
        TestClock.advanceBy(100)
        TestClock.post(terminal)
        TestClock.post(terminal)
        TestClock.runPosted()
        expect(first.failed && first.results.size == 1 && manager.bonds == 2 && second.results.isEmpty(),
            "queued A terminal was retargeted to B or released the next fence")
        expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true, "duplicate A terminal removed B's PIN")
        session.closeBluetoothAdapter()
        session.release()
    }
    for (releaseBeforeTimeout in listOf(false, true)) {
        test("session release ${if (releaseBeforeTimeout) "before" else "after"} timeout preserves the other owner's native pair fence") {
            val (a, manager, peripheral) = fixture()
            val b = core.createSession()
            peripheral.connectionState = ConnectionState.DISCONNECTED
            val first = Observed(a.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
            val second = Observed(b.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
            val terminal = peripheral.deferredBondTerminal("failure")
            if (releaseBeforeTimeout) a.release()
            TestClock.advanceBy(100)
            if (!releaseBeforeTimeout) a.release()
            expect(first.failed && first.results.size == 1 && manager.bonds == 1 && second.results.isEmpty(),
                "session release or timeout freed an undrained OS pair")
            terminal()
            TestClock.runPosted()
            expect(manager.bonds == 2 && second.results.isEmpty(), "remaining owner did not enter after native drain")
            peripheral.deferredBondTerminal("success")()
            TestClock.runPosted()
            expect(second.succeeded && first.results.size == 1, "remaining owner lost its pair or cancellation won twice")
            b.release()
        }
    }
    for (invalidation in listOf("power", "deviceClose", "adapterClose")) {
        test("$invalidation retires a pair fence without an old drain releasing its replacement") {
            val (session, oldManager, oldPeripheral) = fixture()
            oldPeripheral.connectionState = ConnectionState.DISCONNECTED
            val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
            oldPeripheral.connectionState = ConnectionState.CONNECTED
            val retired = oldPeripheral.callback!!
            val terminal = oldPeripheral.deferredBondTerminal("failure")
            TestClock.advanceBy(100)
            terminal() // Drain is posted, but has not run.
            if (invalidation == "power") {
                oldManager.poweredOff()
                oldManager.isBluetoothEnabled = true
                oldManager.callback.onBluetoothAdapterStateChanged(android.bluetooth.BluetoothAdapter.STATE_ON)
            } else if (invalidation == "deviceClose") {
                session.closeBLEConnection(id)
                oldManager.disconnected(oldPeripheral)
            } else {
                session.closeBluetoothAdapter()
                session.openBluetoothAdapter()
            }
            val manager = BluetoothCentralManager.last
            // A replacement SDK instance is safe even while old delivery drains.
            if (invalidation != "adapterClose") manager.devices.remove(id)
            val peripheral = manager.getPeripheral(id)
            peripheral.connectionState = ConnectionState.DISCONNECTED
            val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
            peripheral.connectionState = ConnectionState.CONNECTED
            val queued = Observed(session.getBLEDeviceRSSI(id))
            retired.onBondingFailed(oldPeripheral)
            TestClock.runPosted()
            expect(first.failed && first.results.size == 1 && second.results.isEmpty() &&
                peripheral.rssiReads == 0, "old generation's drain freed the replacement fence")
            expect(submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true, "retired callback removed the replacement PIN")
            peripheral.deferredBondTerminal("success")()
            TestClock.runPosted()
            expect(second.succeeded && peripheral.rssiReads == 1, "replacement could not finish after invalidation")
            peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
            expect(queued.succeeded, "replacement FIFO could not finish")
            session.release()
        }
    }
    test("immediately refused SDK bond does not leave a device fence pinned") {
        val (session, manager, peripheral) = fixture()
        peripheral.acceptsBond = false
        val pairing = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        val queued = Observed(session.getBLEDeviceRSSI(id))
        TestClock.runPosted()
        expect(pairing.failed && pairing.message.contains("PAIR_FAILED") && manager.bonds == 0 &&
            peripheral.rssiReads == 1 && submittedPairingPin() == null, "refused native admission stranded a PIN or FIFO")
        peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
        expect(queued.succeeded, "refused bond did not release device work")
        session.release()
    }
    test("power recovery refuses same SDK instance reuse until its retired bond terminal drains") {
        val (session, manager, peripheral) = fixture()
        peripheral.connectionState = ConnectionState.DISCONNECTED
        val first = Observed(session.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
        val old = peripheral.callback!!
        val terminal = peripheral.deferredBondTerminal("failure")
        TestClock.advanceBy(100)
        manager.poweredOff()
        manager.isBluetoothEnabled = true
        manager.callback.onBluetoothAdapterStateChanged(android.bluetooth.BluetoothAdapter.STATE_ON)
        val refused = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        expect(refused.failed && refused.message.contains("PAIR_FAILED") && manager.bonds == 1,
            "power recovery rebound a mutable SDK callback before the retired terminal drained")
        terminal()
        TestClock.runPosted()
        val second = Observed(session.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
        expect(second.results.isEmpty() && manager.bonds == 2, "drained SDK instance could not be paired again")
        val ownTerminal = peripheral.deferredBondTerminal("failure")
        old.onBondingFailed(peripheral)
        TestClock.runPosted()
        expect(second.results.isEmpty() && submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true,
            "late retired terminal mutated the replacement attempt")
        ownTerminal()
        TestClock.runPosted()
        expect(first.results.size == 1 && second.failed && second.results.size == 1,
            "power recovery did not keep independent terminal results")
        session.release()
    }
    for (terminalKind in listOf("success", "failure", "lost")) {
        test("same-instance reconnect preserves retired pair $terminalKind routing through its replacement callback") {
            val (a, manager, peripheral) = fixture()
            val b = core.createSession()
            peripheral.connectionState = ConnectionState.DISCONNECTED
            val first = Observed(a.makeBluetoothPair(BlePairParams(id, "AQID", 100.0)))
            val originalCallback = peripheral.callback!!
            val closing = Observed(b.closeBLEConnection(id))
            expect(closing.succeeded && first.failed && first.results.size == 1 &&
                manager.cancellations.isEmpty(), "disconnected pair close did not retire A without SDK cancellation")
            val connecting = Observed(b.createBLEConnection(id))
            val reconnectCallback = peripheral.callback!!
            expect(manager.getPeripheral(id) === peripheral && reconnectCallback !== originalCallback &&
                manager.connects == 1, "reconnect did not replace the callback on the same cached SDK object")
            var disconnectedEvents = 0
            b.onConnectStateChange { if (!it.connected) disconnectedEvents++ }
            // The terminal lambda reads the new mutable callback, not A's old callback.
            peripheral.deferredBondTerminal(terminalKind)()
            expect(connecting.results.isEmpty() && disconnectedEvents == 0 && first.results.size == 1,
                "retired bond terminal mutated current connection state or settled A twice")
            TestClock.runPosted()
            manager.connected(peripheral)
            expect(connecting.succeeded && connecting.results.size == 1, "reconnect could not complete independently")
            if (terminalKind == "success") {
                expect(Observed(b.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0))).succeeded,
                    "delivered retired success still blocked already-bonded pair admission")
            }
            // A later unbonded state also needs genuine SDK admission, not just
            // the already-bonded fast path, on the same cached object.
            peripheral.bondState = BondState.NONE
            val second = Observed(b.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
            val queued = Observed(b.getBLEDeviceRSSI(id))
            expect(manager.bonds == 2 && second.results.isEmpty() && peripheral.rssiReads == 0,
                "retired terminal was lost by reconnect and permanently quarantined the SDK object")
            val ownTerminal = peripheral.deferredBondTerminal("failure")
            originalCallback.onBondingFailed(peripheral)
            reconnectCallback.onBondingFailed(peripheral)
            TestClock.runPosted()
            expect(second.results.isEmpty() && peripheral.rssiReads == 0 &&
                submittedPairingPin()?.contentEquals(byteArrayOf(4, 5, 6)) == true,
                "old pair/reconnect callback settled B, removed its PIN, or released its fence")
            ownTerminal()
            TestClock.runPosted()
            expect(second.failed && second.results.size == 1 && peripheral.rssiReads == 1 &&
                disconnectedEvents == 0, "B's own terminal did not drain only B's pairing fence")
            peripheral.callback!!.onReadRemoteRssi(peripheral, -40, GattStatus.SUCCESS)
            expect(queued.succeeded && first.results.size == 1, "pair drain lost queued work or overwrote A")
            a.release(); b.release()
        }
    }
    for (powerLoss in listOf(false, true)) {
        test("${if (powerLoss) "power recovery" else "reentrant shared-session close"} reconnect keeps retired terminal routing") {
            val (a, manager, peripheral) = fixture()
            val b = core.createSession()
            peripheral.connectionState = ConnectionState.DISCONNECTED
            val pairing = a.makeBluetoothPair(BlePairParams(id, "AQID", 100.0))
            val first = Observed(pairing)
            var connecting: Observed<Unit>? = null
            if (!powerLoss) pairing.observe {
                a.release()
                connecting = Observed(b.createBLEConnection(id))
            }
            if (powerLoss) {
                manager.poweredOff()
                a.release()
                manager.isBluetoothEnabled = true
                manager.callback.onBluetoothAdapterStateChanged(android.bluetooth.BluetoothAdapter.STATE_ON)
                connecting = Observed(b.createBLEConnection(id))
            } else {
                expect(Observed(b.closeBLEConnection(id)).succeeded, "reentrant close failed")
            }
            expect(first.failed && first.results.size == 1 && manager.connects == 1 &&
                connecting?.results?.isEmpty() == true, "retirement did not admit the other session's reconnect once")
            peripheral.deferredBondTerminal("failure")()
            TestClock.runPosted()
            manager.connected(peripheral)
            expect(connecting?.succeeded == true, "retired terminal rejected the other session's connection")
            val second = Observed(b.makeBluetoothPair(BlePairParams(id, "BAUG", 1_000.0)))
            expect(manager.bonds == 2 && second.results.isEmpty(),
                "replacement callback lost the retired terminal across close/power/session release")
            peripheral.deferredBondTerminal("success")()
            TestClock.runPosted()
            TestClock.advanceBy(1_000)
            expect(second.succeeded && second.results.size == 1 && first.results.size == 1,
                "shared-session terminal or old timer changed a completed result")
            b.release()
        }
    }
    if (selected != "--list") println("Kotlin native queue failures: $failures")
    exitProcess(if (failures == 0) 0 else 1)
}
