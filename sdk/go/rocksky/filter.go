package rocksky

// Fluent builder for RSQL filter expressions, accepted by the `filter`
// parameter of the catalog and scrobble-feed queries
// (app.rocksky.song.getSongs, app.rocksky.artist.getArtists,
// app.rocksky.album.getAlbums, app.rocksky.scrobble.getScrobbles).
//
//	f := rocksky.Eq("artist", "Daft Punk").
//		And(rocksky.Gt("duration", 200000)).
//		Or(rocksky.In("genre", "house", "electro"))
//	songs, _ := client.CatalogSongs(ctx, 50, 0, "", f.Build())
//	// artist=="Daft Punk";duration=gt=200000,genre=in=(house,electro)
//
// String values are quoted and escaped automatically when they contain
// characters RSQL reserves; `*` wildcards pass through unquoted so
// Eq("artist", "Daft*") performs a case-insensitive match.

import (
	"fmt"
	"strconv"
	"strings"
)

// Expression node kinds. AND-combining parenthesizes an operand iff it is an
// OR node, preserving RSQL precedence (';' binds tighter than ',').
type filterKind int

const (
	kindComparison filterKind = iota
	kindAnd
	kindOr
)

// Filter is an immutable RSQL filter expression. Build one with the
// comparison constructors ([Eq], [Ne], [Gt], [Ge], [Lt], [Le], [In], [Out],
// [IsNull], [IsNotNull]) and chain with [Filter.And] / [Filter.Or].
type Filter struct {
	expr string
	kind filterKind
}

// isFilterValueSafe reports whether every char is in [A-Za-z0-9_.:@*+-]
// (the RSQL-safe set; `*` kept bare so wildcards work).
func isFilterValueSafe(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9':
		case c == '_', c == '.', c == ':', c == '@', c == '*', c == '+', c == '-':
		default:
			return false
		}
	}
	return true
}

func quoteFilterValue(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		default:
			b.WriteByte(s[i])
		}
	}
	b.WriteByte('"')
	return b.String()
}

// renderFilterValue renders a value for an RSQL expression: numbers and
// booleans bare; strings bare iff non-empty and made only of safe chars,
// otherwise double-quoted with backslash/quote escaping.
func renderFilterValue(v any) string {
	switch x := v.(type) {
	case string:
		return renderFilterString(x)
	case bool:
		return strconv.FormatBool(x)
	case int:
		return strconv.FormatInt(int64(x), 10)
	case int8:
		return strconv.FormatInt(int64(x), 10)
	case int16:
		return strconv.FormatInt(int64(x), 10)
	case int32:
		return strconv.FormatInt(int64(x), 10)
	case int64:
		return strconv.FormatInt(x, 10)
	case uint:
		return strconv.FormatUint(uint64(x), 10)
	case uint8:
		return strconv.FormatUint(uint64(x), 10)
	case uint16:
		return strconv.FormatUint(uint64(x), 10)
	case uint32:
		return strconv.FormatUint(uint64(x), 10)
	case uint64:
		return strconv.FormatUint(x, 10)
	case float32:
		return strconv.FormatFloat(float64(x), 'f', -1, 32)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return renderFilterString(fmt.Sprint(v))
	}
}

func renderFilterString(s string) string {
	if len(s) > 0 && isFilterValueSafe(s) {
		return s
	}
	return quoteFilterValue(s)
}

func comparison(field, op string, value any) Filter {
	return Filter{expr: field + op + renderFilterValue(value), kind: kindComparison}
}

func list(name, field, op string, values []any) Filter {
	if len(values) == 0 {
		panic("rocksky: " + name + "(\"" + field + "\", ...) needs at least one value")
	}
	rendered := make([]string, len(values))
	for i, v := range values {
		rendered[i] = renderFilterValue(v)
	}
	return Filter{expr: field + op + "(" + strings.Join(rendered, ",") + ")", kind: kindComparison}
}

// Eq is `field==value` — equals; `*` in string values is a wildcard.
func Eq(field string, value any) Filter { return comparison(field, "==", value) }

// Ne is `field!=value` — not equals.
func Ne(field string, value any) Filter { return comparison(field, "!=", value) }

// Gt is `field=gt=value` — greater than.
func Gt(field string, value any) Filter { return comparison(field, "=gt=", value) }

// Ge is `field=ge=value` — greater than or equal.
func Ge(field string, value any) Filter { return comparison(field, "=ge=", value) }

// Lt is `field=lt=value` — less than.
func Lt(field string, value any) Filter { return comparison(field, "=lt=", value) }

// Le is `field=le=value` — less than or equal.
func Le(field string, value any) Filter { return comparison(field, "=le=", value) }

// In is `field=in=(a,b)` — matches any of the values. Panics if values is empty.
func In(field string, values ...any) Filter { return list("In", field, "=in=", values) }

// Out is `field=out=(a,b)` — matches none of the values. Panics if values is empty.
func Out(field string, values ...any) Filter { return list("Out", field, "=out=", values) }

// IsNull is `field==null` — the field is NULL.
func IsNull(field string) Filter { return Filter{expr: field + "==null", kind: kindComparison} }

// IsNotNull is `field!=null` — the field is not NULL.
func IsNotNull(field string) Filter { return Filter{expr: field + "!=null", kind: kindComparison} }

// renderInAnd parenthesizes an OR operand so RSQL precedence is preserved.
func (f Filter) renderInAnd() string {
	if f.kind == kindOr {
		return "(" + f.expr + ")"
	}
	return f.expr
}

// And requires both sides to match (`;`). An OR operand is parenthesized to
// keep RSQL precedence.
func (f Filter) And(other Filter) Filter {
	return Filter{expr: f.renderInAnd() + ";" + other.renderInAnd(), kind: kindAnd}
}

// Or lets either side match (`,`).
func (f Filter) Or(other Filter) Filter {
	return Filter{expr: f.expr + "," + other.expr, kind: kindOr}
}

// Build returns the RSQL expression string to send as the `filter` query param.
func (f Filter) Build() string { return f.expr }

// String returns the RSQL expression string.
func (f Filter) String() string { return f.expr }
