package expo.modules.rockskycast

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class CastFileServerTest {
  @Test fun rangeParsing() {
    assertEquals(ByteRange(2, 5), ByteRange.parse("bytes=2-5", 10))
    assertEquals(ByteRange(2, 9), ByteRange.parse("bytes=2-", 10))
    assertEquals(ByteRange(7, 9), ByteRange.parse("bytes=-3", 10))
    assertEquals(ByteRange(0, 9), ByteRange.parse("bytes=-99", 10))
    assertEquals(ByteRange(2, 9), ByteRange.parse("bytes=2-99", 10))
    assertNull(ByteRange.parse("bytes=10-", 10))
    assertNull(ByteRange.parse("bytes=5-2", 10))
    assertNull(ByteRange.parse("bytes=0-1,4-5", 10))
    assertNull(ByteRange.parse("bytes=-0", 10))
    assertNull(ByteRange.parse("bytes=999999999999999999999-", 10))
    assertNull(ByteRange.parse("bytes=0-", 0))
  }
  @Test fun servesOnlyRegisteredFilesAndSupportsSeeking() {
    val file = File.createTempFile("cast-test-", ".mp3").apply { writeText("0123456789") }
    val server = CastFileServer("127.0.0.1")
    server.start(5000, true)
    try {
      val url = server.share(file.path)["url"]!!
      fun connect(path: String = url, method: String = "GET", range: String? = null): HttpURLConnection {
        return (URL(path).openConnection() as HttpURLConnection).apply { requestMethod = method; connectTimeout = 3000; readTimeout = 3000; if (range != null) setRequestProperty("Range", range) }
      }
      connect(range = "bytes=2-5").let {
        assertEquals(206, it.responseCode); assertEquals("2345", it.inputStream.bufferedReader().readText())
        assertEquals("bytes 2-5/10", it.getHeaderField("Content-Range")); assertEquals("*", it.getHeaderField("Access-Control-Allow-Origin")); it.disconnect()
      }
      connect(range = "bytes=-3").let { assertEquals("789", it.inputStream.bufferedReader().readText()); it.disconnect() }
      connect(method = "HEAD").let { assertEquals(200, it.responseCode); assertEquals(10, it.contentLength); assertEquals(-1, it.inputStream.read()); it.disconnect() }
      connect(range = "bytes=20-").let { assertEquals(416, it.responseCode); assertEquals("bytes */10", it.getHeaderField("Content-Range")); it.disconnect() }
      connect(method = "OPTIONS").let { assertEquals(204, it.responseCode); assertEquals("true", it.getHeaderField("Access-Control-Allow-Private-Network")); it.disconnect() }
      connect(url.substringBeforeLast('/') + "/unknown").let { assertEquals(404, it.responseCode); it.disconnect() }
      connect(method = "POST").let { assertEquals(405, it.responseCode); it.disconnect() }
    } finally { server.stop(); file.delete() }
  }
}
