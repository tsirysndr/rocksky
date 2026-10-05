package expo.modules.rockskyscrobbler

import android.app.Notification
import android.service.notification.StatusBarNotification
import org.json.JSONObject

/** Only parse known recognition result channels, never arbitrary notification text. */
object RecognitionParser {
  val ambientPackages = setOf("com.google.intelligence.sense", "com.google.android.as", "com.kieronquinn.app.pixelambientmusic")
  fun parse(sbn: StatusBarNotification): JSONObject? {
    if (android.os.Build.VERSION.SDK_INT < 26) return null
    val n = sbn.notification
    val extras = n.extras
    val channel = n.channelId
    var album = ""
    var duration = 0L
    val pair = when {
      sbn.packageName == "com.shazam.android" && channel in setOf("notification_shazam_match_v1", "notification_shazam_foreground_match_v2") && !n.actions.isNullOrEmpty() ->
        extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() to extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
      sbn.packageName in ambientPackages && channel == "com.google.intelligence.sense.ambientmusic.MusicNotificationChannel" -> {
        // The original Pixel notification has one localized "title by artist" field.
        // EXTRA_TEXT can contain "tap to see history", so it is not an artist.
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        parseAmbientTitle(title) ?: return null
      }
      sbn.packageName == "com.mrsep.musicrecognizer" && channel in setOf("com.mrsep.musicrecognizer.result", "com.mrsep.musicrecognizer.foreground_result", "com.mrsep.musicrecognizer.enqueued_result") -> {
        val prefix = "com.mrsep.musicrecognizer.track_metadata."
        album = extras.getString(prefix + "album").orEmpty()
        duration = extras.getLong(prefix + "duration", 0).coerceAtLeast(0)
        extras.getString(prefix + "title") to extras.getString(prefix + "artist")
      }
      else -> return null
    }
    val title = pair.first?.trim().orEmpty()
    val artist = pair.second?.trim().orEmpty()
    if (title.isBlank() || artist.isBlank()) return null
    return JSONObject().put("title", title).put("artist", artist).put("album", album)
      .put("albumArtist", artist).put("duration", duration)
  }

  internal fun parseAmbientTitle(title: String): Pair<String, String>? {
    for (separator in listOf(" by ", " par ", " von ", " de ", " di ", " por ")) {
      val index = title.lastIndexOf(separator)
      if (index > 0 && index + separator.length < title.length) return title.substring(0, index) to title.substring(index + separator.length)
    }
    return null
  }
}
