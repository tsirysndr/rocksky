package expo.modules.rockskycast

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import java.net.Inet4Address
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManager
import com.google.android.gms.cast.framework.SessionManagerListener

object CastFiles {
  private var server: CastFileServer? = null
  @Synchronized fun share(context: Context, path: String): Map<String, String> {
    if (server == null) {
      val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
      val network = connectivity.allNetworks.firstOrNull { n ->
        val c = connectivity.getNetworkCapabilities(n)
        c?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true || c?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true
      } ?: error("Connect your phone and Chromecast to the same Wi-Fi network")
      val ip = connectivity.getLinkProperties(network)?.linkAddresses?.map { it.address }
        ?.filterIsInstance<Inet4Address>()?.firstOrNull { !it.isLoopbackAddress && !it.isLinkLocalAddress }
        ?.hostAddress ?: error("Could not find a local Wi-Fi address")
      val created = CastFileServer(ip)
      created.start(10_000, true)
      server = created
    }
    return requireNotNull(server).share(path)
  }
  @Synchronized fun isRunning(): Boolean = server != null
  @Synchronized fun stop() { server?.stop(); server = null }
}

class CastFileService : Service() {
  private var sessionManager: SessionManager? = null
  private val sessionListener = object : SessionManagerListener<CastSession> {
    override fun onSessionStarting(session: CastSession) {}
    override fun onSessionStarted(session: CastSession, id: String) {}
    override fun onSessionStartFailed(session: CastSession, error: Int) { stopSelf() }
    override fun onSessionEnding(session: CastSession) {}
    override fun onSessionEnded(session: CastSession, error: Int) { stopSelf() }
    override fun onSessionResuming(session: CastSession, id: String) {}
    override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {}
    override fun onSessionResumeFailed(session: CastSession, error: Int) { stopSelf() }
    override fun onSessionSuspended(session: CastSession, reason: Int) {}
  }
  private var wakeLock: PowerManager.WakeLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  override fun onCreate() {
    super.onCreate()
    sessionManager = CastContext.getSharedInstance(this).sessionManager
    sessionManager?.addSessionManagerListener(sessionListener, CastSession::class.java)
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel("rocksky-cast", "Chromecast", NotificationManager.IMPORTANCE_LOW))
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val notification = NotificationCompat.Builder(this, "rocksky-cast")
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("Casting local music")
      .setContentText("Keep connected to Wi-Fi to listen on your TV")
      .setOngoing(true)
      .apply { if (launch != null) setContentIntent(PendingIntent.getActivity(this@CastFileService, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)) }
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(833, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(833, notification)
    wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Rocksky:CastFiles").apply { acquire() }
    @Suppress("DEPRECATION")
    wifiLock = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager).createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Rocksky:CastFiles").apply { acquire() }
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onTaskRemoved(rootIntent: Intent?) { stopSelf() }
  override fun onDestroy() {
    sessionManager?.removeSessionManagerListener(sessionListener, CastSession::class.java)
    CastFiles.stop()
    wakeLock?.let { if (it.isHeld) it.release() }
    wifiLock?.let { if (it.isHeld) it.release() }
    super.onDestroy()
  }
}
