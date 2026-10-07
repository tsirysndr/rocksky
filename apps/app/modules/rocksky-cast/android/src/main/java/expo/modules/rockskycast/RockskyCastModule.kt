package expo.modules.rockskycast

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RockskyCastModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RockskyCast")
    AsyncFunction("shareFile") { path: String ->
      val context = requireNotNull(appContext.reactContext).applicationContext
      val alreadyRunning = CastFiles.isRunning()
      // Start from the visible sender while preparing the Cast queue, before the screen locks.
      ContextCompat.startForegroundService(context, Intent(context, CastFileService::class.java))
      try { CastFiles.share(context, path) } catch (error: Exception) {
        // A missing optional artwork file must not interrupt already shared audio.
        if (!alreadyRunning) {
          CastFiles.stop()
          context.stopService(Intent(context, CastFileService::class.java))
        }
        throw error
      }
    }
    AsyncFunction("stopServer") {
      CastFiles.stop()
      val context = requireNotNull(appContext.reactContext).applicationContext
      context.stopService(Intent(context, CastFileService::class.java))
    }
  }
}
