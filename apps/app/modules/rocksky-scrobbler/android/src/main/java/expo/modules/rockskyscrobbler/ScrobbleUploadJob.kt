package expo.modules.rockskyscrobbler

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.service.notification.NotificationListenerService
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/** Persisted network-constrained job: survives process exit and reboot, no JS required. */
class ScrobbleUploadJob : JobService() {
  private val executor = Executors.newSingleThreadExecutor()
  private val cancellations = ConcurrentHashMap<Int, AtomicBoolean>()
  private val connections = ConcurrentHashMap<Int, HttpURLConnection>()

  override fun onStartJob(params: JobParameters): Boolean {
    val stop = AtomicBoolean(false)
    cancellations[params.jobId] = stop
    executor.execute {
      var retry = false
      try {
        // Bound each job so a large offline history doesn't monopolize the service.
        var submitted = 0
        while (!stop.get() && submitted < 100) {
          val outcome = run upload@ {
            val auth = ScrobbleStore.auth(this) ?: return@upload "done"
            if (!ScrobbleStore.settings(this).enabled) return@upload "done"
            val db = ScrobbleStore.db(this)
            val row = db.rawQuery("SELECT id,payload FROM queue WHERE did=? AND failed=0 ORDER BY created LIMIT 1",
              arrayOf(auth.getString("did"))).use {
              if (it.moveToFirst()) it.getString(0) to it.getString(1) else null
            } ?: return@upload "done"
            if (stop.get()) return@upload "done"
            val conn = (URL(auth.getString("endpoint").trimEnd('/') + "/xrpc/app.rocksky.scrobble.createScrobble")
              .openConnection() as HttpURLConnection).apply {
              requestMethod = "POST"; connectTimeout = 15000; readTimeout = 20000
              instanceFollowRedirects = false; doOutput = true
              setRequestProperty("Content-Type", "application/json")
              setRequestProperty("Authorization", "Bearer ${auth.getString("token")}")
            }
            connections[params.jobId] = conn
            try {
              if (stop.get() || ScrobbleStore.auth(this)?.toString() != auth.toString()) return@upload "done"
              conn.outputStream.use { it.write(row.second.toByteArray(Charsets.UTF_8)) }
              val code = conn.responseCode
              when {
                code in 200..299 -> {
                  db.delete("queue", "id=?", arrayOf(row.first))
                  ScrobbleStore.prefs(this).edit().putLong("lastUpload", System.currentTimeMillis()).remove("uploadError").remove("authError").apply()
                  "next"
                }
                code == 401 || code == 403 -> {
                  ScrobbleStore.prefs(this).edit().putString("authError", "Sign in again to upload saved listens (HTTP $code).").apply()
                  "done"
                }
                code == 400 || code == 404 || code == 422 -> {
                  db.execSQL("UPDATE queue SET failed=1 WHERE id=?", arrayOf(row.first))
                  ScrobbleStore.prefs(this).edit().putString("uploadError", "A listen was rejected (HTTP $code). It is saved for retry.").apply()
                  "next"
                }
                else -> {
                  ScrobbleStore.prefs(this).edit().putString("uploadError", "Upload waiting to retry (HTTP $code).").apply()
                  "retry"
                }
              }
            } finally { conn.disconnect(); connections.remove(params.jobId) }
          }
          if (outcome == "done") break
          if (outcome == "retry") { retry = true; break }
          submitted++
        }
        if (submitted == 100) retry = true
      } catch (_: Exception) {
        retry = true
        ScrobbleStore.prefs(this).edit().putString("uploadError", "Offline or server unavailable. Listens are saved and will retry automatically.").apply()
      } finally {
        if (cancellations[params.jobId] === stop) cancellations.remove(params.jobId)
        if (!stop.get()) jobFinished(params, retry)
      }
    }
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean {
    cancellations.remove(params.jobId)?.set(true); connections.remove(params.jobId)?.disconnect()
    return true
  }
  override fun onDestroy() {
    cancellations.values.forEach { it.set(true) }; connections.values.forEach { it.disconnect() }
    executor.shutdownNow(); super.onDestroy()
  }

  companion object {
    const val JOB_ID = 0x524b53
    fun schedule(c: Context, retryFailed: Boolean = false) {
      if (!ScrobbleStore.settings(c).enabled || ScrobbleStore.auth(c) == null) return
      val scheduler = c.getSystemService(JobScheduler::class.java)
      // Reconciles the enqueue/jobFinished race and recovers missed work after
      // process termination. The service executor serializes submissions from both jobs.
      if (scheduler.getPendingJob(JOB_ID + 1) == null) {
        scheduler.schedule(JobInfo.Builder(JOB_ID + 1, ComponentName(c, ScrobbleUploadJob::class.java))
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
          .setPeriodic(15 * 60 * 1000L).build())
      }
      if (retryFailed) {
        val did = ScrobbleStore.auth(c)?.getString("did") ?: return
        ScrobbleStore.db(c).execSQL("UPDATE queue SET failed=0 WHERE did=?", arrayOf(did))
      }
      // Don't replace a running job every time a song qualifies.
      if (scheduler.getPendingJob(JOB_ID) != null) return
      scheduler.schedule(JobInfo.Builder(JOB_ID, ComponentName(c, ScrobbleUploadJob::class.java))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
        .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
    }
    fun cancel(c: Context) {
      c.getSystemService(JobScheduler::class.java).cancel(JOB_ID)
      c.getSystemService(JobScheduler::class.java).cancel(JOB_ID + 1)
    }
  }
}

class ScrobbleBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    if (!ScrobbleStore.settings(context).enabled) return
    NotificationListenerService.requestRebind(ComponentName(context, ScrobbleListener::class.java))
    ScrobbleUploadJob.schedule(context)
  }
}
