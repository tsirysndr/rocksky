package expo.modules.rockskyscrobbler

import org.junit.Assert.*
import org.junit.Test

class ScrobbleIdentityTest {
  @Test fun `same listen across metadata formatting gets one identity`() {
    assertEquals(ScrobbleIdentity.key("did:one", "  Sweet   Child O’ Mine ", "GUNS N’ ROSES", 100),
      ScrobbleIdentity.key("did:one", "sweet child o' mine", "Guns N' Roses", 100))
  }
  @Test fun `repeated track at a different time is not a duplicate`() {
    assertNotEquals(ScrobbleIdentity.key("did:one", "Song", "Artist", 100),
      ScrobbleIdentity.key("did:one", "Song", "Artist", 400))
  }
  @Test fun `accounts and artists cannot collide`() {
    val first = ScrobbleIdentity.key("did:one", "Song", "Artist", 100)
    assertNotEquals(first, ScrobbleIdentity.key("did:two", "Song", "Artist", 100))
    assertNotEquals(first, ScrobbleIdentity.key("did:one", "Song", "Someone else", 100))
  }
  @Test fun `field boundaries cannot collide`() {
    assertNotEquals(ScrobbleIdentity.key("did:one", "ab", "c", 100), ScrobbleIdentity.key("did:one", "a", "bc", 100))
  }
}
