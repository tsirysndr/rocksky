package deezer

import (
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

// diacriticsRemover strips combining marks so that "Beyoncé" and "Beyonce"
// compare equal.
var diacriticsRemover = transform.Chain(
	norm.NFD,
	runes.Remove(runes.In(unicode.Mn)),
	norm.NFC,
)

// titleNoiseSuffixes are common decorations we drop before comparing titles so
// that "Song - Radio Edit" and "Song" score as a strong match.
var titleNoiseSuffixes = []string{
	" - album version (edited)",
	" - album version (explicit)",
	" - album version",
	" - radio edit",
	" - single version",
	" - remastered",
	" - explicit",
	" - edited",
	" (album version)",
	" (radio edit)",
	" (explicit)",
	" (edited)",
}

// normalize lower-cases, strips diacritics, drops punctuation and collapses
// whitespace. It is the canonical form used for all string comparisons.
func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if out, _, err := transform.String(diacriticsRemover, s); err == nil {
		s = out
	}

	for _, suffix := range titleNoiseSuffixes {
		s = strings.TrimSuffix(s, suffix)
	}

	var b strings.Builder
	prevSpace := false
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsNumber(r):
			b.WriteRune(r)
			prevSpace = false
		case unicode.IsSpace(r):
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		default:
			// Treat punctuation as a word boundary.
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

// levenshtein returns the edit distance between two rune slices.
func levenshtein(a, b []rune) int {
	la, lb := len(a), len(b)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}

	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min3(curr[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

func min3(a, b, c int) int {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}

// similarity returns a normalized-edit-distance ratio in [0,1] between two
// already-normalized strings, with a bonus for one being a substring of the
// other (which happens a lot with "feat." credits and title decorations).
func similarity(a, b string) float64 {
	if a == "" && b == "" {
		return 1
	}
	if a == "" || b == "" {
		return 0
	}
	if a == b {
		return 1
	}

	ra, rb := []rune(a), []rune(b)
	dist := levenshtein(ra, rb)
	longest := len(ra)
	if len(rb) > longest {
		longest = len(rb)
	}
	ratio := 1 - float64(dist)/float64(longest)

	// Substring containment is a strong signal that edit distance underrates.
	if strings.Contains(a, b) || strings.Contains(b, a) {
		if ratio < 0.9 {
			ratio = 0.9
		}
	}
	return ratio
}

// artistSimilarity compares a scrobble artist string (which may contain several
// artists joined by ", " / " x " / " & " / " feat. ") against a candidate
// artist, returning the best per-token similarity.
func artistSimilarity(query, candidate string) float64 {
	qNorm := normalize(query)
	cNorm := normalize(candidate)
	if qNorm == cNorm {
		return 1
	}

	best := similarity(qNorm, cNorm)
	for _, part := range splitArtists(query) {
		if s := similarity(normalize(part), cNorm); s > best {
			best = s
		}
	}
	return best
}

// splitArtists breaks a combined artist credit into individual names.
func splitArtists(artist string) []string {
	seps := []string{",", ";", " x ", " X ", " & ", " feat. ", " feat ", " ft. ", " ft ", " with "}
	parts := []string{artist}
	for _, sep := range seps {
		var next []string
		for _, p := range parts {
			next = append(next, strings.Split(p, sep)...)
		}
		parts = next
	}

	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// scoreCandidate produces a weighted confidence score in [0,1] for a Deezer
// track against the requested title/artist/album.
func scoreCandidate(params SearchParams, track DeezerTrack) float64 {
	titleSim := similarity(normalize(params.Title), normalize(track.Title))
	// Deezer's title often carries a version suffix in title_version; fall back
	// to the short title when it scores better.
	if track.TitleShort != "" {
		if s := similarity(normalize(params.Title), normalize(track.TitleShort)); s > titleSim {
			titleSim = s
		}
	}
	artistSim := artistSimilarity(params.Artist, track.Artist.Name)

	if params.Album == "" {
		// 65% title, 35% artist when no album to lean on.
		return 0.65*titleSim + 0.35*artistSim
	}

	albumSim := similarity(normalize(params.Album), normalize(track.Album.Title))
	return 0.55*titleSim + 0.30*artistSim + 0.15*albumSim
}
