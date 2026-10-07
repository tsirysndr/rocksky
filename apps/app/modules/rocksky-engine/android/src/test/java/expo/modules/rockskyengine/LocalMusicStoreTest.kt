package expo.modules.rockskyengine

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class LocalMusicStoreTest {
  private val context get() = RuntimeEnvironment.getApplication()
  @Before fun reset() { context.deleteDatabase("local-music.db") }
  private fun add(store: LocalMusicStore, id: String = "1", scan: String = "first", title: String = "Embedded") {
    store.upsert(id, "content://media/external/audio/media/$id", "/music/$id.mp3", "$id.mp3", "1:123", JSONObject().put("title", title).put("artist", ""), scan)
  }
  private fun mutate(store: LocalMusicStore, json: String) = store.mutate(JSONObject(json))

  @Test fun rescanPreservesEditsFavoritesAndPlaylistMembership() {
    LocalMusicStore(context).use { store ->
      add(store)
      mutate(store, """{"action":"edit","id":"1","metadata":{"title":"Corrected","artist":"Artist"}}""")
      mutate(store, """{"action":"favorite","id":"1","favorite":true}""")
      val playlist = mutate(store, """{"action":"createPlaylist","name":"My music"}""").getString("id")
      store.mutate(JSONObject().put("action", "addToPlaylist").put("id", "1").put("playlistId", playlist))
      add(store, scan = "second", title = "Changed embedded title")
      store.finishScan("second")
    }
    LocalMusicStore(context).use { reopened ->
      val track = reopened.track("1")!!
      assertEquals("Corrected", track.getString("title"))
      assertEquals("Artist", track.getString("artist"))
      assertTrue(track.getBoolean("favorite"))
      assertEquals("1", reopened.library().getJSONArray("playlists").getJSONObject(0).getJSONArray("trackIds").getString(0))
    }
  }

  @Test fun pruningOnlyHappensWhenScanFinishesAndPlaylistDeletionKeepsAudio() {
    LocalMusicStore(context).use { store ->
      add(store); add(store, id = "2")
      store.markSeen("1", "second")
      assertNotNull(store.track("2")) // An interrupted scan leaves the library intact.
      val playlist = mutate(store, """{"action":"createPlaylist","name":"One"}""").getString("id")
      store.mutate(JSONObject().put("action", "addToPlaylist").put("id", "2").put("playlistId", playlist))
      store.finishScan("second")
      assertNull(store.track("2"))
      assertEquals(0, store.library().getJSONArray("playlists").getJSONObject(0).getJSONArray("trackIds").length())
      store.mutate(JSONObject().put("action", "deletePlaylist").put("id", playlist))
      assertNotNull(store.track("1"))
    }
  }

  @Test fun addingTwiceDoesNotDuplicatePlaylistTrack() {
    LocalMusicStore(context).use { store ->
      add(store)
      val playlist = mutate(store, """{"action":"createPlaylist","name":"One"}""").getString("id")
      repeat(2) { store.mutate(JSONObject().put("action", "addToPlaylist").put("id", "1").put("playlistId", playlist)) }
      assertEquals(1, store.library().getJSONArray("playlists").getJSONObject(0).getJSONArray("trackIds").length())
    }
  }
}
