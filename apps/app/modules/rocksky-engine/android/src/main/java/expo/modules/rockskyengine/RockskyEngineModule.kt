package expo.modules.rockskyengine

import android.content.Context
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JNI bridge to librocksky_engine.so (apps/app/native/engine); loading is
// guarded so binaries built without the Rust toolchain still run.
object NativeEngine {
  @Volatile
  private var loaded = false

  val isLoaded: Boolean
    get() = loaded

  @Synchronized
  fun load(context: Context): Boolean {
    if (loaded) return true
    return try {
      // The engine's audio backend (oboe via cpal) pulls in the C++ runtime.
      // React Native already ships libc++_shared.so, but it must be loaded
      // into this classloader's namespace first or dlopen of the engine fails
      // with "cannot locate symbol __cxa_pure_virtual".
      try {
        System.loadLibrary("c++_shared")
      } catch (_: Throwable) {
      }
      System.loadLibrary("rocksky_engine")
      nativeInit(context.applicationContext)
      loaded = true
      true
    } catch (t: Throwable) {
      android.util.Log.e("RockskyEngine", "native engine unavailable", t)
      false
    }
  }

  @JvmStatic
  fun rendererFocus(): Boolean = MediaRendererService.requestFocus()

  @JvmStatic
  external fun nativeInit(context: Context)

  @JvmStatic
  external fun command(json: String): String

  @JvmStatic
  external fun libraryCommand(json: String): String
}

class RockskyEngineModule : Module() {
  private fun ensureLoaded(): Boolean {
    val context = appContext.reactContext?.applicationContext ?: return false
    return NativeEngine.load(context)
  }

  // The engine's audio thread lives in the process, not in the Activity, so
  // swiping the app away tore down the UI and left it playing with nothing to
  // control it. Silence it when the Activity or the module goes.
  private fun stopPlayback() {
    if (!NativeEngine.isLoaded) return
    if (MediaRendererService.active) {
      val receiver = runCatching { org.json.JSONObject(NativeEngine.command("{\"cmd\":\"rendererStatus\"}")) }.getOrNull()
      if (receiver?.optJSONObject("track") != null) return
    }
    try {
      NativeEngine.command("{\"cmd\":\"stop\"}")
    } catch (t: Throwable) {
      android.util.Log.e("RockskyEngine", "failed to stop playback on teardown", t)
    }
  }

  private fun localMusicPath(id: String): String {
      val context = requireNotNull(appContext.reactContext).applicationContext
      check(LocalMusicScanJob.hasPermission(context)) { "Allow music access to play this file" }
      val track = LocalMusicStore(context).use { it.track(id) } ?: error("Track is no longer available")
      val path = track.getString("path")
      return if (path.isNotBlank() && java.io.File(path).canRead()) path else {
        val dir = java.io.File(context.cacheDir, "local-playback").apply { mkdirs() }
        val file = java.io.File(dir, "$id-${track.getString("stamp")}.${java.io.File(track.getString("filename")).extension}")
        if (!file.exists()) {
          val pending = java.io.File.createTempFile("audio-", ".tmp", dir)
          try {
            context.contentResolver.openInputStream(android.net.Uri.parse(track.getString("uri"))).use { input ->
              checkNotNull(input) { "Audio file is unavailable" }
              pending.outputStream().use { input.copyTo(it) }
            }
            check(pending.renameTo(file)) { "Could not prepare the audio file" }
          } finally { pending.delete() }
        }
        file.absolutePath
      }
    }

  private val identifying = java.util.concurrent.atomic.AtomicBoolean(false)

  override fun definition() = ModuleDefinition {
    Name("RockskyEngine")

    AsyncFunction("sharePost") { json: String ->
      PostShare.share(requireNotNull(appContext.currentActivity) { "Open Rocksky to share a post" }, org.json.JSONObject(json))
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("mediaRenderer") { json: String ->
      val context = requireNotNull(appContext.reactContext).applicationContext
      val input = org.json.JSONObject(json)
      if (input.optString("action") == "status") MediaRendererService.status(context)
      else MediaRendererService.configure(context, input)
    }

    AsyncFunction("remoteLibrary") { json: String ->
      check(ensureLoaded()) { "Native library clients are unavailable" }
      RemoteLibraries(requireNotNull(appContext.reactContext).applicationContext).request(json)
    }

    AsyncFunction("localLibrary") {
      val context = requireNotNull(appContext.reactContext).applicationContext
      LocalMusicScanJob.ensureScheduled(context)
      LocalMusicStore(context).use { it.library().put("scan", LocalMusicScanJob.status(context)).toString() }
    }
    AsyncFunction("scanLocalMusic") {
      LocalMusicScanJob.schedule(requireNotNull(appContext.reactContext).applicationContext, force = true)
    }
    AsyncFunction("mutateLocalMusic") { json: String ->
      LocalMusicStore(requireNotNull(appContext.reactContext).applicationContext).use { it.mutate(org.json.JSONObject(json)).toString() }
    }
    AsyncFunction("localMusicPath") { id: String -> localMusicPath(id) }
    AsyncFunction("prepareLocalMusicUpload") { id: String ->
      LocalMusicUpload.prepare(requireNotNull(appContext.reactContext).applicationContext, id)
    }
    AsyncFunction("releaseLocalMusicUpload") { uri: String ->
      LocalMusicUpload.release(requireNotNull(appContext.reactContext).applicationContext, uri)
    }
    AsyncFunction("fingerprintLocalTrack") { id: String ->
      check(identifying.compareAndSet(false, true)) { "Already identifying a track" }
      try {
        check(ensureLoaded()) { "Native audio engine is unavailable" }
        NativeEngine.command(org.json.JSONObject().put("cmd", "fingerprint").put("path", localMusicPath(id)).toString())
      } finally { identifying.set(false) }
    }

    Function("isAvailable") {
      ensureLoaded()
    }

    Function("command") { json: String ->
      if (!ensureLoaded()) {
        throw CodedException("Rocksky engine native library is not available")
      }
      NativeEngine.command(json)
    }

    OnActivityDestroys {
      stopPlayback()
    }

    OnDestroy {
      stopPlayback()
    }
  }
}
