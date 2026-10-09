package expo.modules.rockskyengine

import android.content.Context
import android.net.wifi.WifiManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

/** All credentials stay in a Keystore-encrypted native store, not AsyncStorage. */
class RemoteLibraries(private val context: Context) {
  private val storage get() = AtomicFile(File(context.noBackupFilesDir, "remote-libraries.enc"))
  private fun key(): SecretKey = synchronized(lock) {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey) ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
      generateKey()
    }
  }
  private fun read(): JSONObject = synchronized(lock) {
    if (!storage.baseFile.exists()) return@synchronized JSONObject()
    val encrypted = String(storage.readFully(), Charsets.UTF_8)
    val parts = encrypted.split(':')
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
    JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
  }
  private fun write(data: JSONObject) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val encrypted = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(data.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    val file = storage
    val output = file.startWrite()
    try {
      output.write(encrypted.toByteArray(Charsets.UTF_8))
      file.finishWrite(output)
    } catch (error: Exception) {
      file.failWrite(output)
      throw error
    }
  }
  private val indexPath get() = File(context.noBackupFilesDir, "remote-search.sqlite").absolutePath
  private fun startIndex(config: JSONObject, force: Boolean = false, reset: Boolean = false): JSONObject = synchronized(lock) {
    // Re-read under the same lock as save/remove: stale callers must never
    // restart a disconnected library or index with superseded credentials.
    val current = read().optJSONObject(config.getString("id")) ?: return@synchronized JSONObject()
    native(JSONObject().put("cmd", "indexStart").put("config", current).put("indexPath", indexPath).put("force", force).put("reset", reset))
  }
  private fun publicConfig(config: JSONObject) = JSONObject().apply {
    for (field in listOf("id", "name", "kind", "baseUrl", "username")) put(field, config.optString(field))
  }
  private fun native(request: JSONObject): JSONObject {
    val result = JSONObject(NativeEngine.libraryCommand(request.toString()))
    check(result.optBoolean("ok")) { result.optString("error", "Library request failed") }
    return result
  }
  fun request(input: String): String {
    try {
      val request = JSONObject(input)
      val result = when (request.getString("cmd")) {
        "list" -> {
          val data = synchronized(lock) { read() }
          val configs = data.keys().asSequence().map { data.getJSONObject(it) }.toList()
          configs.forEach { runCatching { startIndex(it) } }
          JSONObject().put("sources", JSONArray(configs.map { publicConfig(it) }))
        }
        "searchIndex", "indexStatus" -> {
          val data = synchronized(lock) { read() }
          val configs = data.keys().asSequence().map { data.getJSONObject(it) }.toList()
          val result = native(request.put("configs", JSONArray(configs)).put("indexPath", indexPath))
          result.optJSONArray("entries")?.let { entries ->
            val caches = configs.associate { it.getString("id") to RemoteMetadataCache(context, it.getString("id")) }
            for (i in 0 until entries.length()) {
              val entry = entries.getJSONObject(i)
              caches[entry.optString("sourceId")]?.merge(JSONObject().put("entries", JSONArray().put(entry)))
            }
          }
          result
        }
        "indexStart" -> {
          val config = synchronized(lock) { read().optJSONObject(request.getString("sourceId")) } ?: error("Library was disconnected")
          startIndex(config, request.optBoolean("force"))
        }
        "save" -> {
          val config = request.getJSONObject("config")
          val id = config.optString("id").ifEmpty { UUID.randomUUID().toString() }
          config.put("id", id)
          // Blank credentials on edit mean keep the stored secret. Switching
          // provider or URL is done through a new connection, not credential reuse.
          val previous = synchronized(lock) { read().optJSONObject(id) }
          if (previous != null) {
            check(previous.getString("kind") == config.getString("kind")) { "Library type cannot be changed" }
            if (previous.getString("baseUrl").trimEnd('/') == config.getString("baseUrl").trimEnd('/') && previous.optString("username") == config.optString("username")) {
              for (field in listOf("password", "token", "userId")) if (config.optString(field).isEmpty()) config.put(field, previous.optString(field))
            }
          }
          val connected = native(JSONObject().put("cmd", "connect").put("config", config)).getJSONObject("config")
          synchronized(lock) {
            if (previous != null && (previous.optString("baseUrl") != connected.optString("baseUrl") || previous.optString("username") != connected.optString("username"))) RemoteMetadataCache(context, id).clear()
            val data = read(); data.put(id, connected); write(data)
          }
          val changed = previous == null || listOf("baseUrl", "username", "password", "token", "userId").any { previous.optString(it) != connected.optString(it) }
          // Index failures must not prevent connecting or playing from the server.
          runCatching { startIndex(connected, force = true, reset = changed) }
          JSONObject().put("source", publicConfig(connected))
        }
        "remove" -> synchronized(lock) {
          val sourceId = request.getString("sourceId")
          native(JSONObject().put("cmd", "removeIndex").put("sourceId", sourceId).put("indexPath", indexPath))
          val data = read(); data.remove(sourceId); write(data)
          RemoteMetadataCache(context, sourceId).clear(); JSONObject()
        }
        "discover" -> {
          val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
          val multicast = wifi.createMulticastLock("rocksky-library-discovery").apply { setReferenceCounted(false); acquire() }
          try {
            val found = native(request).getJSONArray("devices")
            JSONObject().put("devices", JSONArray((0 until found.length()).map { publicConfig(found.getJSONObject(it)) }))
          } finally { if (multicast.isHeld) multicast.release() }
        }
        "metadata", "cacheArtwork", "browse", "stream", "writablePlaylists", "addToPlaylist", "playlistOperation" -> {
          val config = synchronized(lock) { read().optJSONObject(request.getString("sourceId")) } ?: error("Library was disconnected. Connect it again to play.")
          val cache = RemoteMetadataCache(context, request.getString("sourceId"))
          when (request.getString("cmd")) {
            "metadata" -> {
              val id = request.getString("id")
              val metadata = cache.enrich(id, request.getJSONObject("seed"), {
                native(JSONObject().put("cmd", "stream").put("id", id).put("config", config)).getString("url")
              }, { data -> native(JSONObject().put("cmd", "artistArtwork").put("id", id).put("artist", data.optString("artist")).put("config", config)).optString("url") })
              JSONObject().put("metadata", metadata)
            }
            "cacheArtwork" -> JSONObject().put("metadata", cache.cacheLookup(request.getString("id"), request.optString("artist"), request.optString("artistUrl"), request.optString("albumUrl")))
            "browse" -> cache.merge(native(request.put("config", config)))
            else -> native(request.put("config", config)).also {
              if (request.getString("cmd") == "addToPlaylist" || (request.getString("cmd") == "playlistOperation" && request.optString("operation") in listOf("create", "rename", "delete"))) {
                runCatching { startIndex(config, force = true) }
              }
            }
          }
        }
        else -> error("Unknown library operation")
      }
      return result.put("ok", true).toString()
    } catch (e: Exception) {
      // Do not surface encrypted store contents, credentials, or request URLs.
      val message = if (e is IllegalStateException) e.message else "Could not read your library connections. Try again."
      return JSONObject().put("ok", false).put("error", message ?: "Library request failed").toString()
    }
  }
  companion object { private const val ALIAS = "rocksky.library.credentials"; private val lock = Any() }
}
