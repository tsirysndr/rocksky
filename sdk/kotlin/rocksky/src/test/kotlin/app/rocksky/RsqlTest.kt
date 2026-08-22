package app.rocksky

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RsqlTest {
    @Test fun eqBareString() {
        assertEquals("artist==Radiohead", Filter.eq("artist", "Radiohead").build())
    }

    @Test fun eqQuotedString() {
        assertEquals("artist==\"Daft Punk\"", Filter.eq("artist", "Daft Punk").build())
    }

    @Test fun eqEscapesEmbeddedQuotes() {
        assertEquals("title==\"He said \\\"hi\\\"\"", Filter.eq("title", "He said \"hi\"").build())
    }

    @Test fun eqWildcardStaysBare() {
        assertEquals("artist==Daft*", Filter.eq("artist", "Daft*").build())
    }

    @Test fun ne() {
        assertEquals("artist!=Eminem", Filter.ne("artist", "Eminem").build())
    }

    @Test fun gt() {
        assertEquals("duration=gt=200000", Filter.gt("duration", 200000).build())
    }

    @Test fun ge() {
        assertEquals("year=ge=2000", Filter.ge("year", 2000).build())
    }

    @Test fun lt() {
        assertEquals("trackNumber=lt=5", Filter.lt("trackNumber", 5).build())
    }

    @Test fun le() {
        assertEquals("year=le=1999", Filter.le("year", 1999).build())
    }

    @Test fun isIn() {
        assertEquals("genre=in=(house,electro)", Filter.isIn("genre", listOf("house", "electro")).build())
    }

    @Test fun isOutQuotesUnsafeValues() {
        assertEquals("genre=out=(\"hip hop\")", Filter.isOut("genre", listOf("hip hop")).build())
    }

    @Test fun isNull() {
        assertEquals("uri==null", Filter.isNull("uri").build())
    }

    @Test fun isNotNull() {
        assertEquals("uri!=null", Filter.isNotNull("uri").build())
    }

    @Test fun andJoinsWithSemicolon() {
        val a = Filter.eq("artist", "Radiohead")
        val b = Filter.gt("duration", 200000)
        assertEquals("artist==Radiohead;duration=gt=200000", a.and(b).build())
    }

    @Test fun orJoinsWithComma() {
        val a = Filter.eq("artist", "Radiohead")
        val b = Filter.eq("artist", "Muse")
        assertEquals("artist==Radiohead,artist==Muse", a.or(b).build())
    }

    @Test fun andParenthesizesOrLeftOperand() {
        val a = Filter.eq("artist", "Radiohead")
        val b = Filter.eq("artist", "Muse")
        val c = Filter.gt("duration", 200000)
        assertEquals("(artist==Radiohead,artist==Muse);duration=gt=200000", a.or(b).and(c).build())
    }

    @Test fun andParenthesizesOrRightOperand() {
        val a = Filter.eq("artist", "Radiohead")
        val b = Filter.eq("genre", "house")
        val c = Filter.eq("genre", "electro")
        assertEquals("artist==Radiohead;(genre==house,genre==electro)", a.and(b.or(c)).build())
    }

    @Test fun orNeverParenthesizes() {
        val a = Filter.eq("artist", "Radiohead")
        val b = Filter.gt("duration", 200000)
        val c = Filter.eq("genre", "house")
        assertEquals("artist==Radiohead;duration=gt=200000,genre==house", a.and(b).or(c).build())
    }

    @Test fun dottedFieldSelector() {
        assertEquals("track.artist==\"Daft Punk\"", Filter.eq("track.artist", "Daft Punk").build())
    }

    @Test fun booleanRendersBare() {
        assertEquals("liked==true", Filter.eq("liked", true).build())
    }

    @Test fun isInEmptyListThrows() {
        assertFailsWith<IllegalArgumentException> { Filter.isIn("genre", emptyList()) }
    }

    @Test fun isOutEmptyListThrows() {
        assertFailsWith<IllegalArgumentException> { Filter.isOut("genre", emptyList()) }
    }

    @Test fun toStringEqualsBuild() {
        val f = Filter.eq("artist", "Daft Punk").and(Filter.gt("duration", 200000))
        assertEquals(f.build(), f.toString())
    }
}
