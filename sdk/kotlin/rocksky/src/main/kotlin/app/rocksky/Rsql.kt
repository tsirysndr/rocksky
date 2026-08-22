package app.rocksky

/**
 * Fluent builder for RSQL filter expressions, accepted by the `filter`
 * parameter of the catalog and scrobble-feed queries
 * ([AppView] `catalogSongs`, `catalogArtists`, `catalogAlbums`, `scrobbleFeed`).
 *
 * ```kotlin
 * import app.rocksky.Filter
 *
 * val filter = Filter.eq("artist", "Daft Punk")
 *     .and(Filter.gt("duration", 200_000))
 *     .or(Filter.isIn("genre", listOf("house", "electro")))
 *
 * av.catalogSongs(50u, 0u, null, filter.build())
 * // artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)
 * ```
 *
 * String values are quoted and escaped automatically when they contain
 * characters RSQL reserves; `*` wildcards pass through unquoted so
 * `Filter.eq("artist", "Daft*")` performs a case-insensitive match.
 *
 * Filterable fields per endpoint:
 * - **songs** (`catalogSongs`): `title`, `artist`, `album`, `albumArtist`,
 *   `genre`, `composer`, `label`, `duration`, `trackNumber`, `discNumber`,
 *   `mbId`, `isrc`, `sha256`, `uri`, `albumUri`, `artistUri`, `createdAt`
 * - **albums** (`catalogAlbums`): `title`, `artist`, `year`, `releaseDate`,
 *   `sha256`, `uri`, `artistUri`, `createdAt`
 * - **artists** (`catalogArtists`): `name`, `genres`, `bornIn`, `born`,
 *   `died`, `sha256`, `uri`, `createdAt`
 * - **scrobbles** (`scrobbleFeed`): `uri`, `date`, `timestamp`, `title`,
 *   `artist`, `album`, dotted selectors into the joined records —
 *   `track.*` (e.g. `track.title`, `track.artist`, `track.album`,
 *   `track.albumArtist`, `track.genre`, `track.duration`, `track.isrc`,
 *   `track.mbId`), `user.did`, `user.handle`, `user.displayName`,
 *   `artist.name`, `artist.genres`
 */
class Filter private constructor(private val expr: String, private val kind: Kind) {

    private enum class Kind { COMPARISON, AND, OR }

    companion object {
        /** Characters that never need quoting in an RSQL value (`*` kept bare so wildcards work). */
        private val SAFE_VALUE = Regex("^[A-Za-z0-9_.:@*+-]+$")

        private fun renderValue(value: Any): String = when (value) {
            is Boolean -> value.toString()
            is Double -> renderDouble(value)
            is Float -> renderDouble(value.toDouble())
            is Number -> value.toString()
            is String -> renderString(value)
            else -> renderString(value.toString())
        }

        private fun renderDouble(value: Double): String =
            if (value.isFinite() && value == Math.floor(value) &&
                value >= Long.MIN_VALUE.toDouble() && value <= Long.MAX_VALUE.toDouble()
            ) {
                value.toLong().toString()
            } else {
                value.toString()
            }

        private fun renderString(value: String): String {
            if (value.isNotEmpty() && SAFE_VALUE.matches(value)) return value
            val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
            return "\"$escaped\""
        }

        private fun comparison(field: String, op: String, value: Any): Filter =
            Filter("$field$op${renderValue(value)}", Kind.COMPARISON)

        private fun list(name: String, field: String, op: String, values: List<Any>): Filter {
            if (values.isEmpty()) {
                throw IllegalArgumentException("Filter.$name(\"$field\", ...) needs at least one value")
            }
            return Filter("$field$op(${values.joinToString(",") { renderValue(it) }})", Kind.COMPARISON)
        }

        /** `field==value` — equals; `*` in string values is a wildcard. */
        fun eq(field: String, value: Any): Filter = comparison(field, "==", value)

        /** `field!=value` — not equals. */
        fun ne(field: String, value: Any): Filter = comparison(field, "!=", value)

        /** `field=gt=value` — greater than. */
        fun gt(field: String, value: Any): Filter = comparison(field, "=gt=", value)

        /** `field=ge=value` — greater than or equal. */
        fun ge(field: String, value: Any): Filter = comparison(field, "=ge=", value)

        /** `field=lt=value` — less than. */
        fun lt(field: String, value: Any): Filter = comparison(field, "=lt=", value)

        /** `field=le=value` — less than or equal. */
        fun le(field: String, value: Any): Filter = comparison(field, "=le=", value)

        /** `field=in=(a,b)` — matches any of the values. */
        fun isIn(field: String, values: List<Any>): Filter = list("isIn", field, "=in=", values)

        /** `field=out=(a,b)` — matches none of the values. */
        fun isOut(field: String, values: List<Any>): Filter = list("isOut", field, "=out=", values)

        /** `field==null` — the field is NULL. */
        fun isNull(field: String): Filter = Filter("$field==null", Kind.COMPARISON)

        /** `field!=null` — the field is not NULL. */
        fun isNotNull(field: String): Filter = Filter("$field!=null", Kind.COMPARISON)
    }

    /** Both sides must match (`;`). An `or` operand is parenthesized to keep RSQL precedence. */
    infix fun and(other: Filter): Filter =
        Filter("${renderInAnd()};${other.renderInAnd()}", Kind.AND)

    /** Either side may match (`,`). */
    infix fun or(other: Filter): Filter =
        Filter("$expr,${other.expr}", Kind.OR)

    private fun renderInAnd(): String = if (kind == Kind.OR) "($expr)" else expr

    /** The RSQL expression string to send as the `filter` query param. */
    fun build(): String = expr

    override fun toString(): String = expr
}
