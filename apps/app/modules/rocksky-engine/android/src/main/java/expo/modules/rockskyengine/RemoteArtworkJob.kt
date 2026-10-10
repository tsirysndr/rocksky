package expo.modules.rockskyengine

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.util.concurrent.atomic.AtomicBoolean

/** Android owns the lifetime; Rust owns the queue, cache and network work. */
class RemoteArtworkJob : JobService() {
  private var cancellation: AtomicBoolean? = null

  override fun onStartJob(params: JobParameters): Boolean {
    val token = synchronized(lock) {
      if (running != null) return false
      AtomicBoolean(false).also { running = it; cancellation = it }
    }
    Thread({
      var retry = false
      try {
        check(NativeEngine.load(applicationContext))
        val libraries = RemoteLibraries(applicationContext)
        synchronized(lock) { if (!token.get()) libraries.resumeBackground() }
        while (!token.get() && libraries.backgroundActive()) Thread.sleep(1000)
      } catch (_: Exception) { retry = true }
      finally {
        synchronized(lock) {
          if (running === token) {
            if (retry) RemoteLibraries(applicationContext).stopBackground()
            running = null
            cancellation = null
            if (!token.get()) jobFinished(params, retry)
          }
        }
      }
    }, "remote-artwork-job").start()
    return true
  }

  override fun onStopJob(params: JobParameters): Boolean {
    synchronized(lock) {
      val token = cancellation ?: return true
      token.set(true)
      if (running === token) {
        // Cooperative cancellation plus generation fencing prevents late writes.
        RemoteLibraries(applicationContext).stopBackground()
        running = null
      }
      cancellation = null
    }
    return true
  }

  companion object {
    private const val JOB_ID = 73144
    private val lock = Any()
    private var running: AtomicBoolean? = null
    fun ensureScheduled(context: Context) {
      val scheduler = context.getSystemService(JobScheduler::class.java)
      val service = ComponentName(context, RemoteArtworkJob::class.java)
      if (scheduler.getPendingJob(JOB_ID + 1) == null) {
        scheduler.schedule(JobInfo.Builder(JOB_ID + 1, service)
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .setPeriodic(15 * 60 * 1000L).build())
      }
      if (scheduler.getPendingJob(JOB_ID) == null) {
        scheduler.schedule(JobInfo.Builder(JOB_ID, service)
          .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
          .setMinimumLatency(0).build())
      }
    }
  }
}
