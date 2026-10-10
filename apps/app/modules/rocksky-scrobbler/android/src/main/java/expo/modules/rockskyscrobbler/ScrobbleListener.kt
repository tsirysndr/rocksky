package expo.modules.rockskyscrobbler

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.ContentValues
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class ScrobbleListener : NotificationListenerService() {
  private val handler = Handler(Looper.getMainLooper())
  private val controllers = mutableMapOf<MediaSession.Token, Pair<MediaController, MediaController.Callback>>()
  private val tracks = mutableMapOf<String, Listen>()
  private val pendingRecognition = mutableMapOf<String, Runnable>()
  private var account: String? = null
  private var foreground = false
  private var wakeLock: PowerManager.WakeLock? = null
  private var checkpoint = 0L
  private val manager by lazy { getSystemService(MediaSessionManager::class.java) }
  private val sessions = MediaSessionManager.OnActiveSessionsChangedListener { attach(it.orEmpty()) }
  private val prefsListener = SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
    if (key in setOf("enabled", "credentials", "blocked", "recognize", "mode", "seconds", "percent", "minimum")) {
      handler.post { refresh() }
    }
  }
  private val tick = object : Runnable {
    override fun run() {
      sample()
      handler.postDelayed(this, 1000)
    }
  }

  private class Listen(val id: String, val key: String, val source: String, val started: Long,
    var metadata: JSONObject, val clock: ListeningClock = ListeningClock()) {
    var submitted = false
    var position = 0L
    var playing = false
  }

  override fun onListenerConnected() {
    connected = true
    ScrobbleStore.prefs(this).registerOnSharedPreferenceChangeListener(prefsListener)
    manager.removeOnActiveSessionsChangedListener(sessions)
    manager.addOnActiveSessionsChangedListener(sessions, ComponentName(this, ScrobbleListener::class.java), handler)
    refresh()
    handler.removeCallbacks(tick); handler.post(tick)
    ScrobbleUploadJob.schedule(this)
  }

  private fun refresh() {
    val next = ScrobbleStore.auth(this)?.optString("did")
    val settings = ScrobbleStore.settings(this)
    if (next != account || !settings.enabled) {
      tracks.clear(); current = null
      pendingRecognition.values.forEach(handler::removeCallbacks); pendingRecognition.clear()
      // Changing account must never restore another account's partial listen.
      if (account != null || !settings.enabled) ScrobbleStore.db(this).delete("playback", null, null)
      account = next
    }
    if (!settings.enabled || account == null) {
      stopForeground(STOP_FOREGROUND_REMOVE); foreground = false
      releaseWakeLock()
      return
    }
    if (!foreground) startOngoingNotification()
    try { attach(manager.getActiveSessions(ComponentName(this, ScrobbleListener::class.java))) }
    catch (_: SecurityException) { connected = false }
    sample()
  }

  private fun startOngoingNotification() {
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("rocksky_scrobbling", "Scrobbling", NotificationManager.IMPORTANCE_LOW))
    val intent = packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    val pending = PendingIntent.getActivity(this, 943, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, "rocksky_scrobbling") else Notification.Builder(this)
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Rocksky scrobbling")
      .setContentText("Listening for music in your enabled apps")
      .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true).build()
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(943, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      else startForeground(943, notification)
      foreground = true
      ScrobbleStore.prefs(this).edit().remove("serviceError").apply()
    } catch (_: Exception) {
      // The system-bound notification listener still works if an OEM forbids
      // promotion from this background state. Show the limitation in settings.
      ScrobbleStore.prefs(this).edit().putString("serviceError", "Background protection unavailable. Open Rocksky and check battery settings.").apply()
    }
  }

  private fun attach(active: List<MediaController>) {
    if (!ScrobbleStore.settings(this).enabled || account == null) {
      controllers.values.forEach { it.first.unregisterCallback(it.second) }
      controllers.clear()
      return
    }
    val eligible = active.filter { it.packageName !in ScrobbleSources.excluded }
    val tokens = eligible.map { it.sessionToken }.toSet()
    controllers.keys.filter { it !in tokens }.forEach { token ->
      controllers.remove(token)?.let { it.first.unregisterCallback(it.second) }
    }
    eligible.filter { it.packageName !in setOf(packageName, "app.rocksky", "app.rocksky.test") }.forEach { controller ->
      rememberApp(controller.packageName)
      if (controller.sessionToken !in controllers) {
        val callback = object : MediaController.Callback() {
          override fun onMetadataChanged(metadata: MediaMetadata?) { sample() }
          override fun onPlaybackStateChanged(state: PlaybackState?) { sample() }
          override fun onSessionDestroyed() {
            controllers.remove(controller.sessionToken)?.let { it.first.unregisterCallback(it.second) }
            sample()
          }
        }
        controllers[controller.sessionToken] = controller to callback
        controller.registerCallback(callback, handler)
      }
    }
    sample()
  }

  private fun rememberApp(pkg: String) {
    val prefs = ScrobbleStore.prefs(this)
    val seen = JSONObject(prefs.getString("apps", "{}")!!)
    if (seen.has(pkg)) return
    val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (_: Exception) { pkg }
    seen.put(pkg, label)
    prefs.edit().putString("apps", seen.toString()).apply()
  }

  private fun text(m: MediaMetadata, key: String) = m.getText(key)?.toString()?.trim().orEmpty()
  private fun metadata(c: MediaController): JSONObject? {
    val m = c.metadata ?: return null
    val title = text(m, MediaMetadata.METADATA_KEY_TITLE).ifBlank { text(m, MediaMetadata.METADATA_KEY_DISPLAY_TITLE) }
    val artist = text(m, MediaMetadata.METADATA_KEY_ARTIST)
      .ifBlank { text(m, MediaMetadata.METADATA_KEY_ALBUM_ARTIST) }
      .ifBlank { text(m, MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE) }
    if (title.isBlank() || artist.isBlank()) return null
    return JSONObject().put("title", title).put("artist", artist)
      .put("album", text(m, MediaMetadata.METADATA_KEY_ALBUM))
      .put("albumArtist", text(m, MediaMetadata.METADATA_KEY_ALBUM_ARTIST).ifBlank { artist })
      .put("duration", m.getLong(MediaMetadata.METADATA_KEY_DURATION).coerceAtLeast(0))
      .put("mediaId", text(m, MediaMetadata.METADATA_KEY_MEDIA_ID))
  }

  private fun sample() {
    val settings = ScrobbleStore.settings(this)
    val did = account
    if (!settings.enabled || did == null) return
    val now = SystemClock.elapsedRealtime()
    val sources = mutableSetOf<String>()
    // Multiple sessions in one app should not count the same music twice.
    val selected = controllers.values.map { it.first }.groupBy { it.packageName }.values.map { group ->
      group.maxBy { if (it.playbackState?.state == PlaybackState.STATE_PLAYING) 1 else 0 }
    }
    var anyPlaying = false
    current = null
    selected.filter { it.packageName !in settings.blocked }.forEach { c ->
      val meta = metadata(c) ?: return@forEach
      val state = c.playbackState ?: return@forEach
      val source = c.packageName
      sources.add(source)
      val playing = state.state == PlaybackState.STATE_PLAYING && state.playbackSpeed > 0
      var position = state.position.coerceAtLeast(0)
      if (playing && state.lastPositionUpdateTime > 0) position += ((now - state.lastPositionUpdateTime).coerceAtLeast(0) * state.playbackSpeed).toLong()
      val duration = meta.optLong("duration")
      if (duration > 0) position = position.coerceAtMost(duration)
      // Late album/media-id enrichment and cosmetic text updates are not new plays.
      val key = ScrobbleIdentity.key("", meta.getString("title"), meta.getString("artist"), 0)
      var listen = tracks[source]
      val repeated = listen != null && listen.key == key && duration > 0 && listen.position >= duration - 5000 &&
        position < 5000 && playing && listen.playing
      if (listen == null || listen.key != key || repeated) {
        listen?.let { finish(it, now, settings, did) }
        listen = if (listen == null) restore(source, key, did, position) else null
        if (listen == null) listen = Listen(UUID.randomUUID().toString(), key, source, System.currentTimeMillis() / 1000, meta)
        tracks[source] = listen
      }
      listen.metadata = meta
      listen.clock.update(now, playing && (duration == 0L || position < duration))
      listen.position = position
      listen.playing = playing
      qualify(listen, settings, did)
      if (playing) {
        anyPlaying = true
        current = JSONObject(meta.toString()).put("source", source).put("position", position)
          .put("listened", listen.clock.listenedMs).put("submitted", listen.submitted).toString()
      }
    }
    tracks.keys.filter { it !in sources }.forEach { source ->
      tracks.remove(source)?.let {
        if (source !in settings.blocked) finish(it, now, settings, did)
        ScrobbleStore.db(this).delete("playback", "id=?", arrayOf(source))
      }
    }
    if (now - checkpoint > 5000) { tracks.values.forEach { save(it, did) }; checkpoint = now }
    if (anyPlaying) {
      if (wakeLock?.isHeld != true) {
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Rocksky:Scrobbling").apply { acquire(10 * 60 * 1000L) }
      }
    } else releaseWakeLock()
  }

  private fun finish(listen: Listen, now: Long, settings: ScrobbleSettings, did: String) {
    listen.clock.update(now, false)
    qualify(listen, settings, did)
  }
  private fun qualify(listen: Listen, settings: ScrobbleSettings, did: String) {
    if (!listen.submitted && listen.clock.qualifies(listen.metadata.optLong("duration"), listen.position,
        settings.mode, settings.seconds, settings.percent, settings.minimum)) {
      val payload = payload(listen.metadata, listen.started)
      // Atomic queue insertion + checkpoint avoids a second submission after a crash.
      val db = ScrobbleStore.db(this)
      db.beginTransaction()
      try {
        ScrobbleStore.enqueue(this, did, listen.source, payload)
        listen.submitted = true
        save(listen, did)
        db.setTransactionSuccessful()
      } finally { db.endTransaction() }
      ScrobbleUploadJob.schedule(this)
    }
  }
  private fun payload(meta: JSONObject, timestamp: Long): JSONObject = JSONObject(meta.toString()).apply {
    remove("mediaId")
    put("timestamp", timestamp)
    // Rocksky's current ingestion contract requires nonempty album/albumArtist.
    if (optString("album").isBlank()) put("album", getString("title"))
    if (optString("albumArtist").isBlank()) put("albumArtist", getString("artist"))
  }
  private fun save(listen: Listen, did: String) {
    val json = JSONObject().put("did", did).put("key", listen.key).put("id", listen.id)
      .put("started", listen.started).put("metadata", listen.metadata).put("submitted", listen.submitted)
      .put("listened", listen.clock.listenedMs).put("position", listen.position).put("saved", System.currentTimeMillis())
    ScrobbleStore.db(this).insertWithOnConflict("playback", null, ContentValues().apply {
      put("id", listen.source); put("state", json.toString())
    }, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
  }
  private fun restore(source: String, key: String, did: String, position: Long): Listen? {
    val raw = ScrobbleStore.db(this).rawQuery("SELECT state FROM playback WHERE id=?", arrayOf(source)).use {
      if (it.moveToFirst()) it.getString(0) else null
    } ?: return null
    val j = JSONObject(raw)
    if (j.optString("did") != did || j.optString("key") != key ||
      System.currentTimeMillis() - j.optLong("saved") > 86400000 || position + 3000 < j.optLong("position")) return null
    return Listen(j.getString("id"), key, source, j.getLong("started"), j.getJSONObject("metadata")).apply {
      clock.restore(j.optLong("listened")); submitted = j.optBoolean("submitted"); this.position = position
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    val settings = ScrobbleStore.settings(this)
    val did = account ?: return
    if (!settings.enabled || !settings.recognize || sbn.packageName in settings.blocked) return
    val recognition = RecognitionParser.parse(sbn) ?: return
    rememberApp(sbn.packageName)
    // Avoid ambient recognitions duplicating the same song from a media player.
    if (tracks.values.any { it.playing && it.metadata.optString("title").equals(recognition.optString("title"), true)
        && it.metadata.optString("artist").equals(recognition.optString("artist"), true) }) return
    pendingRecognition.remove(sbn.key)?.let(handler::removeCallbacks)
    val ambient = sbn.packageName in RecognitionParser.ambientPackages
    val task = Runnable {
      pendingRecognition.remove(sbn.key)
      val config = ScrobbleStore.settings(this)
      if (!config.enabled || !config.recognize || account != did || sbn.packageName in config.blocked) return@Runnable
      val now = System.currentTimeMillis()
      val identity = JSONArray(listOf(did, sbn.packageName, recognition.getString("title"), recognition.getString("artist"))).toString()
      val db = ScrobbleStore.db(this)
      val seen = db.rawQuery("SELECT seen FROM recognitions WHERE id=?", arrayOf(identity)).use { if (it.moveToFirst()) it.getLong(0) else 0L }
      if (now - seen < 5 * 60 * 1000) return@Runnable
      db.beginTransaction()
      try {
        ScrobbleStore.enqueue(this, did, sbn.packageName,
          payload(recognition, sbn.postTime / 1000))
        db.insertWithOnConflict("recognitions", null, ContentValues().apply { put("id", identity); put("seen", now) }, android.database.sqlite.SQLiteDatabase.CONFLICT_REPLACE)
        db.delete("recognitions", "seen<?", arrayOf((now - 86400000).toString()))
        db.setTransactionSuccessful()
      } finally { db.endTransaction() }
      ScrobbleUploadJob.schedule(this)
    }
    pendingRecognition[sbn.key] = task
    handler.postDelayed(task, if (ambient) 15000 else 0)
  }
  override fun onNotificationRemoved(sbn: StatusBarNotification?) {
    sbn?.key?.let { pendingRecognition.remove(it)?.let(handler::removeCallbacks) }
  }
  private fun releaseWakeLock() { if (wakeLock?.isHeld == true) wakeLock?.release(); wakeLock = null }
  private fun disconnect() {
    connected = false; current = null
    handler.removeCallbacksAndMessages(null)
    pendingRecognition.clear()
    ScrobbleStore.prefs(this).unregisterOnSharedPreferenceChangeListener(prefsListener)
    manager.removeOnActiveSessionsChangedListener(sessions)
    controllers.values.forEach { it.first.unregisterCallback(it.second) }; controllers.clear()
    account?.let { did -> tracks.values.forEach { save(it, did) } }
    tracks.clear(); releaseWakeLock()
    stopForeground(STOP_FOREGROUND_REMOVE); foreground = false
  }
  override fun onListenerDisconnected() {
    disconnect()
    if (ScrobbleStore.settings(this).enabled) requestRebind(ComponentName(this, ScrobbleListener::class.java))
  }
  override fun onDestroy() { disconnect(); super.onDestroy() }

  companion object {
    @Volatile var connected = false
    @Volatile var current: String? = null
  }
}
