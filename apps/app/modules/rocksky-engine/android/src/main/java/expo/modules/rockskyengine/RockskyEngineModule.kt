package expo.modules.rockskyengine

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// JNI bridge to librocksky_engine.so (apps/app/native/engine); loading is
// guarded so binaries built without the Rust toolchain still run.
object NativeEngine {
  @Volatile
  private var loaded = false

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
  external fun nativeInit(context: Context)

  @JvmStatic
  external fun command(json: String): String
}

class RockskyEngineModule : Module() {
  private fun ensureLoaded(): Boolean {
    val context = appContext.reactContext?.applicationContext ?: return false
    return NativeEngine.load(context)
  }

  override fun definition() = ModuleDefinition {
    Name("RockskyEngine")

    Function("isAvailable") {
      ensureLoaded()
    }

    Function("command") { json: String ->
      if (!ensureLoaded()) {
        throw CodedException("Rocksky engine native library is not available")
      }
      NativeEngine.command(json)
    }
  }
}
