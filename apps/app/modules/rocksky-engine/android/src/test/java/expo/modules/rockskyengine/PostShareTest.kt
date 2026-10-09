package expo.modules.rockskyengine

import android.content.Intent
import android.net.Uri
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostShareTest {
  private val context get() = RuntimeEnvironment.getApplication()
  @Test fun blueskyReceivesComposerIntentWithCardCaptionAndLinkTogether() {
    val uri = Uri.parse("content://${context.packageName}.postshare/post-cards/card.png")
    val caption = "Song — Artist\nhttps://rocksky.app/did/song/key"
    val intent = PostShare.intent(context, caption, "Song", uri, "Bluesky")
    assertEquals(Intent.ACTION_SEND, intent.action)
    assertEquals("xyz.blueskyweb.app", intent.`package`)
    assertEquals("image/png", intent.type)
    assertEquals(caption, intent.getStringExtra(Intent.EXTRA_TEXT))
    assertEquals(uri, intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java))
    assertEquals(uri, intent.clipData!!.getItemAt(0).uri)
    assertTrue(intent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
  }
  @Test fun genericShareKeepsTextAndImageWithoutRestrictingTheDestination() {
    val uri = Uri.parse("content://${context.packageName}.postshare/post-cards/card.png")
    val intent = PostShare.intent(context, "caption\nhttps://rocksky.app", "Rocksky", uri, null)
    assertNull(intent.`package`)
    assertEquals(Intent.ACTION_SEND, intent.action)
    assertTrue(intent.hasExtra(Intent.EXTRA_STREAM))
    assertTrue(intent.getStringExtra(Intent.EXTRA_TEXT)!!.contains("https://rocksky.app"))
  }
  @Test fun capturedImageSurvivesReleasingTheTemporaryViewShot() {
    val original = java.io.File.createTempFile("view-shot", ".png", context.cacheDir)
    val bytes = byteArrayOf(1, 2, 3, 4)
    original.writeBytes(bytes)
    val shared = PostShare.cacheCard(context, Uri.fromFile(original).toString())
    original.delete()
    assertTrue(shared.isFile)
    assertArrayEquals(bytes, shared.readBytes())
    assertTrue(shared.parentFile!!.name == "rocksky-share")
    shared.delete()
  }
  @Test(expected = IllegalArgumentException::class)
  fun arbitraryPrivateFilesCannotBeSharedAsCards() {
    val file = java.io.File(context.filesDir, "private-token").apply { writeText("private") }
    try { PostShare.cacheCard(context, Uri.fromFile(file).toString()) }
    finally { file.delete() }
  }
  @Test fun textOnlySharesStillOpenComposerWithTheLink() {
    for (target in listOf("Bluesky", "X", "Facebook")) {
      val intent = PostShare.intent(context, "Song\nhttps://rocksky.app", "Song", null, target)
      assertEquals(Intent.ACTION_SEND, intent.action)
      assertEquals("text/plain", intent.type)
      assertFalse(intent.hasExtra(Intent.EXTRA_STREAM))
      assertNotNull(intent.`package`)
    }
  }
}
