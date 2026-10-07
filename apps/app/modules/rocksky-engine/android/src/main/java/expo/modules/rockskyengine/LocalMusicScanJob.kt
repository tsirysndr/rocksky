package expo.modules.rockskyengine

import android.Manifest
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.MediaStore
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** An interruptible, incremental scan. No network or fingerprint code belongs here. */
class LocalMusicScanJob : JobService() {
  private val cancellations = java.util.concurrent.ConcurrentHashMap<Int, AtomicBoolean>()
  override fun onStartJob(params: JobParameters): Boolean {
    val cancellation = AtomicBoolean(false)
    cancellations[params.jobId] = cancellation
    Thread({
      try { scan(applicationContext, cancellation) }
      catch (e: Exception) { state(applicationContext, "error", 0, e.message ?: "Scan failed") }
      finally {
        cancellations.remove(params.jobId, cancellation)
        if (!cancellation.get()) jobFinished(params, false)
        runQueuedRescan(applicationContext)
      }
    }, "local-music-scan").start()
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean {
    cancellations.remove(params.jobId)?.set(true)
    state(applicationContext, "pending", 0)
    return true
  }

  companion object {
    private const val JOB_ID = 73142
    private val scanning = AtomicBoolean(false)
    @Synchronized
    private fun runQueuedRescan(context: Context) {
      val prefs = context.getSharedPreferences("local-music", 0)
      if (!scanning.get() && prefs.getBoolean("rescanRequested", false) && hasPermission(context)) {
        prefs.edit().remove("rescanRequested").apply()
        schedule(context, force = true)
      }
    }
    fun ensureScheduled(context: Context) {
      if (!hasPermission(context)) return
      val scheduler = context.getSystemService(JobScheduler::class.java)
      if (!scanning.get() && (scheduler.getPendingJob(JOB_ID + 1) == null || status(context).optString("state") == "scanning")) {
        schedule(context)
      }
    }
    fun hasPermission(context: Context): Boolean = context.checkSelfPermission(
      if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE
    ) == PackageManager.PERMISSION_GRANTED

    fun status(context: Context): JSONObject = JSONObject(context.getSharedPreferences("local-music", 0).getString("scan", "{\"state\":\"idle\",\"count\":0}")!!)
      .put("permission", hasPermission(context))
      .put("rescanQueued", context.getSharedPreferences("local-music", 0).getBoolean("rescanRequested", false))

    private fun state(context: Context, state: String, count: Int, error: String? = null) {
      context.getSharedPreferences("local-music", 0).edit().putString("scan", JSONObject()
        .put("state", state).put("count", count).put("error", error ?: JSONObject.NULL).toString()).apply()
    }

    @Synchronized
    fun schedule(context: Context, force: Boolean = false) {
      check(hasPermission(context)) { "Allow music access to scan your device" }
      if (force) context.getSharedPreferences("local-music", 0).edit().putBoolean("forceNext", true).apply()
      if (scanning.get()) {
        if (force) context.getSharedPreferences("local-music", 0).edit().putBoolean("rescanRequested", true).apply()
        return
      }
      state(context, "pending", 0)
      val scheduler = context.getSystemService(JobScheduler::class.java)
      // Incremental maintenance while the UI is closed. Android controls timing
      // in Doze; only embedded tags are read, never online identification.
      if (scheduler.getPendingJob(JOB_ID + 1) == null) {
        scheduler.schedule(JobInfo.Builder(JOB_ID + 1, ComponentName(context, LocalMusicScanJob::class.java))
          .setPeriodic(15 * 60 * 1000L).build())
      }
      check(scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(context, LocalMusicScanJob::class.java))
        .setMinimumLatency(0).setOverrideDeadline(1000).build()) == JobScheduler.RESULT_SUCCESS) { "Could not schedule the music scan" }
    }

    @Suppress("DEPRECATION")
    private fun scan(context: Context, cancelled: AtomicBoolean) {
      if (!scanning.compareAndSet(false, true)) return
      val prefs = context.getSharedPreferences("local-music", 0)
      val force = synchronized(this) {
        val requested = prefs.getBoolean("forceNext", false)
        prefs.edit().remove("forceNext").apply()
        requested
      }
      try {
        check(hasPermission(context)) { "Music access was revoked" }
        check(NativeEngine.load(context)) { "Native metadata reader is unavailable" }
        val scanId = UUID.randomUUID().toString()
        val artDir = File(context.filesDir, "local-music-art").apply { mkdirs() }
        var count = 0
        state(context, "scanning", count)
        LocalMusicStore(context).use { store ->
          val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
          val columns = arrayOf("_id", "_data", "_display_name", "date_modified", "_size", "duration")
          val cursor = context.contentResolver.query(collection, columns, "is_ringtone = 0 AND is_alarm = 0 AND is_notification = 0", null, "_id ASC")
            ?: error("Could not read device music")
          cursor.use { c ->
            while (c.moveToNext()) {
              if (cancelled.get()) return
              check(hasPermission(context)) { "Music access was revoked" }
              val id = c.getLong(0).toString()
              val path = c.getString(1) ?: ""
              val filename = c.getString(2) ?: id
              val stamp = "${c.getLong(3)}:${c.getLong(4)}"
              val uri = ContentUris.withAppendedId(collection, c.getLong(0)).toString()
              val previous = store.track(id)
              if (!force && previous?.optString("stamp") == stamp && previous.optString("uri") == uri) {
                store.markSeen(id, scanId)
              } else {
                var temporary: File? = null
                try {
                  // Direct paths are supported by scoped storage for native media
                  // libraries. Fall back to a private temporary file on providers
                  // which do not expose a readable path (including Android 10).
                  val input = if (path.isNotBlank() && File(path).canRead()) path else {
                    temporary = File.createTempFile("scan-", ".${File(filename).extension}", context.cacheDir)
                    context.contentResolver.openInputStream(android.net.Uri.parse(uri)).use { source ->
                      checkNotNull(source) { "Audio file is unavailable" }
                      temporary!!.outputStream().use { source.copyTo(it) }
                    }
                    temporary!!.absolutePath
                  }
                  val art = File(artDir, "$id-$stamp-$scanId.art")
                  val response = JSONObject(NativeEngine.command(JSONObject().put("cmd", "readMetadata")
                    .put("path", input).put("artPath", art.absolutePath).toString()))
                  val metadata = response.optJSONObject("metadata") ?: JSONObject()
                    .put("title", "").put("artist", "").put("album", "").put("albumArtist", "")
                    .put("durationMs", c.getLong(5)).put("readError", response.optString("error"))
                  store.upsert(id, uri, path, filename, stamp, metadata, scanId)
                } catch (e: java.io.IOException) {
                  // Keep a previously indexed file on transient/removable-storage errors.
                  store.markSeen(id, scanId)
                } finally { temporary?.delete() }
              }
              count++
              state(context, "scanning", count)
            }
          }
          // Never remove rows after a cancelled/failed scan.
          if (cancelled.get()) return
          store.finishScan(scanId)
          val used = mutableSetOf<String>()
          val tracks = store.library().getJSONArray("tracks")
          for (i in 0 until tracks.length()) used.add(tracks.getJSONObject(i).optString("albumArt").removePrefix("file://"))
          artDir.listFiles()?.filter { it.absolutePath !in used }?.forEach { it.delete() }
        }
        state(context, "complete", count)
      } finally {
        synchronized(this) {
          scanning.set(false)
          if (cancelled.get() && force) prefs.edit().putBoolean("forceNext", true).apply()
        }
      }
    }
  }
}
