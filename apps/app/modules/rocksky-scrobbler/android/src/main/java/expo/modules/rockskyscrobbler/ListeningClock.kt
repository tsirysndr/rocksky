package expo.modules.rockskyscrobbler

import kotlin.math.min

/** Monotonic listening time; seeking never contributes time. No Android dependency. */
class ListeningClock {
  var listenedMs = 0L
    private set
  private var lastTime: Long? = null
  private var wasPlaying = false

  fun update(now: Long, playing: Boolean) {
    lastTime?.let { if (wasPlaying) listenedMs += (now - it).coerceAtLeast(0) }
    lastTime = now
    wasPlaying = playing
  }

  fun restore(ms: Long) { listenedMs = ms.coerceAtLeast(0) }

  fun qualifies(duration: Long, position: Long, mode: String, seconds: Int, percent: Int, minimum: Int): Boolean {
    if (duration > 0 && duration < minimum * 1000L) return false
    val threshold = if (mode == "position") seconds * 1000L else
      if (duration > 0) min(seconds * 1000L, duration * percent / 100) else seconds * 1000L
    return if (mode == "position") position >= threshold && listenedMs > 0 else listenedMs >= threshold
  }
}
