package expo.modules.rockskyscrobbler

import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

/** Source and album are deliberately excluded: two players may report the same
 * listen, one with richer album metadata than the other. Replays at new times
 * retain distinct identities. */
object ScrobbleIdentity {
  private fun normalize(text: String) = Normalizer.normalize(text, Normalizer.Form.NFKC)
    .replace('’', '\'').trim().replace(Regex("\\s+"), " ").lowercase(Locale.ROOT)

  fun key(did: String, title: String, artist: String, timestamp: Long): String {
    val parts = listOf(did, normalize(title), normalize(artist), timestamp.toString())
    val canonical = parts.joinToString("") { "${it.length}:$it" }
    return MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }
}
