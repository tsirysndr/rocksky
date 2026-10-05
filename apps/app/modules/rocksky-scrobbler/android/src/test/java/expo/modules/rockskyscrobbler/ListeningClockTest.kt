package expo.modules.rockskyscrobbler

import org.junit.Assert.*
import org.junit.Test

class ListeningClockTest {
  private fun qualifies(clock: ListeningClock, duration: Long = 200000, position: Long = 0,
    mode: String = "listened", seconds: Int = 240, percent: Int = 50, minimum: Int = 30) =
    clock.qualifies(duration, position, mode, seconds, percent, minimum)

  @Test fun `default uses half the duration for short songs`() {
    val c = ListeningClock()
    c.update(0, true); c.update(99999, true)
    assertFalse(qualifies(c))
    c.update(100000, true)
    assertTrue(qualifies(c))
  }
  @Test fun `default caps long songs at four minutes`() {
    val c = ListeningClock()
    c.update(0, true); c.update(240000, true)
    assertTrue(qualifies(c, duration = 900000))
  }
  @Test fun `pauses and buffering do not contribute listening time`() {
    val c = ListeningClock()
    c.update(0, true); c.update(30000, false); c.update(90000, false)
    c.update(120000, true); c.update(150000, true)
    assertEquals(60000, c.listenedMs)
    assertFalse(qualifies(c))
  }
  @Test fun `seeking ahead cannot qualify a listening time scrobble`() {
    val c = ListeningClock()
    c.update(0, true); c.update(1000, true)
    assertFalse(qualifies(c, position = 180000))
    assertTrue(qualifies(c, position = 180000, mode = "position", seconds = 120))
  }
  @Test fun `a paused track cannot immediately satisfy a position threshold`() {
    assertFalse(qualifies(ListeningClock(), position = 180000, mode = "position", seconds = 120))
  }
  @Test fun `short tracks are ignored regardless of seeking`() {
    val c = ListeningClock()
    c.restore(30000)
    assertFalse(qualifies(c, duration = 29000))
    assertFalse(qualifies(c, duration = 29000, position = 29000, mode = "position", seconds = 10))
    assertTrue(qualifies(c, duration = 30000))
  }
  @Test fun `unknown duration falls back to configured seconds`() {
    val c = ListeningClock()
    c.restore(239999); assertFalse(qualifies(c, duration = 0))
    c.restore(240000); assertTrue(qualifies(c, duration = 0))
  }
  @Test fun `restore does not count time while process was gone`() {
    val c = ListeningClock()
    c.restore(60000); c.update(900000, true)
    assertEquals(60000, c.listenedMs)
    c.update(940000, false); assertTrue(qualifies(c))
  }
  @Test fun `custom percentage and time are both respected`() {
    val c = ListeningClock()
    c.restore(75000)
    assertTrue(qualifies(c, duration = 300000, percent = 25))
    assertFalse(qualifies(c, duration = 300000, percent = 90))
    assertTrue(qualifies(c, duration = 300000, seconds = 60, percent = 90))
  }
}
