package io.nativeroutes.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ActionSheetResultStateTest {
    @Test
    fun selectionWaitsForPresentationFinishAndDeliversOnlyOnce() {
        val result = ActionSheetResultState()
        val replies = mutableListOf<String?>()
        val removed = mutableListOf<String>()
        val scope = OverlayScope(
            register = { _, _, event -> event("top"); true },
            update = { _, _, _ -> },
            remove = { removed.add(it) },
        )
        val presentation = Presentation(scope, SheetDismissReason.Back, SheetDismissReason.Navigation) {}
        presentation.open = true
        presentation.onClosed = { result.closed(it) { replies.add(it) } }
        presentation.begin()
        val id = checkNotNull(presentation.id)

        result.request("delete")
        result.request("another-action")
        result.request(null)
        presentation.open = result.open
        presentation.update()
        assertFalse(result.open)
        assertTrue(replies.isEmpty())
        assertTrue(removed.isEmpty())
        assertEquals(id, presentation.id)

        // SheetFrame calls finish only from the native host's spring completion.
        presentation.finish(id)
        presentation.finish(id)
        presentation.dispose()
        result.closed(OverlayCloseReason.Unmount) { replies.add(it) }
        assertEquals(listOf("delete"), replies)
        assertEquals(listOf(id), removed)
    }

    @Test
    fun cancelCannotBeReplacedByLateSelection() {
        val result = ActionSheetResultState()
        val replies = mutableListOf<String?>()
        result.request(null)
        result.request("late")
        assertTrue(replies.isEmpty())
        result.closed(OverlayCloseReason.Dismissed) { replies.add(it) }
        assertEquals(listOf<String?>(null), replies)
    }

    @Test
    fun navigationOrUnmountCancelsPendingSelectionOnce() {
        for (reason in listOf(OverlayCloseReason.Navigation, OverlayCloseReason.Unmount)) {
            val result = ActionSheetResultState()
            val replies = mutableListOf<String?>()
            result.request("selected")
            result.closed(reason) { replies.add(it) }
            result.closed(OverlayCloseReason.Dismissed) { replies.add(it) }
            assertEquals(listOf<String?>(null), replies)
            assertFalse(result.open)
        }
    }

    @Test
    fun externalCloseWithoutSelectionReturnsNull() {
        val result = ActionSheetResultState()
        val replies = mutableListOf<String?>()
        result.closed(OverlayCloseReason.Dismissed) { replies.add(it) }
        assertEquals(listOf<String?>(null), replies)
        assertFalse(result.open)
    }

    @Test
    fun resultCallbackMayReenterCleanupWithoutDuplicateDelivery() {
        val result = ActionSheetResultState()
        val replies = mutableListOf<String?>()
        result.request("share")
        result.closed(OverlayCloseReason.Dismissed) { value ->
            replies.add(value)
            result.closed(OverlayCloseReason.Unmount) { replies.add(it) }
        }
        assertEquals(listOf("share"), replies)
    }
}
