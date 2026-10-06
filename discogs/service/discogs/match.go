package discogs

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var diacriticsRemover = transform.Chain(
	norm.NFD,
	runes.Remove(runes.In(unicode.Mn)),
	norm.NFC,
)

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

// Discogs appends "(2)" to duplicate artist names.
var disambiguator = regexp.MustCompile(`\s*\(\d+\)$`)

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
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
		}
	}
	return strings.TrimSpace(b.String())
}

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
			curr[j] = min(curr[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

// similarity is a normalized edit-distance ratio in [0,1], with a bonus for containment.
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
	longest := max(len(ra), len(rb))
	ratio := 1 - float64(dist)/float64(longest)

	if strings.Contains(a, b) || strings.Contains(b, a) {
		ratio = max(ratio, 0.9)
	}
	return ratio
}

func artistSimilarity(query, candidate string) float64 {
	qNorm := normalize(query)
	cNorm := normalize(stripDisambiguator(candidate))
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

func stripDisambiguator(name string) string {
	return strings.TrimSpace(disambiguator.ReplaceAllString(name, ""))
}

// A release search result is titled "Artist - Release Title".
func splitResultTitle(title string) (artist, album string) {
	if i := strings.Index(title, " - "); i >= 0 {
		return strings.TrimSpace(title[:i]), strings.TrimSpace(title[i+3:])
	}
	return "", strings.TrimSpace(title)
}

var suspectFormats = []string{"promo", "test pressing", "unofficial", "acetate", "white label", "transcription"}

// Discogs lists dozens of versions per release and its ranking does not care which one a listener played.
func editionBonus(r SearchResult) float64 {
	bonus := 0.5
	if r.MasterID != 0 {
		bonus += 0.3
	}
	joined := strings.ToLower(strings.Join(r.Format, " "))
	if strings.Contains(joined, "album") {
		bonus += 0.2
	}
	for _, bad := range suspectFormats {
		if strings.Contains(joined, bad) {
			bonus -= 0.5
			break
		}
	}
	return min(max(bonus, 0), 1)
}

// Search results carry no track titles, so an album is scored against the release title and the track title stands in when there is none.
func scoreCandidate(params SearchParams, r SearchResult) float64 {
	resultArtist, resultAlbum := splitResultTitle(r.Title)
	artistSim := artistSimilarity(params.Artist, resultArtist)

	if strings.TrimSpace(params.Album) != "" {
		albumSim := similarity(normalize(params.Album), normalize(resultAlbum))
		return 0.55*albumSim + 0.35*artistSim + 0.10*editionBonus(r)
	}

	titleSim := similarity(normalize(params.Title), normalize(resultAlbum))
	return 0.55*artistSim + 0.30*titleSim + 0.15*editionBonus(r)
}

// Headings and index entries carry no audio.
func findTrack(tracklist []Track, title string) (Track, bool) {
	want := normalize(title)
	best := Track{}
	bestScore := 0.0
	for _, t := range tracklist {
		switch strings.ToLower(t.Type) {
		case "", "track":
		default:
			continue
		}
		if s := similarity(want, normalize(t.Title)); s > bestScore {
			best, bestScore = t, s
		}
	}
	if bestScore < 0.6 {
		return Track{}, false
	}
	return best, true
}

var vinylPosition = regexp.MustCompile(`^([A-Za-z])(\d+)`)

// Positions look like "7", "2-04" or "C3"; vinyl numbering is side-relative, as printed on the sleeve.
func parsePosition(pos string) (disc, number int) {
	pos = strings.TrimSpace(pos)
	if pos == "" {
		return 0, 0
	}

	if i := strings.IndexAny(pos, "-."); i > 0 {
		if d, err := strconv.Atoi(strings.TrimSpace(pos[:i])); err == nil {
			if n, err := strconv.Atoi(strings.TrimSpace(pos[i+1:])); err == nil {
				return d, n
			}
		}
	}
	if m := vinylPosition.FindStringSubmatch(pos); m != nil {
		side := int(strings.ToUpper(m[1])[0] - 'A')
		n, _ := strconv.Atoi(m[2])
		return side/2 + 1, n
	}
	if n, err := strconv.Atoi(pos); err == nil {
		return 0, n
	}
	return 0, 0
}

func parseDuration(d string) int64 {
	d = strings.TrimSpace(d)
	if d == "" {
		return 0
	}
	parts := strings.Split(d, ":")
	if len(parts) > 3 {
		return 0
	}
	seconds := 0
	for _, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil || n < 0 {
			return 0
		}
		seconds = seconds*60 + n
	}
	return int64(seconds) * 1000
}

func yearFromDate(date string) int {
	if len(date) < 4 {
		return 0
	}
	y, err := strconv.Atoi(date[:4])
	if err != nil {
		return 0
	}
	return y
}
