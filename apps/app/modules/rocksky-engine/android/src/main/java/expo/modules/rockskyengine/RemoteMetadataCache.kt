package expo.modules.rockskyengine

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.security.MessageDigest
import java.util.Locale
import org.json.JSONObject

/** Server-scoped tags and local image files, never stream URLs or credentials. */
class RemoteMetadataCache(context: Context, sourceId: String) {
  private val root = File(context.noBackupFilesDir, "remote-metadata/${hash(sourceId)}").apply { mkdirs() }
  private fun normalized(value: String) = value.trim().lowercase(Locale.ROOT)
  private fun record(key: String) = File(root, "${hash(key)}.json")
  private fun read(key: String): JSONObject = try { JSONObject(record(key).readText()) } catch (_: Exception) { JSONObject() }
  private fun write(key: String, data: JSONObject) = synchronized(cacheLock) {
    val file = AtomicFile(record(key)); val output = file.startWrite()
    try { output.write(data.toString().toByteArray(Charsets.UTF_8)); file.finishWrite(output) }
    catch (e: Exception) { file.failWrite(output); throw e }
  }
  private fun localImage(value: String): String? = value.takeIf { it.startsWith("file://") && File(it.removePrefix("file://")).isFile }
  private fun artistKey(name: String) = "artist:${normalized(name)}"
  private fun albumKey(artist: String, album: String) = "album:${normalized(artist)}:${normalized(album)}"
  private fun image(url: String, key: String): String? {
    localImage(url)?.let { return it }
    if (!url.startsWith("http://") && !url.startsWith("https://")) return null
    val path = File(root, "${hash(key)}.img")
    if (path.isFile) return "file://${path.absolutePath}"
    val result = JSONObject(NativeEngine.command(JSONObject().put("cmd", "cacheRemoteArtwork").put("url", url).put("path", path.absolutePath).toString()))
    return if (result.optBoolean("ok")) "file://${path.absolutePath}" else null
  }
  fun enrich(id: String, seed: JSONObject, stream: () -> String, artistArtwork: (JSONObject) -> String): JSONObject {
    val key = "track:$id"
    val cached = read(key)
    if (System.currentTimeMillis() - cached.optLong("cachedAt") < 7L * 86400000) {
      if (localImage(cached.optString("albumArt")) == null) image(seed.optString("albumArt", seed.optString("art")), key)?.let {
        cached.put("albumArt", it); write(key, cached); cacheAlbum(cached)
      }
      return decorate(cached)
    }
    val data = JSONObject(seed.toString())
    data.remove("art"); data.remove("albumArt"); data.remove("streamUrl")
    data.put("id", id).put("kind", "track")
    val art = File(root, "${hash(key)}.img")
    try {
      val response = JSONObject(NativeEngine.command(JSONObject().put("cmd", "readRemoteMetadata")
        .put("url", stream()).put("cachePath", File(root, "${hash(key)}.audio").absolutePath)
        .put("artPath", art.absolutePath).toString()))
      response.optJSONObject("metadata")?.let { tags ->
        for (field in tags.keys()) {
          val value = tags.get(field)
          if (value != JSONObject.NULL && value.toString().isNotBlank() && !(value is Number && value.toDouble() == 0.0)) data.put(field, value)
        }
      }
    } catch (_: Exception) { /* Server-provided metadata still remains usable. */ }
    val cover = localImage(data.optString("albumArt")) ?: image(seed.optString("albumArt", seed.optString("art")), key)
    data.put("albumArt", cover ?: JSONObject.NULL)
    data.put("cachedAt", System.currentTimeMillis())
    write(key, data)
    cacheAlbum(data)
    val artist = data.optString("artist")
    if (artist.isNotBlank() && localImage(read(artistKey(artist)).optString("art")) == null) {
      try { image(artistArtwork(data), artistKey(artist))?.let {
        write(artistKey(artist), JSONObject().put("art", it).put("lookupAt", System.currentTimeMillis()))
      } } catch (_: Exception) { /* Public lookup can supply missing artist artwork. */ }
    }
    pruneImages()
    return decorate(data)
  }
  private fun cacheAlbum(data: JSONObject) {
    val artist = data.optString("albumArtist").ifBlank { data.optString("artist") }
    val album = data.optString("album")
    if (artist.isNotBlank() && album.isNotBlank()) localImage(data.optString("albumArt"))?.let {
      write(albumKey(artist, album), JSONObject().put("art", it))
      // UPnP commonly provides the track artist rather than album artist.
      if (data.optString("artist").isNotBlank()) write(albumKey(data.optString("artist"), album), JSONObject().put("art", it))
    }
  }
  private fun decorate(data: JSONObject): JSONObject {
    val artist = read(artistKey(data.optString("artist")))
    data.put("artistPicture", localImage(artist.optString("art")) ?: JSONObject.NULL)
    data.put("artistLookupAt", artist.optLong("lookupAt"))
    if (localImage(data.optString("albumArt")) == null) data.put("albumArt", JSONObject.NULL)
    return data
  }
  fun cacheLookup(id: String, artist: String, artistUrl: String, albumUrl: String): JSONObject {
    val data = read("track:$id")
    if (data.length() == 0) return data
    if (normalized(artist) == normalized(data.optString("artist")) && artist.isNotBlank()) {
      val key = artistKey(artist)
      val art = image(artistUrl, key)
      write(key, JSONObject().put("art", art ?: JSONObject.NULL).put("lookupAt", System.currentTimeMillis()))
    }
    if (localImage(data.optString("albumArt")) == null) image(albumUrl, "track:$id")?.let { data.put("albumArt", it) }
    data.put("artworkLookupAt", System.currentTimeMillis())
    write("track:$id", data); cacheAlbum(data); pruneImages()
    return decorate(data)
  }
  fun merge(page: JSONObject): JSONObject {
    val entries = page.optJSONArray("entries") ?: return page
    for (index in 0 until entries.length()) {
      val entry = entries.getJSONObject(index)
      when (entry.optString("kind")) {
        "track" -> {
          val cached = read("track:${entry.optString("id")}")
          for (field in listOf("title", "artist", "album", "albumArtist", "durationMs", "genre", "year", "trackNumber", "discNumber")) {
            if (cached.has(field) && cached.optString(field).isNotBlank() && cached.opt(field) != JSONObject.NULL) entry.put(field, cached.get(field))
          }
          val art = localImage(cached.optString("albumArt")) ?: localImage(read(albumKey(entry.optString("artist"), entry.optString("album"))).optString("art"))
          if (art != null) entry.put("art", art)
        }
        "album" -> localImage(read(albumKey(entry.optString("artist"), entry.optString("title"))).optString("art"))?.let { entry.put("art", it) }
        "artist" -> localImage(read(artistKey(entry.optString("title"))).optString("art"))?.let { entry.put("art", it) }
      }

    }
    return page
  }
  private fun pruneImages() {
    var bytes = 0L
    root.listFiles()?.filter { it.extension == "img" }?.sortedByDescending { it.lastModified() }?.forEach {
      bytes += it.length(); if (bytes > 200L * 1024 * 1024) it.delete()
    }
  }
  fun clear() { root.deleteRecursively() }
  companion object {
    private val cacheLock = Any()
    private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
  }
}
