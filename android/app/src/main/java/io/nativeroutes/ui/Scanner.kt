// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/Scanner.kt).
package io.nativeroutes.ui

import android.Manifest
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.TorchState
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

data class ScannerResult(val value: String, val type: String)

private val scannerTorchAreaHeight = 136.dp

/** Native camera and chrome, reusable by Compose hosts without a RN or route dependency. */
@Composable
fun Scanner(
    active: Boolean,
    onScan: (ScannerResult) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    topInset: Float = 0f,
    bottomInset: Float = 0f,
    errorMessage: String = "",
) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val activity = remember(context) { context.scannerActivity() }
    val permission = remember(context, activity) { ScannerPermission(context, activity) }
    val scanCallback by rememberUpdatedState(onScan)
    var foreground by remember(owner) { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var reported by remember { mutableStateOf(false) }
    var cameraError by remember { mutableStateOf("") }
    var ready by remember { mutableStateOf(false) }
    var torchAvailable by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    var session by remember { mutableStateOf<ScannerCameraSession?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    val preview = remember(context) {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
            setBackgroundColor(android.graphics.Color.BLACK)
        }
    }

    DisposableEffect(owner, permission) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (foreground) permission.refresh()
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer); permission.close() }
    }
    LaunchedEffect(active) {
        if (!active) { reported = false; cameraError = "" }
    }
    LaunchedEffect(active, foreground, permission.granted) {
        if (active && foreground && !permission.granted && !permission.requested) permission.request()
    }
    val enabled = active && foreground && permission.granted && !reported && errorMessage.isBlank()
    DisposableEffect(enabled, owner, preview, retry) {
        if (enabled) {
            cameraError = ""
            val next = ScannerCameraSession(context, owner, preview,
                onResult = { result ->
                    // Set the latch before dispatching: a synchronous caller may change props.
                    if (!reported) { reported = true; scanCallback(result) }
                },
                onReady = { isReady, hasTorch -> ready = isReady; torchAvailable = hasTorch },
                onTorch = { torchOn = it },
                onError = { cameraError = it },
            )
            session = next
            next.start()
            onDispose { next.close(); if (session === next) session = null; ready = false; torchAvailable = false; torchOn = false }
        } else {
            ready = false; torchAvailable = false; torchOn = false
            onDispose { }
        }
    }

    val colors = uiColors()
    val failure = errorMessage.ifBlank { cameraError.ifBlank { permission.error } }
    Box(modifier.background(UiDesign.palette.black)) {
        AndroidView(factory = { preview }, modifier = Modifier.fillMaxSize())
        ScannerFrame(Modifier.matchParentSize(), ready && enabled, topInset, bottomInset,
            showFrame = permission.granted && failure.isBlank())
        Column(Modifier.fillMaxSize().padding(top = topInset.scannerInset().dp, bottom = bottomInset.scannerInset().dp)) {
            Box(Modifier.fillMaxWidth().height(UiDesign.size.navNative.dp), contentAlignment = Alignment.Center) {
                Text("扫一扫", color = UiDesign.palette.white, fontSize = UiDesign.font.nav.sp, fontWeight = FontWeight.Bold)
                Box(Modifier.align(Alignment.CenterStart).padding(start = UiDesign.space.sm.dp).size(UiDesign.size.back.dp)
                    .clip(CircleShape).semantics { contentDescription = "返回" }
                    .clickable(role = Role.Button, onClick = onBack), contentAlignment = Alignment.Center) {
                    UiIcon(UiIconKind.Back, UiDesign.palette.white, Modifier.size(UiDesign.icon.back.dp))
                }
            }
            when {
                failure.isNotBlank() -> ScannerMessage(if (errorMessage.isBlank()) "相机暂时不可用" else "暂时无法完成扫码",
                    failure, if (errorMessage.isBlank()) "重试" else "返回", {
                    if (errorMessage.isNotBlank()) onBack()
                    else { permission.error = ""; permission.refresh(); retry++ }
                }, Modifier.weight(1f))
                !permission.granted -> ScannerMessage(
                    "需要相机权限",
                    if (permission.blocked) "请在系统设置中允许使用相机" else "需要相机权限才能扫描二维码和条形码",
                    if (permission.blocked) "打开设置" else "允许使用相机",
                    { if (permission.blocked) permission.openSettings() else permission.request() }, Modifier.weight(1f),
                )
                else -> Column(Modifier.weight(1f)) {
                    Spacer(Modifier.weight(1f).fillMaxWidth())
                    Column(Modifier.fillMaxWidth().height(scannerTorchAreaHeight),
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Box(Modifier.size(56.dp).clip(CircleShape)
                            .background(if (torchOn) colors.primary else UiDesign.media.torchOff)
                            .semantics { contentDescription = if (torchOn) "关闭手电筒" else if (torchAvailable) "打开手电筒" else "当前相机没有闪光灯" }
                            .clickable(enabled = enabled && ready && torchAvailable, role = Role.Button) { session?.setTorch(!torchOn) },
                            contentAlignment = Alignment.Center) { ScannerFlashlight(Modifier.size(26.dp), if (torchAvailable) UiDesign.palette.white else UiDesign.palette.grayDark) }
                        Spacer(Modifier.height(8.dp))
                        Text(if (torchOn) "轻触关闭" else "轻触照亮", color = if (torchAvailable) UiDesign.palette.white else UiDesign.palette.grayDark, fontSize = UiDesign.font.section.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ScannerMessage(title: String, message: String, action: String, onAction: () -> Unit, modifier: Modifier) {
    val colors = uiColors()
    Box(modifier.fillMaxWidth().background(colors.page).padding(UiDesign.space.content.dp), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = UiDesign.size.dialogWidth.dp).fillMaxWidth().verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(UiDesign.space.lg.dp)) {
            UiIcon(UiIconKind.Camera, colors.muted, Modifier.size(UiDesign.size.back.dp))
            Text(title, color = colors.text, fontSize = UiDesign.font.sheetTitle.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
            Text(message, color = colors.muted, fontSize = UiDesign.font.title.sp, lineHeight = UiDesign.font.valueLine.sp, textAlign = TextAlign.Center)
            ActionButton(action, onAction, Modifier.widthIn(max = 180.dp).fillMaxWidth())
        }
    }
}

@Composable
private fun ScannerFrame(modifier: Modifier, moving: Boolean, topInset: Float, bottomInset: Float, showFrame: Boolean) {
    val progress = if (moving) {
        val transition = rememberInfiniteTransition(label = "scanner-line")
        transition.animateFloat(0f, 1f, infiniteRepeatable(tween(1800, easing = LinearEasing), RepeatMode.Reverse), label = "scanner-line-position").value
    } else 0.5f
    Canvas(modifier) {
        // Keep the original viewfinder centered between the navigation bar and torch controls.
        val contentTop = topInset.scannerInset().dp.toPx() + UiDesign.size.navNative.dp.toPx()
        val contentBottom = size.height - bottomInset.scannerInset().dp.toPx() - scannerTorchAreaHeight.toPx()
        val contentHeight = (contentBottom - contentTop).coerceAtLeast(0f)
        val side = minOf(size.width * 0.68f, contentHeight * 0.85f)
        val left = (size.width - side) / 2f
        val top = contentTop + (contentHeight - side) / 2f
        val right = left + side
        val bottom = top + side
        val scrim = Path().apply {
            fillType = PathFillType.EvenOdd
            addRect(Rect(Offset.Zero, size))
            if (showFrame && side > 0f) addRect(Rect(left, top, right, bottom))
        }
        // One full-screen scrim keeps the title, safe areas and torch region at the same tone.
        drawPath(scrim, UiDesign.palette.black.copy(alpha = 0.42f))
        if (!showFrame || side <= 0f) return@Canvas
        val corner = minOf(24.dp.toPx(), side / 4f)
        val path = Path().apply {
            moveTo(left, top + corner); lineTo(left, top); lineTo(left + corner, top)
            moveTo(right - corner, top); lineTo(right, top); lineTo(right, top + corner)
            moveTo(left, bottom - corner); lineTo(left, bottom); lineTo(left + corner, bottom)
            moveTo(right - corner, bottom); lineTo(right, bottom); lineTo(right, bottom - corner)
        }
        drawPath(path, UiDesign.palette.white, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Square))
        if (moving) {
            val inset = 4.dp.toPx().coerceAtMost(side / 4f)
            val y = top + inset + (side - 2f * inset) * progress
            drawLine(UiDesign.palette.blueLight, Offset(left + inset, y), Offset(right - inset, y), 2.dp.toPx())
        }
    }
}

@Composable
private fun ScannerFlashlight(modifier: Modifier, tint: Color) {
    Canvas(modifier) {
        val s = size.minDimension / 24f
        val path = Path().apply {
            moveTo(6f * s, 3f * s); lineTo(18f * s, 3f * s); lineTo(18f * s, 7f * s)
            lineTo(15f * s, 11f * s); lineTo(15f * s, 21f * s); lineTo(9f * s, 21f * s)
            lineTo(9f * s, 11f * s); lineTo(6f * s, 7f * s); close()
            moveTo(6f * s, 7f * s); lineTo(18f * s, 7f * s)
        }
        drawPath(path, tint, style = Stroke(width = 1.8f * s, cap = StrokeCap.Round))
        drawCircle(tint, radius = s, center = Offset(12f * s, 15f * s))
    }
}

private fun Float.scannerInset() = if (isFinite()) coerceAtLeast(0f) else 0f
private fun Context.scannerActivity(): ComponentActivity? = when (this) {
    is ComponentActivity -> this
    is ContextWrapper -> if (baseContext !== this) baseContext.scannerActivity() else null
    else -> null
}

private class ScannerPermission(private val context: Context, private val activity: ComponentActivity?) {
    private val preferences = context.getSharedPreferences("demo-ui-scanner", Context.MODE_PRIVATE)
    var granted by mutableStateOf(false)
        private set
    var blocked by mutableStateOf(false)
        private set
    var requested by mutableStateOf(preferences.getBoolean("camera-requested", false))
        private set
    var error by mutableStateOf("")
    private var launcher: ActivityResultLauncher<String>? = null
    private var requesting = false
    init { refresh() }
    fun refresh() {
        granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        blocked = !granted && requested && activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.CAMERA)
    }
    fun request() {
        if (requesting || granted) return
        val host = activity ?: run { error = "当前页面无法请求相机权限"; return }
        try {
            if (launcher == null) launcher = host.activityResultRegistry.register("scanner-camera-${UUID.randomUUID()}", ActivityResultContracts.RequestPermission()) {
                requesting = false; refresh()
            }
            requesting = true
            requested = true
            preferences.edit().putBoolean("camera-requested", true).apply()
            launcher?.launch(Manifest.permission.CAMERA)
        } catch (_: Exception) { requesting = false; error = "无法请求相机权限，请稍后重试" }
    }
    fun openSettings() {
        try { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (_: Exception) { error = "无法打开系统设置" }
    }
    fun close() { launcher?.unregister(); launcher = null }
}

/** Owns only this scanner's use cases. All mutations and result delivery occur on main. */
private class ScannerCameraSession(
    context: Context,
    private val owner: LifecycleOwner,
    private val previewView: PreviewView,
    private val onResult: (ScannerResult) -> Unit,
    private val onReady: (Boolean, Boolean) -> Unit,
    private val onTorch: (Boolean) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val main = ContextCompat.getMainExecutor(context)
    private val executor = Executors.newSingleThreadExecutor()
    private val delivered = AtomicBoolean(false)
    private val processing = AtomicBoolean(false)
    private val scanner: BarcodeScanner = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(
        Barcode.FORMAT_QR_CODE, Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8,
        Barcode.FORMAT_CODE_128, Barcode.FORMAT_CODE_39, Barcode.FORMAT_UPC_A,
    ).build())
    private val future = ProcessCameraProvider.getInstance(context)
    private var provider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var analysis: ImageAnalysis? = null
    private var camera: Camera? = null
    @Volatile private var generation = 0
    @Volatile private var closed = false
    private var failed = false
    private val cameraObserver = Observer<CameraState> { state ->
        if (!closed && camera != null) {
            if (state.error != null) fail("相机不可用，请稍后重试")
            else onReady(state.type == CameraState.Type.OPEN, camera?.cameraInfo?.hasFlashUnit() == true)
        }
    }
    private val torchObserver = Observer<Int> { if (!closed) onTorch(it == TorchState.ON) }
    private val attachListener = object : View.OnAttachStateChangeListener {
        override fun onViewAttachedToWindow(view: View) { bind() }
        override fun onViewDetachedFromWindow(view: View) { stop() }
    }
    private val layoutListener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
        val rotation = previewView.display?.rotation ?: android.view.Surface.ROTATION_0
        preview?.targetRotation = rotation
        analysis?.targetRotation = rotation
    }

    fun start() {
        previewView.addOnAttachStateChangeListener(attachListener)
        previewView.addOnLayoutChangeListener(layoutListener)
        if (previewView.isAttachedToWindow) bind()
    }
    private fun bind() {
        if (closed || failed || delivered.get() || preview != null || !previewView.isAttachedToWindow) return
        val token = ++generation
        future.addListener({
            if (closed || token != generation || !previewView.isAttachedToWindow || !owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return@addListener
            try {
                val source = future.get()
                provider = source
                if (!source.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) { fail("当前设备没有可用的后置相机"); return@addListener }
                val rotation = previewView.display?.rotation ?: android.view.Surface.ROTATION_0
                val newPreview = Preview.Builder().setTargetRotation(rotation).build()
                val newAnalysis = ImageAnalysis.Builder().setTargetRotation(rotation)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                preview = newPreview; analysis = newAnalysis
                newPreview.setSurfaceProvider(previewView.surfaceProvider)
                newAnalysis.setAnalyzer(executor, ::analyze)
                camera = source.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, newPreview, newAnalysis)
                camera?.cameraInfo?.cameraState?.observe(owner, cameraObserver)
                camera?.cameraInfo?.torchState?.observe(owner, torchObserver)
            } catch (_: Exception) { fail("无法启动相机，请确认相机未被其他应用占用") }
        }, main)
    }

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
    private fun analyze(image: ImageProxy) {
        if (closed || delivered.get() || !processing.compareAndSet(false, true)) { image.close(); return }
        val token = generation
        val media = image.image
        if (media == null) { processing.set(false); image.close(); return }
        try {
            scanner.process(InputImage.fromMediaImage(media, image.imageInfo.rotationDegrees))
                .addOnSuccessListener(main) { barcodes ->
                    if (!closed && token == generation && previewView.isAttachedToWindow && owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) {
                        val result = barcodes.firstNotNullOfOrNull { barcode ->
                            val value = barcode.rawValue?.takeIf { it.isNotBlank() }
                            val type = scannerBarcodeType(barcode.format)
                            if (value != null && type != null) ScannerResult(value, type) else null
                        }
                        if (result != null && delivered.compareAndSet(false, true)) {
                            stop()
                            onResult(result)
                        }
                    }
                }
                .addOnFailureListener(main) { if (!closed && token == generation) fail("无法识别相机画面，请重试") }
                .addOnCompleteListener(main) { image.close(); processing.set(false); if (closed) scanner.close() }
        } catch (_: Exception) {
            image.close(); processing.set(false)
            main.execute { if (!closed && token == generation) fail("无法识别相机画面，请重试") else if (closed) scanner.close() }
        }
    }
    fun setTorch(enabled: Boolean) {
        val target = camera ?: return
        if (!target.cameraInfo.hasFlashUnit() || closed) return
        val task = target.cameraControl.enableTorch(enabled)
        val token = generation
        task.addListener({ if (!closed && token == generation) runCatching { task.get() }.onFailure { fail("无法切换手电筒，请重试") } }, main)
    }
    private fun fail(message: String) {
        failed = true
        stop()
        onError(message)
    }
    private fun stop() {
        generation++
        camera?.cameraInfo?.cameraState?.removeObserver(cameraObserver)
        camera?.cameraInfo?.torchState?.removeObserver(torchObserver)
        runCatching { camera?.cameraControl?.enableTorch(false) }
        camera = null
        analysis?.clearAnalyzer()
        val cases = listOfNotNull(preview, analysis)
        if (cases.isNotEmpty()) runCatching { provider?.unbind(*cases.toTypedArray()) }
        preview = null; analysis = null
        onReady(false, false); onTorch(false)
    }
    fun close() {
        if (closed) return
        closed = true
        previewView.removeOnAttachStateChangeListener(attachListener)
        previewView.removeOnLayoutChangeListener(layoutListener)
        stop()
        executor.shutdown()
        if (!processing.get()) scanner.close()
    }
}

private fun scannerBarcodeType(format: Int): String? = when (format) {
    Barcode.FORMAT_QR_CODE -> "qr"
    Barcode.FORMAT_EAN_13 -> "ean13"
    Barcode.FORMAT_EAN_8 -> "ean8"
    Barcode.FORMAT_CODE_128 -> "code128"
    Barcode.FORMAT_CODE_39 -> "code39"
    Barcode.FORMAT_UPC_A -> "upc_a"
    else -> null
}
