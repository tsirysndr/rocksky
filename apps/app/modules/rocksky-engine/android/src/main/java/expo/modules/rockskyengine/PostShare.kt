package expo.modules.rockskyengine

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.util.UUID

class PostShareFileProvider : FileProvider()

/** ACTION_SEND opens the receiving app's composer, not its launcher/deep-link
 * home screen. Text and attachment travel together in the same intent. */
object PostShare {
  private val packages = mapOf("Bluesky" to "xyz.blueskyweb.app", "X" to "com.twitter.android", "Facebook" to "com.facebook.katana")

  fun intent(context: Context, text: String, title: String, image: Uri?, target: String?): Intent {
    require(text.isNotBlank()) { "Share text is empty" }
    return Intent(Intent.ACTION_SEND).apply {
      type = if (image == null) "text/plain" else "image/png"
      putExtra(Intent.EXTRA_TEXT, text)
      putExtra(Intent.EXTRA_SUBJECT, title)
      putExtra(Intent.EXTRA_TITLE, title)
      if (target != null) setPackage(requireNotNull(packages[target]) { "Unsupported share destination" })
      if (image != null) {
        putExtra(Intent.EXTRA_STREAM, image)
        clipData = ClipData.newUri(context.contentResolver, "Rocksky card", image)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    }
  }

  internal fun cacheCard(context: Context, value: String): File {
    val uri = Uri.parse(value)
    require(uri.scheme == "file") { "Invalid card file" }
    val source = File(requireNotNull(uri.path)).canonicalFile
    val roots = listOfNotNull(context.cacheDir, context.externalCacheDir).map { it.canonicalFile.path + File.separator }
    require(roots.any { source.path.startsWith(it) } && source.isFile && source.length() <= 20 * 1024 * 1024) { "Card file is unavailable" }
    val directory = File(context.cacheDir, "rocksky-share").apply { mkdirs() }
    // The composer reads asynchronously, after startActivity returns. Keep an
    // independent copy instead of revoking/deleting the view-shot immediately.
    val old = directory.listFiles().orEmpty().filter { it.isFile }.sortedByDescending { it.lastModified() }
    old.forEachIndexed { index, file ->
      if (index >= 31 || System.currentTimeMillis() - file.lastModified() > 48 * 60 * 60 * 1000L) file.delete()
    }
    val copy = File(directory, "rocksky-${UUID.randomUUID()}.png")
    source.copyTo(copy)
    return copy
  }

  fun share(activity: Activity, input: JSONObject): Boolean {
    val image = input.optString("imageUri").takeIf { it.isNotBlank() }?.let {
      FileProvider.getUriForFile(activity, "${activity.packageName}.postshare", cacheCard(activity, it))
    }
    val target = input.optString("target").takeIf { it.isNotBlank() }
    val send = intent(activity, input.getString("text"), input.getString("title"), image, target)
    return try {
      activity.startActivity(if (target != null) send else Intent.createChooser(send, "Share post").apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = send.clipData
      })
      true
    } catch (_: ActivityNotFoundException) { false }
  }
}
