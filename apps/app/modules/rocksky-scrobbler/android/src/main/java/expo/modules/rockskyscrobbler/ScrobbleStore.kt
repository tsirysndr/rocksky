package expo.modules.rockskyscrobbler

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class ScrobbleSettings(
  val enabled: Boolean = true,
  val mode: String = "listened",
  val seconds: Int = 240,
  val percent: Int = 50,
  val minimum: Int = 30,
  val recognize: Boolean = true,
  val blocked: Set<String> = ScrobbleSources.excluded,
)

object ScrobbleStore {
  // Protects credential encryption and account changes. Never hold this during
  // network I/O: the notification listener must not block on uploads.
  val authLock = Any()
  fun prefs(c: Context) = c.getSharedPreferences("rocksky_scrobbler", Context.MODE_PRIVATE)
  fun settings(c: Context): ScrobbleSettings = prefs(c).let {
    ScrobbleSettings(it.getBoolean("enabled", true), it.getString("mode", "listened")!!,
      it.getInt("seconds", 240), it.getInt("percent", 50), it.getInt("minimum", 30),
      it.getBoolean("recognize", true), it.getStringSet("blocked", emptySet())!!.toSet() + ScrobbleSources.excluded)
  }
  fun configure(c: Context, json: String) {
    val j = JSONObject(json)
    val mode = j.getString("mode")
    require(mode == "listened" || mode == "position") { "Invalid timing mode" }
    val seconds = j.getInt("seconds")
    val percent = j.getInt("percent")
    val minimum = j.getInt("minimum")
    require(seconds in 1..3600 && percent in 1..100 && minimum in 0..600) { "Invalid timing values" }
    val a = j.getJSONArray("blocked")
    check(prefs(c).edit().putBoolean("enabled", j.getBoolean("enabled"))
      .putString("mode", mode).putInt("seconds", seconds).putInt("percent", percent)
      .putInt("minimum", minimum).putBoolean("recognize", j.getBoolean("recognize"))
      .putStringSet("blocked", (0 until a.length()).map { a.getString(it) }.toSet()).commit())
  }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("rocksky.scrobbler.auth", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("rocksky.scrobbler.auth", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }

  fun setAuth(c: Context, token: String?, did: String?, endpoint: String) = synchronized(authLock) {
    require(java.net.URI(endpoint).scheme == "https") { "Scrobbling requires HTTPS" }
    if (token.isNullOrBlank() || did.isNullOrBlank()) {
      check(prefs(c).edit().remove("credentials").remove("authError").commit())
    } else {
      val plain = JSONObject().put("token", token).put("did", did).put("endpoint", endpoint).toString()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
      val data = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
      check(prefs(c).edit().putString("credentials", Base64.encodeToString(cipher.iv + data, Base64.NO_WRAP))
        .remove("authError").commit())
    }
  }

  fun auth(c: Context): JSONObject? = synchronized(authLock) {
    val encrypted = prefs(c).getString("credentials", null) ?: return@synchronized null
    try {
      val bytes = Base64.decode(encrypted, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      }
      JSONObject(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    } catch (_: Exception) {
      prefs(c).edit().putString("authError", "Sign in again to resume scrobbling.").apply()
      null
    }
  }

  @Volatile private var helper: QueueDb? = null
  fun db(c: Context): SQLiteDatabase = (helper ?: synchronized(this) {
    helper ?: QueueDb(c.applicationContext).also { helper = it }
  }).writableDatabase

  fun enqueue(c: Context, did: String, source: String, track: JSONObject) {
    if (source in ScrobbleSources.excluded) return
    val identity = ScrobbleIdentity.key(did, track.getString("title"), track.getString("artist"), track.getLong("timestamp"))
    val db = db(c)
    db.beginTransaction()
    try {
      // Retain receipts after upload. Queue deletion must not erase dedup state.
      val inserted = db.insertWithOnConflict("receipts", null, ContentValues().apply {
        put("id", identity)
      }, SQLiteDatabase.CONFLICT_IGNORE)
      if (inserted != -1L) db.insertOrThrow("queue", null, ContentValues().apply {
        put("id", identity); put("did", did); put("source", source); put("payload", track.toString())
        put("created", System.currentTimeMillis())
      })
      db.setTransactionSuccessful()
    } finally { db.endTransaction() }
  }

  private val eligibleSource = "source NOT IN (${ScrobbleSources.excluded.joinToString(",") { "?" }})"
  private fun queueArgs(did: String) = arrayOf(did, *ScrobbleSources.excluded.toTypedArray())

  // Apply exclusions to existing offline rows too, without deleting history.
  fun nextQueued(c: Context, did: String): Pair<String, String>? = db(c).rawQuery(
    "SELECT id,payload FROM queue WHERE did=? AND failed=0 AND $eligibleSource ORDER BY created LIMIT 1",
    queueArgs(did)
  ).use { if (it.moveToFirst()) it.getString(0) to it.getString(1) else null }

  fun counts(c: Context, did: String?): Pair<Int, Int> {
    if (did == null) return 0 to 0
    return db(c).rawQuery("SELECT COUNT(*), COALESCE(SUM(failed),0) FROM queue WHERE did=? AND $eligibleSource", queueArgs(did)).use {
      it.moveToFirst(); it.getInt(0) to it.getInt(1)
    }
  }

  private class QueueDb(c: Context) : SQLiteOpenHelper(c,
    java.io.File(c.noBackupFilesDir, "scrobbles.db").absolutePath, null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE queue (id TEXT PRIMARY KEY, did TEXT NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, failed INTEGER NOT NULL DEFAULT 0)")
      db.execSQL("CREATE INDEX queue_account ON queue(did,failed,created)")
      db.execSQL("CREATE TABLE playback (id TEXT PRIMARY KEY, state TEXT NOT NULL)")
      db.execSQL("CREATE TABLE recognitions (id TEXT PRIMARY KEY, seen INTEGER NOT NULL)")
      db.execSQL("CREATE TABLE receipts (id TEXT PRIMARY KEY)")
    }
    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
      if (old < 2) db.execSQL("CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY)")
    }
  }
}
