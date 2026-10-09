package expo.modules.rockskyengine

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.net.*
import android.net.wifi.WifiManager
import android.os.*
import org.json.JSONObject
import java.net.Inet4Address
import java.util.UUID

/** Android owns permissions, audio focus and network lifetime. SSDP, HTTP,
 * SOAP, GENA and decoding all run in Rust, independently of the JS runtime. */
class MediaRendererService : Service() {
  companion object {
    private const val CHANNEL = "rocksky-media-renderer"
    private const val NOTIFICATION = 835
    private const val STOP = "rocksky.renderer.STOP"
    @Volatile private var instance: MediaRendererService? = null
    private val nativeLock = Any()
    private var nativeOwner: MediaRendererService? = null
    @Volatile private var error: String? = null
    val active: Boolean get() = instance != null
    private fun prefs(context: Context) = context.getSharedPreferences("media-renderer", Context.MODE_PRIVATE)
    fun enabled(context: Context) = prefs(context).getBoolean("enabled", false)
    private fun name(context: Context) = "${context.applicationInfo.loadLabel(context.packageManager)} · ${Build.MODEL}"
    @Synchronized private fun uuid(context: Context): String {
      val prefs = prefs(context)
      return prefs.getString("uuid", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("uuid", it).apply() }
    }
    fun configure(context: Context, input: JSONObject): String {
      if (input.has("enabled")) {
        val enable = input.getBoolean("enabled")
        prefs(context).edit().putBoolean("enabled", enable).apply()
        error = null
        if (!enable) {
          // Serialize shutdown through the service worker; no sockets remain
          // once its native stop completes. UI polls running state meanwhile.
          context.stopService(Intent(context, MediaRendererService::class.java))
        }
      }
      if (enabled(context)) {
        try {
          check(NativeEngine.load(context)) { "Native audio engine is unavailable" }
          val intent = Intent(context, MediaRendererService::class.java)
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } catch (e: Exception) {
          error = e.message ?: "Could not start media receiver"
          if (input.has("enabled")) prefs(context).edit().putBoolean("enabled", false).apply()
        }
      }
      return status(context)
    }
    fun status(context: Context): String {
      val result = if (NativeEngine.isLoaded) runCatching { JSONObject(NativeEngine.command("{\"cmd\":\"rendererStatus\"}")) }.getOrDefault(JSONObject()) else JSONObject()
      return result.put("enabled", enabled(context)).put("name", name(context)).put("error", error ?: JSONObject.NULL).toString()
    }
    /** Called by Rust before accepting Play. Never ask Android for focus while
     * just advertising, so enabling the setting doesn't interrupt other apps. */
    fun requestFocus(): Boolean = instance?.acquireFocus() ?: false
  }

  private val workerThread = HandlerThread("RockskyRenderer")
  private lateinit var worker: Handler
  private lateinit var connectivity: ConnectivityManager
  private lateinit var audio: AudioManager
  private var multicast: WifiManager.MulticastLock? = null
  private var wifiLock: WifiManager.WifiLock? = null
  private var wake: PowerManager.WakeLock? = null
  @Volatile private var destroyed = false
  @Volatile private var focused = false
  @Volatile private var focusGraceUntil = 0L
  private var focusRequest: AudioFocusRequest? = null
  private var address: String? = null
  private var registered = false
  private var announcedPlaying = false
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change < 0) {
      focused = false
      worker.post {
        if (NativeEngine.isLoaded) {
          val state = JSONObject(NativeEngine.command("{\"cmd\":\"rendererStatus\"}"))
          if (!state.isNull("track")) NativeEngine.command("{\"cmd\":\"pause\"}")
        }
      }
    } else if (change == AudioManager.AUDIOFOCUS_GAIN) focused = true
  }
  @Synchronized private fun acquireFocus(): Boolean {
    if (destroyed) return false
    focusGraceUntil = SystemClock.elapsedRealtime() + 10_000
    if (focused) return true
    val result = if (Build.VERSION.SDK_INT >= 26) {
      val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
        .setOnAudioFocusChangeListener(focusListener, Handler(Looper.getMainLooper())).build().also { focusRequest = it }
      audio.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audio.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    focused = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return focused
  }
  @Synchronized private fun abandonFocus() {
    if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { audio.abandonAudioFocusRequest(it) }
    else { @Suppress("DEPRECATION") audio.abandonAudioFocus(focusListener) }
    focused = false
  }
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { worker.post { updateNetwork() } }
    override fun onLost(network: Network) { worker.post { updateNetwork() } }
    override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) { worker.post { updateNetwork() } }
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { worker.post { updateNetwork() } }
  }
  private fun notification(message: String): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
    val stop = PendingIntent.getService(this, 1, Intent(this, MediaRendererService::class.java).setAction(STOP), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return builder.setContentTitle("Rocksky media receiver").setContentText(message)
      .setSmallIcon(android.R.drawable.ic_media_play).setContentIntent(open)
      .setOngoing(true).setOnlyAlertOnce(true).setCategory(Notification.CATEGORY_SERVICE)
      .addAction(Notification.Action.Builder(null, "Turn off", stop).build()).build()
  }
  private fun show(message: String) {
    if (!destroyed) getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification(message))
  }
  override fun onCreate() {
    super.onCreate()
    instance = this
    audio = getSystemService(AudioManager::class.java)
    connectivity = getSystemService(ConnectivityManager::class.java)
    workerThread.start(); worker = Handler(workerThread.looper)
    if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL, "Media receiver", NotificationManager.IMPORTANCE_LOW))
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification("Waiting for a local network"), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(NOTIFICATION, notification("Waiting for a local network"))
    if (!NativeEngine.load(this)) { error = "Native audio engine is unavailable"; stopSelf(); return }
    val wifi = applicationContext.getSystemService(WifiManager::class.java)
    multicast = wifi?.createMulticastLock("Rocksky:renderer")?.apply { setReferenceCounted(false) }
    @Suppress("DEPRECATION")
    wifiLock = wifi?.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Rocksky:renderer")?.apply { setReferenceCounted(false) }
    wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Rocksky:renderer").apply { setReferenceCounted(false) }
    // Includes LANs with no internet; excludes VPN/cellular in updateNetwork.
    connectivity.registerNetworkCallback(NetworkRequest.Builder().clearCapabilities().addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), callback)
    registered = true
    worker.post { updateNetwork() }
    worker.post(monitor)
  }
  private fun updateNetwork() = synchronized(nativeLock) {
    if (destroyed || !enabled(this)) return
    val link = connectivity.allNetworks.asSequence().filter { network ->
      connectivity.getNetworkCapabilities(network)?.let {
        !it.hasTransport(NetworkCapabilities.TRANSPORT_VPN) && (it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || it.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET))
      } == true
    }.mapNotNull { connectivity.getLinkProperties(it) }.flatMap { it.linkAddresses.asSequence() }
      .firstOrNull { it.address is Inet4Address && !it.address.isLoopbackAddress && !it.address.isLinkLocalAddress }
    val next = link?.let { "${it.address.hostAddress}/${it.prefixLength}" }
    if (next == address) return
    stopNative()
    if (link == null) { show("Waiting for Wi-Fi or Ethernet"); return }
    try {
      multicast?.acquire(); wifiLock?.acquire(); wake?.acquire()
      nativeOwner = this
      val config = JSONObject().put("ip", link.address.hostAddress).put("prefixLength", link.prefixLength).put("name", name(this)).put("uuid", uuid(this))
      val result = JSONObject(NativeEngine.command(JSONObject().put("cmd", "rendererConfigure").put("config", config).toString()))
      check(result.optBoolean("ok")) { result.optString("error", "Could not start receiver") }
      address = next; error = null
      show("Discoverable as ${name(this)}")
    } catch (e: Exception) {
      error = e.message ?: "Could not start media receiver"
      stopNative(); show("Receiver unavailable · open settings to retry")
    }
  }
  private val monitor = object : Runnable {
    override fun run() {
      if (destroyed) return
      if (NativeEngine.isLoaded) {
        val receiver = runCatching { JSONObject(NativeEngine.command("{\"cmd\":\"rendererStatus\"}")) }.getOrNull()
        val track = receiver?.optJSONObject("track")
        val playing = track != null && JSONObject(NativeEngine.command("{\"cmd\":\"status\"}")).optString("state") == "playing"
        if (playing) show("${track!!.optString("title", "Network audio")} · ${track.optString("artist")}")
        else if (announcedPlaying) show(if (address == null) "Waiting for Wi-Fi or Ethernet" else "Discoverable as ${name(this@MediaRendererService)}")
        if (!playing && focused && SystemClock.elapsedRealtime() > focusGraceUntil) abandonFocus()
        announcedPlaying = playing
      }
      worker.postDelayed(this, 1000)
    }
  }
  private fun stopNative() = synchronized(nativeLock) {
    if (nativeOwner === this && NativeEngine.isLoaded) NativeEngine.command("{\"cmd\":\"rendererConfigure\",\"config\":null}")
    if (nativeOwner === this) nativeOwner = null
    address = null
    multicast?.let { if (it.isHeld) it.release() }; wifiLock?.let { if (it.isHeld) it.release() }; wake?.let { if (it.isHeld) it.release() }
    abandonFocus()
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == STOP || !enabled(this)) {
      prefs(this).edit().putBoolean("enabled", false).apply(); stopSelf(); return START_NOT_STICKY
    }
    worker.post { updateNetwork() }
    return START_STICKY
  }
  override fun onDestroy() {
    destroyed = true
    instance = null
    if (registered) connectivity.unregisterNetworkCallback(callback)
    worker.removeCallbacksAndMessages(null)
    worker.post { stopNative(); workerThread.quitSafely() }
    super.onDestroy()
  }
  override fun onBind(intent: Intent?) = null
}
