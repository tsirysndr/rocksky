package expo.modules.rockskyengine

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RemoteMetadataCacheTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
  private fun root(source: String) = File(context.noBackupFilesDir, "remote-metadata/${hash(source)}").apply { mkdirs() }
  private fun save(source: String, key: String, data: JSONObject) = File(root(source), "${hash(key)}.json").writeText(data.toString())
  @Before fun reset() { File(context.noBackupFilesDir, "remote-metadata").deleteRecursively() }
  @Test fun providerArtworkBypassesExtractionCachingAndPublicLookup() {
    val cache = RemoteMetadataCache(context, "provided")
    val seed = JSONObject().put("title", "Song").put("artist", "Singer")
      .put("albumArt", "https://server.test/cover.jpg?token=secret")
    val result = cache.enrich("track", seed, { error("Must not read remote audio") }, { "https://server.test/artist.jpg" })
    assertEquals(seed.getString("albumArt"), result.getString("albumArt"))
    assertEquals("https://server.test/artist.jpg", result.getString("artistPicture"))
    assertTrue(result.getBoolean("nativeEnrichment"))
    assertTrue(root("provided").listFiles()!!.isEmpty())
  }
  @Test fun serverArtworkWinsOverCachedFallbacksWhenBrowsing() {
    val image = File(root("one"), "old.img").apply { writeBytes(byteArrayOf(1)) }
    val uri = "file://${image.absolutePath}"
    save("one", "track:track", JSONObject().put("albumArt", uri))
    save("one", "album:singer:album", JSONObject().put("art", uri))
    save("one", "artist:singer", JSONObject().put("art", uri))
    val page = JSONObject("""{"entries":[{"id":"track","kind":"track","art":"https://server.test/track"},{"kind":"album","title":"Album","artist":"Singer","art":"https://server.test/album"},{"kind":"artist","title":"Singer","art":"https://server.test/artist"}]}""")
    val result = RemoteMetadataCache(context, "one").merge(page).getJSONArray("entries")
    for (i in 0..2) assertTrue(result.getJSONObject(i).getString("art").startsWith("https://server.test/"))
  }
  @Test fun persistedMetadataEnrichesTracksAlbumsAndArtistsWithoutCrossingServers() {
    val image = File(root("one"), "cover.img").apply { writeBytes(byteArrayOf(1,2,3)) }
    val uri = "file://${image.absolutePath}"
    save("one", "track:track", JSONObject().put("title", "Tagged title").put("artist", "Singer").put("album", "Album").put("albumArt", uri).put("cachedAt", System.currentTimeMillis()))
    val cache = RemoteMetadataCache(context, "one")
    cache.cacheLookup("track", "Singer", uri, uri)
    fun page() = JSONObject("""{"entries":[{"id":"track","kind":"track","title":"file.mp3"},{"id":"album","kind":"album","title":"Album","artist":"Singer"},{"id":"artist","kind":"artist","title":"Singer"}]}""")
    val entries = RemoteMetadataCache(context,"one").merge(page()).getJSONArray("entries")
    assertEquals("Tagged title", entries.getJSONObject(0).getString("title"))
    for (i in 0..2) assertEquals(uri, entries.getJSONObject(i).getString("art"))
    assertEquals("file.mp3", RemoteMetadataCache(context,"two").merge(page()).getJSONArray("entries").getJSONObject(0).getString("title"))
    val cached = RemoteMetadataCache(context,"one").enrich("track", JSONObject(), { error("Must not download cached audio") }, { error("Must not look up cached artist") })
    assertEquals(uri, cached.getString("albumArt"))
    image.delete()
    assertFalse(cache.merge(page()).getJSONArray("entries").getJSONObject(0).has("art"))
    cache.clear()
    assertEquals("file.mp3", RemoteMetadataCache(context,"one").merge(page()).getJSONArray("entries").getJSONObject(0).getString("title"))
  }
}
