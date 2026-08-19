package spotify

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// loadAppsFromDB reads the registered Spotify apps from the spotify_apps
// table and decrypts each secret with SPOTIFY_ENCRYPTION_KEY /
// SPOTIFY_ENCRYPTION_IV (same AES-256-CTR scheme the API and the Rust
// services use). Rows whose secret fails to decrypt are skipped.
func loadAppsFromDB(ctx context.Context) ([]*appCred, error) {
	dsn := os.Getenv("XATA_POSTGRES_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn == "" {
		return nil, fmt.Errorf("XATA_POSTGRES_URL is not set")
	}

	key, err := hex.DecodeString(os.Getenv("SPOTIFY_ENCRYPTION_KEY"))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("SPOTIFY_ENCRYPTION_KEY must be 32 hex-encoded bytes")
	}
	iv, err := hex.DecodeString(os.Getenv("SPOTIFY_ENCRYPTION_IV"))
	if err != nil || len(iv) != aes.BlockSize {
		return nil, fmt.Errorf("SPOTIFY_ENCRYPTION_IV must be 16 hex-encoded bytes")
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres connection: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// Only pool apps that back at least one active user token; orphaned
	// spotify_apps rows are ignored.
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT sa.spotify_app_id, sa.spotify_secret
		FROM spotify_apps sa
		JOIN spotify_tokens st ON st.spotify_app_id = sa.spotify_app_id`)
	if err != nil {
		return nil, fmt.Errorf("failed to query spotify_apps: %w", err)
	}
	defer rows.Close()

	var apps []*appCred
	for rows.Next() {
		var clientID, encSecret string
		if err := rows.Scan(&clientID, &encSecret); err != nil {
			return nil, fmt.Errorf("failed to scan spotify_apps row: %w", err)
		}
		secret, err := decryptAES256CTR(encSecret, key, iv)
		if err != nil || clientID == "" || secret == "" {
			continue
		}
		apps = append(apps, &appCred{clientID: clientID, clientSecret: secret})
	}
	return apps, rows.Err()
}

// decryptAES256CTR decrypts a hex-encoded AES-256-CTR ciphertext. It matches
// Node's crypto.createDecipheriv("aes-256-ctr", key, iv) and the Rust
// decrypt_aes_256_ctr used elsewhere in the monorepo.
func decryptAES256CTR(encHex string, key, iv []byte) (string, error) {
	ciphertext, err := hex.DecodeString(encHex)
	if err != nil {
		return "", fmt.Errorf("ciphertext is not valid hex: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	plaintext := make([]byte, len(ciphertext))
	cipher.NewCTR(block, iv).XORKeyStream(plaintext, ciphertext)
	return string(plaintext), nil
}
