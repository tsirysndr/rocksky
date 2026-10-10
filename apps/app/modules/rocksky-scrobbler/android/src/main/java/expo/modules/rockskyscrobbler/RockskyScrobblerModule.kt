package expo.modules.rockskyscrobbler

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class RockskyScrobblerModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext).applicationContext
  override fun definition() = ModuleDefinition {
    Name("RockskyScrobbler")
    AsyncFunction("setAuth") { token: String?, did: String?, endpoint: String ->
      ScrobbleUploadJob.cancel(context)
      ScrobbleStore.setAuth(context, token, did, endpoint)
      ScrobbleUploadJob.schedule(context)
    }
    AsyncFunction("configure") { json: String ->
      ScrobbleStore.configure(context, json)
      if (ScrobbleStore.settings(context).enabled) {
        NotificationListenerService.requestRebind(ComponentName(context, ScrobbleListener::class.java))
        ScrobbleUploadJob.schedule(context)
      } else ScrobbleUploadJob.cancel(context)
    }
    AsyncFunction("status") {
      val c = context
      val s = ScrobbleStore.settings(c)
      val p = ScrobbleStore.prefs(c)
      val component = ComponentName(c, ScrobbleListener::class.java)
      val allowed = Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners")
        ?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
      val auth = ScrobbleStore.auth(c)
      val (queued, failed) = ScrobbleStore.counts(c, auth?.optString("did"))
      val apps = JSONObject(p.getString("apps", "{}")!!)
      mapOf(
        "enabled" to s.enabled, "mode" to s.mode, "seconds" to s.seconds,
        "percent" to s.percent, "minimum" to s.minimum, "recognize" to s.recognize,
        "blocked" to s.blocked.toList(), "notificationAccess" to allowed,
        "excluded" to ScrobbleSources.excluded.toList(),
        "connected" to ScrobbleListener.connected, "signedIn" to (auth != null),
        "queued" to queued, "failed" to failed, "lastUpload" to p.getLong("lastUpload", 0),
        "error" to (p.getString("authError", null) ?: p.getString("uploadError", null) ?: p.getString("serviceError", null)),
        "current" to ScrobbleListener.current,
        "apps" to apps.keys().asSequence().map { mapOf("packageName" to it, "label" to apps.getString(it)) }.toList()
      )
    }
    AsyncFunction("openNotificationAccess") {
      val c = context
      val component = ComponentName(c, ScrobbleListener::class.java)
      val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
          .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, component.flattenToString())
      } else null
      var opened = false
      if (detail != null) {
        try {
          c.startActivity(detail.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          opened = true
        } catch (_: ActivityNotFoundException) {
          // Some manufacturers do not provide an app-specific access page.
        } catch (_: SecurityException) {
          // Fall back to the public notification-listener settings activity.
        }
      }
      if (!opened) {
        c.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
    }
    AsyncFunction("openBatterySettings") {
      context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("retry") { ScrobbleUploadJob.schedule(context, true) }
  }
}
