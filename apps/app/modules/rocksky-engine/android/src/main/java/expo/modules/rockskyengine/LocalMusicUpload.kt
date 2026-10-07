package expo.modules.rockskyengine

import android.content.Context
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object LocalMusicUpload {
  private val mimeTypes = mapOf("mp3" to "audio/mpeg", "flac" to "audio/flac", "m4a" to "audio/mp4", "mp4" to "audio/mp4", "ogg" to "audio/ogg", "wav" to "audio/wav", "aif" to "audio/aiff", "aiff" to "audio/aiff")
  fun complete(track: JSONObject): Boolean {
    fun valid(key: String, limit: Int): Boolean {
      val value = track.optString(key, "").trim()
      return value.isNotEmpty() && value.codePointCount(0, value.length) <= limit &&
        !Regex("^(<unknown>|unknown(?: artist| album| title)?|untitled)$", RegexOption.IGNORE_CASE).matches(value)
    }
    return valid("title", 512) && valid("artist", 256) && valid("album", 256) &&
      (track.optString("albumArtist", "").isBlank() || valid("albumArtist", 256)) && track.optDouble("durationMs", 0.0).let { it.isFinite() && it > 0 }
  }

  fun prepare(context: Context, id: String): String {
    check(LocalMusicScanJob.hasPermission(context)) { "Allow music access to upload this file" }
    val track = LocalMusicStore(context).use { it.track(id) } ?: error("Track is no longer available")
    check(complete(track)) { "Complete this track's metadata before uploading" }
    val filename = track.getString("filename")
    val extension = File(filename).extension.lowercase()
    val mime = mimeTypes[extension] ?: error("This audio format is not supported for upload")
    check(NativeEngine.load(context)) { "Native metadata writer is unavailable" }
    val dir = File(context.cacheDir, "local-upload").apply { mkdirs() }
    val audio = File.createTempFile("upload-", ".$extension", dir)
    var downloadedArt: File? = null
    try {
      context.contentResolver.openInputStream(Uri.parse(track.getString("uri"))).use { input ->
        checkNotNull(input) { "Audio file is unavailable" }
        audio.outputStream().use { input.copyTo(it) }
      }
      val artUri = track.optString("albumArt", "").takeUnless { it == "null" }.orEmpty()
      val art = when {
        artUri.startsWith("file://") -> File(requireNotNull(Uri.parse(artUri).path))
        artUri.startsWith("https://") -> {
          val temporary = File.createTempFile("cover-", ".art", dir)
          downloadedArt = temporary
          val connection = URL(artUri).openConnection() as HttpURLConnection
          try {
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.setRequestProperty("User-Agent", "Rocksky (https://rocksky.app)")
            check(connection.responseCode in 200..299) { "Could not download the album cover" }
            connection.inputStream.use { input -> temporary.outputStream().use { output ->
              val buffer = ByteArray(8192)
              var total = 0
              while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                check(total <= 20 * 1024 * 1024) { "Album cover is too large" }
                output.write(buffer, 0, count)
              }
            } }
          } finally { connection.disconnect() }
          temporary
        }
        artUri.isEmpty() -> null
        else -> error("Unsupported album cover location")
      }
      val response = JSONObject(NativeEngine.command(JSONObject().put("cmd", "writeUploadMetadata")
        .put("path", audio.absolutePath).put("metadata", track).put("artPath", art?.absolutePath ?: JSONObject.NULL).toString()))
      check(response.optBoolean("ok")) { response.optString("error", "Could not prepare metadata for upload") }
      return JSONObject().put("uri", Uri.fromFile(audio).toString()).put("name", filename).put("mimeType", mime).toString()
    } catch (e: Throwable) {
      audio.delete()
      throw e
    } finally { downloadedArt?.delete() }
  }

  fun release(context: Context, uri: String) {
    val parsed = Uri.parse(uri)
    check(parsed.scheme == "file") { "Invalid upload cache file" }
    val file = File(requireNotNull(parsed.path)).canonicalFile
    check(file.parentFile == File(context.cacheDir, "local-upload").canonicalFile && file.name.startsWith("upload-")) { "Invalid upload cache file" }
    file.delete()
  }
}
