package expo.modules.rockskyengine

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Device-only data: editing tags never changes the user's original audio. */
class LocalMusicStore(context: Context) : SQLiteOpenHelper(context, "local-music.db", null, 1) {
  override fun onConfigure(db: SQLiteDatabase) { db.setForeignKeyConstraintsEnabled(true) }
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE tracks (id TEXT PRIMARY KEY, uri TEXT NOT NULL, path TEXT NOT NULL, filename TEXT NOT NULL, stamp TEXT NOT NULL, metadata TEXT NOT NULL, edits TEXT NOT NULL DEFAULT '{}', favorite INTEGER NOT NULL DEFAULT 0, seen TEXT NOT NULL)")
    db.execSQL("CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
    db.execSQL("CREATE TABLE playlist_tracks (playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE, track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE, position INTEGER NOT NULL, PRIMARY KEY(playlist_id, track_id))")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  fun track(id: String): JSONObject? = readableDatabase.rawQuery("SELECT * FROM tracks WHERE id=?", arrayOf(id)).use { c ->
    if (!c.moveToFirst()) null else {
      fun text(key: String) = c.getString(c.getColumnIndexOrThrow(key))
      val metadata = JSONObject(text("metadata"))
      val edits = JSONObject(text("edits"))
      edits.keys().forEach { key -> metadata.put(key, edits.get(key)) }
      metadata.put("id", id).put("uri", text("uri")).put("path", text("path"))
        .put("filename", text("filename")).put("stamp", text("stamp"))
        .put("favorite", c.getInt(c.getColumnIndexOrThrow("favorite")) != 0)
        .put("edited", edits.length() > 0)
    }
  }

  fun library(): JSONObject {
    val tracks = JSONArray()
    readableDatabase.rawQuery("SELECT id FROM tracks ORDER BY filename COLLATE NOCASE", null).use { c ->
      while (c.moveToNext()) track(c.getString(0))?.let { tracks.put(it) }
    }
    val playlists = JSONArray()
    readableDatabase.rawQuery("SELECT id,name FROM playlists ORDER BY name COLLATE NOCASE", null).use { c ->
      while (c.moveToNext()) {
        val ids = JSONArray()
        readableDatabase.rawQuery("SELECT track_id FROM playlist_tracks WHERE playlist_id=? ORDER BY position", arrayOf(c.getString(0))).use { p ->
          while (p.moveToNext()) ids.put(p.getString(0))
        }
        playlists.put(JSONObject().put("id", c.getString(0)).put("name", c.getString(1)).put("trackIds", ids))
      }
    }
    return JSONObject().put("tracks", tracks).put("playlists", playlists)
  }

  fun upsert(id: String, uri: String, path: String, filename: String, stamp: String, metadata: JSONObject, seen: String) {
    val values = ContentValues().apply {
      put("id", id); put("uri", uri); put("path", path); put("filename", filename)
      put("stamp", stamp); put("metadata", metadata.toString()); put("seen", seen)
    }
    // Never REPLACE: it deletes favorites, overrides and playlist memberships.
    if (writableDatabase.update("tracks", values, "id=?", arrayOf(id)) == 0) writableDatabase.insertOrThrow("tracks", null, values)
  }

  fun markSeen(id: String, scan: String) {
    writableDatabase.execSQL("UPDATE tracks SET seen=? WHERE id=?", arrayOf(scan, id))
  }
  fun finishScan(scan: String) { writableDatabase.delete("tracks", "seen<>?", arrayOf(scan)) }

  fun mutate(input: JSONObject): JSONObject {
    val id = input.optString("id")
    val db = writableDatabase
    when (input.getString("action")) {
      "edit" -> {
        require(track(id) != null) { "Track is no longer available" }
        val allowed = setOf("title", "artist", "album", "albumArtist", "genre", "year", "trackNumber", "discNumber", "mbId", "albumArt")
        val edits = input.getJSONObject("metadata")
        require(edits.keys().asSequence().all { it in allowed }) { "Unsupported metadata field" }
        val previous = db.rawQuery("SELECT edits FROM tracks WHERE id=?", arrayOf(id)).use { c -> c.moveToFirst(); JSONObject(c.getString(0)) }
        edits.keys().forEach { key -> previous.put(key, edits.get(key)) }
        db.execSQL("UPDATE tracks SET edits=? WHERE id=?", arrayOf(previous.toString(), id))
      }
      "favorite" -> db.execSQL("UPDATE tracks SET favorite=? WHERE id=?", arrayOf(if (input.getBoolean("favorite")) 1 else 0, id))
      "createPlaylist" -> {
        val name = input.getString("name").trim()
        require(name.isNotEmpty()) { "Enter a playlist name" }
        val playlistId = UUID.randomUUID().toString()
        db.execSQL("INSERT INTO playlists(id,name) VALUES(?,?)", arrayOf(playlistId, name))
        return JSONObject().put("id", playlistId)
      }
      "renamePlaylist" -> {
        val name = input.getString("name").trim()
        require(name.isNotEmpty()) { "Enter a playlist name" }
        db.execSQL("UPDATE playlists SET name=? WHERE id=?", arrayOf(name, id))
      }
      "deletePlaylist" -> db.delete("playlists", "id=?", arrayOf(id))
      "addToPlaylist" -> db.execSQL("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) SELECT ?,?,COALESCE(MAX(position),-1)+1 FROM playlist_tracks WHERE playlist_id=?", arrayOf(input.getString("playlistId"), id, input.getString("playlistId")))
      "removeFromPlaylist" -> db.delete("playlist_tracks", "playlist_id=? AND track_id=?", arrayOf(input.getString("playlistId"), id))
      else -> error("Unknown local library action")
    }
    return JSONObject().put("ok", true)
  }
}
