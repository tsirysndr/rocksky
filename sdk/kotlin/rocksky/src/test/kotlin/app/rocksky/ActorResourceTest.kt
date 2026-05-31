package app.rocksky

import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ActorResourceTest {

    @Test
    fun `getProfile by did sends did param and parses payload`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.actor.getProfile" to MockedResponse(
                    """{"id":"abc","did":"did:plc:foo","handle":"foo.test","displayName":"Foo"}""",
                ),
            ),
        )

        val profile = tc.client.actor.getProfile(did = "did:plc:foo")

        assertEquals("abc", profile.id)
        assertEquals("foo.test", profile.handle)
        assertEquals("Foo", profile.displayName)
        val req = tc.recorded.single()
        assertEquals("GET", req.httpMethod)
        assertEquals(listOf("did:plc:foo"), req.query["did"])
        assertNull(req.authHeader, "did-based getProfile should not send auth header")
        tc.close()
    }

    @Test
    fun `getProfile without did requires auth`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.actor.getProfile" to MockedResponse("""{"did":"did:plc:me"}""")),
        )

        val profile = tc.client.actor.getProfile()

        assertEquals("did:plc:me", profile.did)
        assertEquals("Bearer test-token", tc.recorded.single().authHeader)
        tc.close()
    }

    @Test
    fun `getActorAlbums unwraps albums list`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.actor.getActorAlbums" to MockedResponse(
                    """{"albums":[{"id":"a1","title":"OK Computer"},{"id":"a2","title":"In Rainbows"}]}""",
                ),
            ),
        )

        val albums = tc.client.actor.getAlbums(did = "did:plc:foo", limit = 2)

        assertEquals(2, albums.size)
        assertEquals("OK Computer", albums[0].title)
        assertEquals(listOf("2"), tc.recorded.single().query["limit"])
        tc.close()
    }

    @Test
    fun `empty response yields default model`() = runTest {
        val tc = mockedClient(
            mapOf("app.rocksky.actor.getProfile" to MockedResponse("{}")),
        )

        val profile = tc.client.actor.getProfile(did = "did:plc:nope")

        assertNotNull(profile)
        assertNull(profile.handle)
        tc.close()
    }

    @Test
    fun `getLovedSongs falls back to songs key when lovedSongs missing`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.actor.getActorLovedSongs" to MockedResponse(
                    """{"songs":[{"id":"s1","title":"Idioteque"}]}""",
                ),
            ),
        )

        val songs = tc.client.actor.getLovedSongs(did = "did:plc:foo")

        assertEquals(1, songs.size)
        assertEquals("Idioteque", songs[0].title)
        tc.close()
    }

    @Test
    fun `getCompatibility requires auth and parses scores`() = runTest {
        val tc = mockedClient(
            mapOf(
                "app.rocksky.actor.getActorCompatibility" to MockedResponse(
                    """{"compatibilityLevel":4,"compatibilityPercentage":78,"sharedArtists":12}""",
                ),
            ),
        )

        val compat = tc.client.actor.getCompatibility(did = "did:plc:friend")

        assertEquals(4, compat.compatibilityLevel)
        assertEquals(78, compat.compatibilityPercentage)
        assertTrue(tc.recorded.single().authHeader?.startsWith("Bearer") == true)
        tc.close()
    }
}
