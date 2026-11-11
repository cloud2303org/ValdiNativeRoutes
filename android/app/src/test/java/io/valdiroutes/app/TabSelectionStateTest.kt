package io.valdiroutes.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TabSelectionStateTest {
    private fun state() = TabSelectionState().apply { reset("home") }

    @Test fun requestKeepsTheCurrentPageUntilPreparationCommits() {
        val state = state()
        state.request("components")
        assertEquals("home", state.displayed)
        assertEquals("components", state.requested)
        assertTrue(state.commit(requireNotNull(state.pending)))
        assertEquals("components", state.displayed)
        assertNull(state.pending)
    }

    @Test fun secondTapDoesNotRestartTheFirstRequest() {
        val state = state()
        state.request("components")
        val first = state.pending
        state.request("components")
        assertSame(first, state.pending)
        assertTrue(state.commit(requireNotNull(first)))
    }

    @Test fun onlyTheLatestRequestedTabCanCommit() {
        val state = state()
        state.request("components")
        val components = requireNotNull(state.pending)
        state.request("device")
        val device = requireNotNull(state.pending)
        assertFalse(state.commit(components))
        assertEquals("home", state.displayed)
        assertTrue(state.commit(device))
        assertEquals("device", state.displayed)
    }

    @Test fun returningToTheDisplayedTabCancelsPendingWork() {
        val state = state()
        state.request("components")
        val pending = requireNotNull(state.pending)
        state.request("home")
        assertNull(state.pending)
        assertFalse(state.commit(pending))
        assertEquals("home", state.displayed)
    }

    @Test fun anOldRequestCannotCommitAfterRequestingTheSameTabAgain() {
        val state = state()
        state.request("components")
        val old = requireNotNull(state.pending)
        state.request("device")
        state.request("components")
        assertFalse(state.commit(old))
        assertTrue(state.commit(requireNotNull(state.pending)))
    }

    @Test fun failureKeepsTheCurrentPageAndCannotCancelANewerRequest() {
        val state = state()
        state.request("components")
        val old = requireNotNull(state.pending)
        state.request("device")
        state.cancel(old)
        assertEquals("device", state.requested)
        state.cancel(requireNotNull(state.pending))
        assertEquals("home", state.requested)
        assertEquals("home", state.displayed)
    }

    @Test fun resetInvalidatesAllOutstandingRequests() {
        val state = state()
        state.request("components")
        val old = requireNotNull(state.pending)
        state.reset("device")
        assertFalse(state.commit(old))
        assertEquals("device", state.displayed)
        assertNull(state.pending)
    }
}
