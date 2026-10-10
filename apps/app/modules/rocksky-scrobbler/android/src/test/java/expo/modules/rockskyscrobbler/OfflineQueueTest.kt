package expo.modules.rockskyscrobbler

import android.app.Application
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28], application = Application::class, manifest = Config.NONE)
class OfflineQueueTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private fun track(at: Long = 1800000000) = JSONObject().put("title", "Song").put("artist", "Artist")
    .put("album", "Album").put("albumArtist", "Artist").put("duration", 200000).put("timestamp", at)

  @Before fun clear() {
    ScrobbleStore.prefs(context).edit().clear().commit()
    ScrobbleStore.db(context).delete("queue", null, null)
    ScrobbleStore.db(context).delete("receipts", null, null)
  }
  @Test fun `excluded apps cannot be enabled by existing or changed preferences`() {
    ScrobbleStore.prefs(context).edit().putStringSet("blocked", emptySet()).commit()
    assertTrue(ScrobbleStore.settings(context).blocked.containsAll(ScrobbleSources.excluded))
    ScrobbleStore.configure(context, JSONObject().put("enabled", true).put("mode", "listened")
      .put("seconds", 240).put("percent", 50).put("minimum", 30).put("recognize", true)
      .put("blocked", org.json.JSONArray()).toString())
    assertTrue(ScrobbleStore.settings(context).blocked.containsAll(ScrobbleSources.excluded))
    assertFalse("com.google.android.apps.youtube.music" in ScrobbleStore.settings(context).blocked)
  }
  @Test fun `youtube and atradio cannot enqueue or consume youtube music dedup identity`() {
    for (source in ScrobbleSources.excluded) ScrobbleStore.enqueue(context, "did:one", source, track())
    assertEquals(0 to 0, ScrobbleStore.counts(context, "did:one"))
    ScrobbleStore.enqueue(context, "did:one", "com.google.android.apps.youtube.music", track())
    assertEquals(1 to 0, ScrobbleStore.counts(context, "did:one"))
    assertNotNull(ScrobbleStore.nextQueued(context, "did:one"))
  }
  @Test fun `previously queued excluded sources are never selected for upload`() {
    val db = ScrobbleStore.db(context)
    for (source in ScrobbleSources.excluded) {
      db.execSQL("INSERT INTO queue(id,did,source,payload,created) VALUES(?,?,?,?,0)",
        arrayOf(source, "did:one", source, track().toString()))
    }
    assertNull(ScrobbleStore.nextQueued(context, "did:one"))
    assertEquals(0 to 0, ScrobbleStore.counts(context, "did:one"))
    ScrobbleStore.enqueue(context, "did:one", "com.google.android.apps.youtube.music", track(1800000400))
    assertEquals(1800000400, JSONObject(ScrobbleStore.nextQueued(context, "did:one")!!.second).getLong("timestamp"))
    assertEquals(1 to 0, ScrobbleStore.counts(context, "did:one"))
  }
  @Test fun `two sources at the same time enqueue only once`() {
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    ScrobbleStore.enqueue(context, "did:one", "tidal", track().put("album", "Deluxe"))
    assertEquals(1 to 0, ScrobbleStore.counts(context, "did:one"))
  }
  @Test fun `uploaded listen stays deduplicated after queue removal`() {
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    ScrobbleStore.db(context).delete("queue", null, null)
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    assertEquals(0 to 0, ScrobbleStore.counts(context, "did:one"))
  }
  @Test fun `offline replay keeps original timestamp and account`() {
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    ScrobbleStore.enqueue(context, "did:one", "spotify", track(1800000400))
    ScrobbleStore.enqueue(context, "did:two", "spotify", track())
    assertEquals(2 to 0, ScrobbleStore.counts(context, "did:one"))
    assertEquals(1 to 0, ScrobbleStore.counts(context, "did:two"))
    ScrobbleStore.db(context).rawQuery("SELECT payload FROM queue WHERE did=? ORDER BY created", arrayOf("did:one")).use {
      assertTrue(it.moveToFirst()); assertEquals(1800000000, JSONObject(it.getString(0)).getLong("timestamp"))
    }
  }
  @Test fun `failed records are retained and reported separately`() {
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    ScrobbleStore.db(context).execSQL("UPDATE queue SET failed=1")
    assertEquals(1 to 1, ScrobbleStore.counts(context, "did:one"))
  }
  @Test fun `outer checkpoint rollback also rolls back dedup receipt`() {
    val db = ScrobbleStore.db(context)
    db.beginTransaction()
    try { ScrobbleStore.enqueue(context, "did:one", "spotify", track()) } finally { db.endTransaction() }
    assertEquals(0 to 0, ScrobbleStore.counts(context, "did:one"))
    ScrobbleStore.enqueue(context, "did:one", "spotify", track())
    assertEquals(1 to 0, ScrobbleStore.counts(context, "did:one"))
  }
}
