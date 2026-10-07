package expo.modules.rockskycast

import fi.iki.elonen.NanoHTTPD
import java.io.File
import java.io.FileInputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Files are registered explicitly and addressed only by unguessable capabilities.
// No directory traversal, directory listings, uploads, or arbitrary file paths over HTTP.
class CastFileServer(private val host: String) : NanoHTTPD(host, 0) {
  private data class Entry(val file: File, val mime: String)
  private val files = ConcurrentHashMap<String, Entry>()
  private val tokens = ConcurrentHashMap<String, String>()

  @Synchronized fun share(path: String): Map<String, String> {
    val file = File(path).canonicalFile
    require(file.isFile && file.canRead()) { "Local file is no longer available" }
    val mime = when (file.extension.lowercase()) {
      "mp3" -> "audio/mpeg"
      "m4a", "mp4", "aac" -> if (file.extension.lowercase() == "aac") "audio/aac" else "audio/mp4"
      "flac" -> "audio/flac"
      "wav" -> "audio/wav"
      "ogg", "oga", "opus" -> "audio/ogg"
      "webm" -> "audio/webm"
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "webp" -> "image/webp"
      else -> error("This file format cannot be cast: ${file.extension}")
    }
    val token = tokens.getOrPut(file.path) { UUID.randomUUID().toString() }
    files["/$token"] = Entry(file, mime)
    return mapOf("url" to "http://$host:$listeningPort/$token", "contentType" to mime)
  }

  override fun serve(session: IHTTPSession): Response {
    val response = try {
      when {
        session.method == Method.OPTIONS -> newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", "")
        session.method != Method.GET && session.method != Method.HEAD -> newFixedLengthResponse(Response.Status.METHOD_NOT_ALLOWED, "text/plain", "Method not allowed")
        else -> serveFile(session)
      }
    } catch (_: Exception) {
      newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "File unavailable")
    }
    response.addHeader("Access-Control-Allow-Origin", "*")
    response.addHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
    response.addHeader("Access-Control-Allow-Headers", "Range, Content-Type")
    response.addHeader("Access-Control-Allow-Private-Network", "true")
    response.addHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")
    response.addHeader("Cache-Control", "no-store")
    return response
  }

  private fun serveFile(session: IHTTPSession): Response {
    val entry = files[session.uri] ?: return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
    val size = entry.file.length()
    val header = session.headers["range"]
    val range = header?.let { ByteRange.parse(it, size) }
    if (header != null && range == null) {
      return newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, "text/plain", "").apply {
        addHeader("Content-Range", "bytes */$size")
      }
    }
    val length = range?.length ?: size
    val stream = FileInputStream(entry.file)
    try { stream.channel.position(range?.start ?: 0) } catch (error: Exception) { stream.close(); throw error }
    // NanoHTTPD suppresses the body for HEAD while retaining the real content length.
    return newFixedLengthResponse(if (range == null) Response.Status.OK else Response.Status.PARTIAL_CONTENT, entry.mime, stream, length).apply {
      addHeader("Accept-Ranges", "bytes")
      if (range != null) addHeader("Content-Range", "bytes ${range.start}-${range.end}/$size")
    }
  }
}
