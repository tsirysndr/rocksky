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
