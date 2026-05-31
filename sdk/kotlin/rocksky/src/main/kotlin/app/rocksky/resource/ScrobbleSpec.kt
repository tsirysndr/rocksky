package app.rocksky.resource

import kotlinx.serialization.json.JsonElement

/**
 * Mutable spec for creating a scrobble. Works as both a Kotlin DSL and a fluent (Java-style)
 * builder — every property has a matching `name(value)` setter that returns `this`.
 *
 * ```kotlin
 * // DSL
 * client.scrobble.create {
 *     title = "Idioteque"; artist = "Radiohead"; duration = 369
 * }
 *
 * // Fluent
 * client.scrobble.builder()
 *     .title("Idioteque").artist("Radiohead").duration(369L)
 *     .send()
 * ```
 *
 * `title` and `artist` are required — calling [send] without them throws [IllegalStateException].
 */
@RockskyDsl
public class ScrobbleSpec internal constructor(private val resource: ScrobbleResource) {
    public var title: String? = null
    public var artist: String? = null
    public var album: String? = null
    public var duration: Long? = null
    public var mbId: String? = null
    public var isrc: String? = null
    public var albumArt: String? = null
    public var trackNumber: Int? = null
    public var releaseDate: String? = null
    public var year: Int? = null
    public var discNumber: Int? = null
    public var lyrics: String? = null
    public var composer: String? = null
    public var copyrightMessage: String? = null
    public var label: String? = null
    public var artistPicture: String? = null
    public var spotifyLink: String? = null
    public var lastfmLink: String? = null
    public var tidalLink: String? = null
    public var appleMusicLink: String? = null
    public var youtubeLink: String? = null
    public var deezerLink: String? = null
    public var timestamp: Long? = null

    public fun title(value: String): ScrobbleSpec = apply { title = value }
    public fun artist(value: String): ScrobbleSpec = apply { artist = value }
    public fun album(value: String?): ScrobbleSpec = apply { album = value }
    public fun duration(value: Long?): ScrobbleSpec = apply { duration = value }
    public fun mbId(value: String?): ScrobbleSpec = apply { mbId = value }
    public fun isrc(value: String?): ScrobbleSpec = apply { isrc = value }
    public fun albumArt(value: String?): ScrobbleSpec = apply { albumArt = value }
    public fun trackNumber(value: Int?): ScrobbleSpec = apply { trackNumber = value }
    public fun releaseDate(value: String?): ScrobbleSpec = apply { releaseDate = value }
    public fun year(value: Int?): ScrobbleSpec = apply { year = value }
    public fun discNumber(value: Int?): ScrobbleSpec = apply { discNumber = value }
    public fun lyrics(value: String?): ScrobbleSpec = apply { lyrics = value }
    public fun composer(value: String?): ScrobbleSpec = apply { composer = value }
    public fun copyrightMessage(value: String?): ScrobbleSpec = apply { copyrightMessage = value }
    public fun label(value: String?): ScrobbleSpec = apply { label = value }
    public fun artistPicture(value: String?): ScrobbleSpec = apply { artistPicture = value }
    public fun spotifyLink(value: String?): ScrobbleSpec = apply { spotifyLink = value }
    public fun lastfmLink(value: String?): ScrobbleSpec = apply { lastfmLink = value }
    public fun tidalLink(value: String?): ScrobbleSpec = apply { tidalLink = value }
    public fun appleMusicLink(value: String?): ScrobbleSpec = apply { appleMusicLink = value }
    public fun youtubeLink(value: String?): ScrobbleSpec = apply { youtubeLink = value }
    public fun deezerLink(value: String?): ScrobbleSpec = apply { deezerLink = value }
    public fun timestamp(value: Long?): ScrobbleSpec = apply { timestamp = value }

    /** Submit the scrobble. Requires auth. */
    public suspend fun send(): JsonElement {
        val t = title ?: error("title is required")
        val a = artist ?: error("artist is required")
        return resource.create(
            title = t,
            artist = a,
            album = album,
            duration = duration,
            mbId = mbId,
            isrc = isrc,
            albumArt = albumArt,
            trackNumber = trackNumber,
            releaseDate = releaseDate,
            year = year,
            discNumber = discNumber,
            lyrics = lyrics,
            composer = composer,
            copyrightMessage = copyrightMessage,
            label = label,
            artistPicture = artistPicture,
            spotifyLink = spotifyLink,
            lastfmLink = lastfmLink,
            tidalLink = tidalLink,
            appleMusicLink = appleMusicLink,
            youtubeLink = youtubeLink,
            deezerLink = deezerLink,
            timestamp = timestamp,
        )
    }
}
