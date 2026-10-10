package expo.modules.rockskyengine

import android.app.job.JobInfo
import android.app.job.JobScheduler
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RemoteArtworkJobTest {
  @Test fun schedulesNetworkConstrainedResumeAndMaintenanceWithoutDuplicates() {
    val context = RuntimeEnvironment.getApplication()
    val scheduler = context.getSystemService(JobScheduler::class.java)
    scheduler.cancelAll()
    RemoteArtworkJob.ensureScheduled(context)
    RemoteArtworkJob.ensureScheduled(context)
    val jobs = scheduler.allPendingJobs
    assertEquals(2, jobs.size)
    assertEquals(1, jobs.count { it.isPeriodic })
    assertTrue(jobs.all { it.networkType == JobInfo.NETWORK_TYPE_ANY })
    assertTrue(jobs.all { it.service.className == RemoteArtworkJob::class.java.name })
    assertEquals(15 * 60 * 1000L, jobs.first { it.isPeriodic }.intervalMillis)
  }
}
