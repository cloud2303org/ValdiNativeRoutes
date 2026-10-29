// From ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/AttachmentControls.kt). Unlike there, picked files are
// copied into the cache too: AttachmentAsset.uri is a file:// path that outlives the picker's temporary grant.
package io.nativeroutes.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.util.UUID
import java.util.concurrent.Executors

/** Every asset is a copy in [AttachmentCache]; the caller owns upload/persistence. */
data class AttachmentAsset(val id: String, val uri: String, val name: String, val mimeType: String, val size: Double)
class AttachmentFileProvider : FileProvider()

object AttachmentCache {
    internal fun directory(context: Context) = File(context.cacheDir, "attachments")

    /** Call after selection, upload and preview finish; existing cache URIs become invalid. */
    fun clear(context: Context) {
        val directory = directory(context).toPath()
        if (Files.notExists(directory, LinkOption.NOFOLLOW_LINKS)) return
        Files.walk(directory).use { paths ->
            paths.sorted(Comparator.reverseOrder()).forEach { Files.delete(it) }
        }
    }
}

class AttachmentPicker(private val activity: ComponentActivity) : DefaultLifecycleObserver {
    private val main = Handler(Looper.getMainLooper())
    private var pending: ((Result<List<AttachmentAsset>>) -> Unit)? = null
    private val launchers = mutableListOf<ActivityResultLauncher<*>>()
    private var cameraFile: File? = null
    private var limit = 1
    private var generation = 0
    init { activity.lifecycle.addObserver(this) }

    fun pick(source: String, limit: Int = 1, mimeTypes: List<String> = listOf("*/*"),
             result: (Result<List<AttachmentAsset>>) -> Unit) {
        if (pending != null) { result(Result.failure(IllegalStateException("附件选择器已打开"))); return }
        this.limit = limit.coerceIn(1, 20)
        pending = result
        try {
            when (source) {
                "photos" -> if (this.limit == 1) {
                    launch(ActivityResultContracts.PickVisualMedia(), PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) {
                        readResults(listOfNotNull(it))
                    }
                } else {
                    launch(ActivityResultContracts.PickMultipleVisualMedia(this.limit), PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly), ::readResults)
                }
                "files" -> launch(ActivityResultContracts.OpenMultipleDocuments(), mimeTypes.ifEmpty { listOf("*/*") }.toTypedArray(), ::readResults)
                "camera" -> {
                    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) takePhoto()
                    else launch(ActivityResultContracts.RequestPermission(), Manifest.permission.CAMERA) { granted ->
                        if (granted) takePhoto() else finish(Result.failure(SecurityException("请在系统设置中允许使用相机")))
                    }
                }
                else -> finish(Result.failure(IllegalArgumentException("Unknown attachment source: $source")))
            }
        } catch (error: Exception) { finish(Result.failure(error)) }
    }
    private fun <I, O> launch(contract: ActivityResultContract<I, O>, input: I, callback: (O) -> Unit) {
        val launcher = activity.activityResultRegistry.register("attachment-${UUID.randomUUID()}", contract) {
            if (pending != null) try { callback(it) } catch (error: Exception) { finish(Result.failure(error)) }
        }
        launchers.add(launcher)
        launcher.launch(input)
    }
    private fun takePhoto() {
        val directory = AttachmentCache.directory(activity).apply { mkdirs() }
        val file = File(directory, "${UUID.randomUUID()}.jpg")
        cameraFile = file
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.ui.attachments", file)
        launch(ActivityResultContracts.TakePicture(), uri) { success ->
            if (success) {
                cameraFile = null
                finish(Result.success(listOf(AttachmentAsset(UUID.randomUUID().toString(), Uri.fromFile(file).toString(),
                    "照片.jpg", "image/jpeg", file.length().toDouble()))))
            } else finish(Result.success(emptyList()))
        }
    }
    private fun readResults(uris: List<Uri>) {
        if (uris.isEmpty()) { finish(Result.success(emptyList())); return }
        val token = generation
        val selected = uris.take(limit)
        val context = activity.applicationContext
        val executor = Executors.newSingleThreadExecutor()
        executor.execute {
            val copies = mutableListOf<File>()
            val result = runCatching {
                val directory = AttachmentCache.directory(context).apply { mkdirs() }
                selected.map { uri ->
                    val resolver = context.contentResolver
                    var name = "附件"
                    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) {
                            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                            if (nameIndex >= 0 && !cursor.isNull(nameIndex)) name = cursor.getString(nameIndex) ?: name
                        }
                    }
                    val mimeType = resolver.getType(uri) ?: "application/octet-stream"
                    // An ASCII file name keeps the file:// URI free of escapes; the display name travels separately.
                    val id = UUID.randomUUID().toString()
                    val extension = name.substringAfterLast('.', "").takeIf { it.isNotEmpty() && it.length <= 8 && it.all(Char::isLetterOrDigit) }
                        ?: MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
                    val file = File(directory, if (extension == null) id else "$id.$extension")
                    copies.add(file)
                    val input = resolver.openInputStream(uri) ?: error("无法读取所选文件")
                    input.use { source -> file.outputStream().use { source.copyTo(it) } }
                    AttachmentAsset(id, Uri.fromFile(file).toString(), name, mimeType, file.length().toDouble())
                }
            }
            if (result.isFailure) copies.forEach { it.delete() }
            main.post {
                if (token == generation) finish(result)
                else result.getOrNull()?.forEach { File(Uri.parse(it.uri).path!!).delete() }
            }
            executor.shutdown()
        }
    }
    private fun finish(result: Result<List<AttachmentAsset>>) {
        val callback = pending ?: return
        pending = null
        generation++
        launchers.forEach { it.unregister() }; launchers.clear()
        cameraFile?.delete(); cameraFile = null
        callback(result)
    }
    fun dispose() {
        finish(Result.failure(IllegalStateException("附件选择已中止")))
        activity.lifecycle.removeObserver(this)
    }
    override fun onDestroy(owner: LifecycleOwner) { dispose() }
}
