package expo.modules.rockskyengine

import android.Manifest
import android.app.job.JobScheduler
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LocalMusicScanJobTest {
  @Test fun manualRescansRemainAvailableAndRequestAFullMetadataRead() {
    val context = RuntimeEnvironment.getApplication()
    shadowOf(context).grantPermissions(Manifest.permission.READ_MEDIA_AUDIO)
    val scheduler = context.getSystemService(JobScheduler::class.java)
    val prefs = context.getSharedPreferences("local-music", 0)
    LocalMusicScanJob.schedule(context, force = true)
    assertTrue(prefs.getBoolean("forceNext", false))
    assertEquals(2, scheduler.allPendingJobs.size)
    assertTrue(scheduler.allPendingJobs.any { it.isPeriodic })
    // The button can request another pass even with a pending request.
    LocalMusicScanJob.schedule(context, force = true)
    assertEquals(2, scheduler.allPendingJobs.size)
    assertTrue(prefs.getBoolean("forceNext", false))
  }

  @Test fun musicPermissionIsRequiredBeforeScheduling() {
    val context = RuntimeEnvironment.getApplication()
    shadowOf(context).denyPermissions(Manifest.permission.READ_MEDIA_AUDIO)
    try {
      LocalMusicScanJob.schedule(context, force = true)
      fail("Missing permission must prevent scanning")
    } catch (_: IllegalStateException) { }
    assertFalse(LocalMusicScanJob.status(context).getBoolean("permission"))
  }
}
