package rocksky

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// sha256Lower returns the lowercase-hex SHA-256 of s.ToLower() — the lowercasing
// is applied to the whole string (not per field), matching Rocksky's server and
// every other Rocksky SDK.
func sha256Lower(s string) string {
	sum := sha256.Sum256([]byte(strings.ToLower(s)))
	return hex.EncodeToString(sum[:])
}

// SongHash is a song/track's identity: sha256(lower("{title} - {artist} - {album}")).
// Uses the per-track artist, not the album artist.
func SongHash(title, artist, album string) string {
	return sha256Lower(title + " - " + artist + " - " + album)
}

// AlbumHash is an album's identity: sha256(lower("{album} - {albumArtist}")).
func AlbumHash(album, albumArtist string) string {
	return sha256Lower(album + " - " + albumArtist)
}

// ArtistHash is an artist's identity: sha256(lower(albumArtist)) — a single field.
func ArtistHash(albumArtist string) string {
	return sha256Lower(albumArtist)
}
