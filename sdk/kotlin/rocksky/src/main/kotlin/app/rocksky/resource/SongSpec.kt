package app.rocksky.resource

import kotlinx.serialization.json.JsonElement

/**
 * Mutable spec for creating a song record. Dual Kotlin-DSL / Java-fluent style — see
 * [ScrobbleSpec] for examples. `title`, `artist`, `album`, and `albumArtist` are required.
 */
@RockskyDsl
public class SongSpec internal constructor(private val resource: SongResource) {
    public var title: String? = null
    public var artist: String? = null
    public var album: String? = null
    public var albumArtist: String? = null
    public var duration: Long? = null
    public var mbId: String? = null
    public var isrc: String? = null
    public var albumArt: String? = null
    public var trackNumber: Int? = null
    public var releaseDate: String? = null
    public var year: Int? = null
    public var discNumber: Int? = null
    public var lyrics: String? = null

    public fun title(value: String): SongSpec = apply { title = value }
    public fun artist(value: String): SongSpec = apply { artist = value }
    public fun album(value: String): SongSpec = apply { album = value }
    public fun albumArtist(value: String): SongSpec = apply { albumArtist = value }
    public fun duration(value: Long?): SongSpec = apply { duration = value }
    public fun mbId(value: String?): SongSpec = apply { mbId = value }
    public fun isrc(value: String?): SongSpec = apply { isrc = value }
    public fun albumArt(value: String?): SongSpec = apply { albumArt = value }
    public fun trackNumber(value: Int?): SongSpec = apply { trackNumber = value }
    public fun releaseDate(value: String?): SongSpec = apply { releaseDate = value }
    public fun year(value: Int?): SongSpec = apply { year = value }
    public fun discNumber(value: Int?): SongSpec = apply { discNumber = value }
    public fun lyrics(value: String?): SongSpec = apply { lyrics = value }

    public suspend fun send(): JsonElement {
        val t = title ?: error("title is required")
        val a = artist ?: error("artist is required")
        val al = album ?: error("album is required")
        val aa = albumArtist ?: error("albumArtist is required")
        return resource.create(
            title = t,
            artist = a,
            album = al,
            albumArtist = aa,
            duration = duration,
            mbId = mbId,
            isrc = isrc,
            albumArt = albumArt,
            trackNumber = trackNumber,
            releaseDate = releaseDate,
            year = year,
            discNumber = discNumber,
            lyrics = lyrics,
        )
    }
}
