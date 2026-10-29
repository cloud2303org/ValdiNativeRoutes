// Copied from ExpoNativeRoutes android/native/ui (io/nativeroutes/ui/UiIcon.kt).
package io.nativeroutes.ui

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser

/*
 * Lucide refresh-cw: https://github.com/lucide-icons/lucide/blob/main/icons/refresh-cw.svg
 * Lucide save: https://github.com/lucide-icons/lucide/blob/main/icons/save.svg
 * Lucide rotate-ccw: https://github.com/lucide-icons/lucide/blob/main/icons/rotate-ccw.svg
 * ISC License
 * Copyright (c) 2026 Lucide Icons and Contributors
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
private val refreshClockwisePath = PathParser().parsePathString(
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 " +
        "M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5"
).toPath()
private val saveOutlinePath = PathParser().parsePathString(
    "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z " +
        "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7 M7 3v4a1 1 0 0 0 1 1h7"
).toPath()
private val restoreCounterClockwisePath = PathParser().parsePathString(
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5"
).toPath()

internal enum class UiIconKind {
    Search, Clear, Inbox, Error,
    Edit, Copy, Delete, Share, Download, Camera, Photo, File,
    Add, Check, Close, Refresh, Save, Restore, More, Calendar, Location, Scan,
    Back, Clock, Eye, EyeOff,
}

internal fun uiIconKind(icon: String?): UiIconKind? = when (icon?.lowercase()) {
    "edit" -> UiIconKind.Edit
    "copy" -> UiIconKind.Copy
    "delete" -> UiIconKind.Delete
    "share" -> UiIconKind.Share
    "download" -> UiIconKind.Download
    "camera" -> UiIconKind.Camera
    "photo" -> UiIconKind.Photo
    "file" -> UiIconKind.File
    "add" -> UiIconKind.Add
    "check" -> UiIconKind.Check
    "close" -> UiIconKind.Close
    "refresh" -> UiIconKind.Refresh
    "save" -> UiIconKind.Save
    "restore" -> UiIconKind.Restore
    "more" -> UiIconKind.More
    "calendar" -> UiIconKind.Calendar
    "location" -> UiIconKind.Location
    "scan" -> UiIconKind.Scan
    "back" -> UiIconKind.Back
    else -> null
}

/** Small theme-tinted Material-style vector marks used by native controls. */
@Composable
internal fun UiIcon(
    kind: UiIconKind,
    tint: Color,
    modifier: Modifier = Modifier,
    cutout: Color = Color.Transparent,
) {
    Canvas(modifier) {
        val scale = size.minDimension / 24f
        val line = 1.8f * scale
        val stroke = Stroke(width = line, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun point(x: Float, y: Float) = Offset(x * scale, y * scale)

        when (kind) {
            UiIconKind.Eye, UiIconKind.EyeOff -> {
                val eye = Path().apply {
                    moveTo(2.5f * scale, 12f * scale)
                    cubicTo(4.6f * scale, 8.3f * scale, 7.6f * scale, 6f * scale, 12f * scale, 6f * scale)
                    cubicTo(16.4f * scale, 6f * scale, 19.4f * scale, 8.3f * scale, 21.5f * scale, 12f * scale)
                    cubicTo(19.4f * scale, 15.7f * scale, 16.4f * scale, 18f * scale, 12f * scale, 18f * scale)
                    cubicTo(7.6f * scale, 18f * scale, 4.6f * scale, 15.7f * scale, 2.5f * scale, 12f * scale)
                    close()
                }
                drawPath(eye, tint, style = stroke)
                drawCircle(tint, radius = 3f * scale, center = point(12f, 12f), style = stroke)
                if (kind == UiIconKind.EyeOff) {
                    drawLine(tint, point(4f, 3.5f), point(20f, 20.5f), line, cap = StrokeCap.Round)
                }
            }

            UiIconKind.Search -> {
                val path = Path().apply {
                    addOval(Rect(3.5f * scale, 3.5f * scale, 17.5f * scale, 17.5f * scale))
                    moveTo(15.5f * scale, 15.5f * scale)
                    lineTo(21f * scale, 21f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Clear -> {
                drawCircle(tint, radius = 10f * scale, center = point(12f, 12f))
                val path = Path().apply {
                    moveTo(8.5f * scale, 8.5f * scale)
                    lineTo(15.5f * scale, 15.5f * scale)
                    moveTo(15.5f * scale, 8.5f * scale)
                    lineTo(8.5f * scale, 15.5f * scale)
                }
                drawPath(path, cutout, style = Stroke(width = 2f * scale, cap = StrokeCap.Round))
            }

            UiIconKind.Inbox -> {
                val path = Path().apply {
                    moveTo(4f * scale, 5.5f * scale)
                    lineTo(20f * scale, 5.5f * scale)
                    lineTo(21f * scale, 19f * scale)
                    lineTo(3f * scale, 19f * scale)
                    close()
                    moveTo(3.5f * scale, 12.5f * scale)
                    lineTo(8.5f * scale, 12.5f * scale)
                    lineTo(9.5f * scale, 15f * scale)
                    lineTo(14.5f * scale, 15f * scale)
                    lineTo(15.5f * scale, 12.5f * scale)
                    lineTo(20.5f * scale, 12.5f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Error -> {
                drawCircle(tint, radius = 9f * scale, center = point(12f, 12f), style = stroke)
                drawLine(tint, point(12f, 7.5f), point(12f, 13.5f), line, cap = StrokeCap.Round)
                drawCircle(tint, radius = 1f * scale, center = point(12f, 17f))
            }

            UiIconKind.Edit -> {
                val path = Path().apply {
                    moveTo(4f * scale, 16.7f * scale)
                    lineTo(16.8f * scale, 3.9f * scale)
                    lineTo(20.1f * scale, 7.2f * scale)
                    lineTo(7.3f * scale, 20f * scale)
                    lineTo(3.4f * scale, 20.7f * scale)
                    close()
                    moveTo(14.9f * scale, 5.8f * scale)
                    lineTo(18.2f * scale, 9.1f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Copy -> {
                val path = Path().apply {
                    moveTo(8f * scale, 8f * scale)
                    lineTo(20f * scale, 8f * scale)
                    lineTo(20f * scale, 21f * scale)
                    lineTo(8f * scale, 21f * scale)
                    close()
                    moveTo(16f * scale, 8f * scale)
                    lineTo(16f * scale, 4f * scale)
                    lineTo(4f * scale, 4f * scale)
                    lineTo(4f * scale, 17f * scale)
                    lineTo(8f * scale, 17f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Delete -> {
                val path = Path().apply {
                    moveTo(4f * scale, 7f * scale)
                    lineTo(20f * scale, 7f * scale)
                    moveTo(9f * scale, 7f * scale)
                    lineTo(9f * scale, 4f * scale)
                    lineTo(15f * scale, 4f * scale)
                    lineTo(15f * scale, 7f * scale)
                    moveTo(6f * scale, 7f * scale)
                    lineTo(7f * scale, 20f * scale)
                    lineTo(17f * scale, 20f * scale)
                    lineTo(18f * scale, 7f * scale)
                    moveTo(10f * scale, 10f * scale)
                    lineTo(10f * scale, 17f * scale)
                    moveTo(14f * scale, 10f * scale)
                    lineTo(14f * scale, 17f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Share -> {
                val path = Path().apply {
                    moveTo(8f * scale, 12f * scale)
                    lineTo(16f * scale, 7f * scale)
                    moveTo(8f * scale, 12f * scale)
                    lineTo(16f * scale, 17f * scale)
                }
                drawPath(path, tint, style = stroke)
                drawCircle(tint, radius = 2.5f * scale, center = point(6f, 12f))
                drawCircle(tint, radius = 2.5f * scale, center = point(18f, 5.8f))
                drawCircle(tint, radius = 2.5f * scale, center = point(18f, 18.2f))
            }

            UiIconKind.Download -> {
                val path = Path().apply {
                    moveTo(12f * scale, 3f * scale)
                    lineTo(12f * scale, 15f * scale)
                    moveTo(7f * scale, 10f * scale)
                    lineTo(12f * scale, 15f * scale)
                    lineTo(17f * scale, 10f * scale)
                    moveTo(4f * scale, 20f * scale)
                    lineTo(20f * scale, 20f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Camera -> {
                val path = Path().apply {
                    moveTo(4f * scale, 7f * scale)
                    lineTo(8f * scale, 7f * scale)
                    lineTo(10f * scale, 4f * scale)
                    lineTo(15f * scale, 4f * scale)
                    lineTo(17f * scale, 7f * scale)
                    lineTo(20f * scale, 7f * scale)
                    lineTo(20f * scale, 19f * scale)
                    lineTo(4f * scale, 19f * scale)
                    close()
                }
                drawPath(path, tint, style = stroke)
                drawCircle(tint, radius = 4f * scale, center = point(12f, 13f), style = stroke)
            }

            UiIconKind.Photo -> {
                val frame = Path().apply {
                    moveTo(4f * scale, 4f * scale)
                    lineTo(20f * scale, 4f * scale)
                    lineTo(20f * scale, 20f * scale)
                    lineTo(4f * scale, 20f * scale)
                    close()
                }
                val landscape = Path().apply {
                    moveTo(5.5f * scale, 17f * scale)
                    lineTo(10f * scale, 12.5f * scale)
                    lineTo(13f * scale, 15f * scale)
                    lineTo(15.5f * scale, 12.5f * scale)
                    lineTo(18.5f * scale, 16f * scale)
                }
                drawPath(frame, tint, style = stroke)
                drawCircle(tint, radius = 1.4f * scale, center = point(9f, 9f))
                drawPath(landscape, tint, style = stroke)
            }

            UiIconKind.File -> {
                val path = Path().apply {
                    moveTo(6f * scale, 3.5f * scale)
                    lineTo(14f * scale, 3.5f * scale)
                    lineTo(19f * scale, 8.5f * scale)
                    lineTo(19f * scale, 20.5f * scale)
                    lineTo(6f * scale, 20.5f * scale)
                    close()
                    moveTo(14f * scale, 3.5f * scale)
                    lineTo(14f * scale, 9f * scale)
                    lineTo(19f * scale, 9f * scale)
                    moveTo(9f * scale, 13f * scale)
                    lineTo(16f * scale, 13f * scale)
                    moveTo(9f * scale, 17f * scale)
                    lineTo(16f * scale, 17f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Add -> {
                drawLine(tint, point(12f, 5f), point(12f, 19f), line, cap = StrokeCap.Round)
                drawLine(tint, point(5f, 12f), point(19f, 12f), line, cap = StrokeCap.Round)
            }

            UiIconKind.Check -> {
                val path = Path().apply {
                    moveTo(4f * scale, 12.5f * scale)
                    lineTo(9.5f * scale, 18f * scale)
                    lineTo(20f * scale, 6f * scale)
                }
                drawPath(path, tint, style = Stroke(width = 2.2f * scale, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }

            UiIconKind.Close -> {
                val path = Path().apply {
                    moveTo(6.5f * scale, 6.5f * scale)
                    lineTo(17.5f * scale, 17.5f * scale)
                    moveTo(17.5f * scale, 6.5f * scale)
                    lineTo(6.5f * scale, 17.5f * scale)
                }
                drawPath(path, tint, style = Stroke(width = 2f * scale, cap = StrokeCap.Round))
            }

            UiIconKind.Refresh, UiIconKind.Save, UiIconKind.Restore -> {
                val path = when (kind) {
                    UiIconKind.Save -> saveOutlinePath
                    UiIconKind.Restore -> restoreCounterClockwisePath
                    else -> refreshClockwisePath
                }
                withTransform({ scale(scaleX = scale, scaleY = scale, pivot = Offset.Zero) }) {
                    drawPath(path, tint,
                        style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }

            UiIconKind.More -> {
                listOf(5f, 12f, 19f).forEach { y -> drawCircle(tint, radius = 1.5f * scale, center = point(12f, y)) }
            }

            UiIconKind.Calendar -> {
                val path = Path().apply {
                    moveTo(5f * scale, 5f * scale)
                    lineTo(19f * scale, 5f * scale)
                    lineTo(19f * scale, 20f * scale)
                    lineTo(5f * scale, 20f * scale)
                    close()
                    moveTo(8f * scale, 3f * scale)
                    lineTo(8f * scale, 7f * scale)
                    moveTo(16f * scale, 3f * scale)
                    lineTo(16f * scale, 7f * scale)
                    moveTo(5f * scale, 9f * scale)
                    lineTo(19f * scale, 9f * scale)
                    moveTo(9f * scale, 12.5f * scale)
                    lineTo(9f * scale, 13f * scale)
                    moveTo(12f * scale, 12.5f * scale)
                    lineTo(12f * scale, 13f * scale)
                    moveTo(15f * scale, 12.5f * scale)
                    lineTo(15f * scale, 13f * scale)
                    moveTo(9f * scale, 16f * scale)
                    lineTo(9f * scale, 16.5f * scale)
                    moveTo(12f * scale, 16f * scale)
                    lineTo(12f * scale, 16.5f * scale)
                    moveTo(15f * scale, 16f * scale)
                    lineTo(15f * scale, 16.5f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Location -> {
                val pin = Path().apply {
                    moveTo(12f * scale, 21f * scale)
                    cubicTo(10f * scale, 18f * scale, 5f * scale, 13f * scale, 5f * scale, 9.7f * scale)
                    cubicTo(5f * scale, 5.8f * scale, 8.1f * scale, 3f * scale, 12f * scale, 3f * scale)
                    cubicTo(15.9f * scale, 3f * scale, 19f * scale, 5.8f * scale, 19f * scale, 9.7f * scale)
                    cubicTo(19f * scale, 13f * scale, 14f * scale, 18f * scale, 12f * scale, 21f * scale)
                    close()
                }
                drawPath(pin, tint, style = stroke)
                drawCircle(tint, radius = 2.2f * scale, center = point(12f, 9.5f), style = stroke)
            }

            UiIconKind.Scan -> {
                val path = Path().apply {
                    moveTo(8f * scale, 4f * scale); lineTo(4f * scale, 4f * scale); lineTo(4f * scale, 8f * scale)
                    moveTo(16f * scale, 4f * scale); lineTo(20f * scale, 4f * scale); lineTo(20f * scale, 8f * scale)
                    moveTo(4f * scale, 16f * scale); lineTo(4f * scale, 20f * scale); lineTo(8f * scale, 20f * scale)
                    moveTo(20f * scale, 16f * scale); lineTo(20f * scale, 20f * scale); lineTo(16f * scale, 20f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Back -> {
                val path = Path().apply {
                    moveTo(15.5f * scale, 5f * scale)
                    lineTo(8.5f * scale, 12f * scale)
                    lineTo(15.5f * scale, 19f * scale)
                }
                drawPath(path, tint, style = stroke)
            }

            UiIconKind.Clock -> {
                drawCircle(tint, radius = 9f * scale, center = point(12f, 12f), style = stroke)
                val hands = Path().apply {
                    moveTo(12f * scale, 6.5f * scale)
                    lineTo(12f * scale, 12f * scale)
                    lineTo(16f * scale, 14.5f * scale)
                }
                drawPath(hands, tint, style = stroke)
            }
        }
    }
}
