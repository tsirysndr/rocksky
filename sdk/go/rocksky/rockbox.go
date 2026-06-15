package rocksky

import (
	"context"
	"net/url"
)

// RockboxService groups endpoints under app.rocksky.rockbox.*.
type RockboxService struct{ c *Client }

// GetAudioSettings returns Rockbox audio settings.
//
// If did is non-empty the request is public and no bearer token is needed.
// If did is empty the client must have a bearer token set; the caller's own
// settings are returned.
// XRPC: app.rocksky.rockbox.getAudioSettings.
func (s *RockboxService) GetAudioSettings(ctx context.Context, did string) (*RockboxSettingsView, error) {
	var q url.Values
	if did != "" {
		q = url.Values{"did": {did}}
	}
	out := &RockboxSettingsView{}
	if err := s.c.query(ctx, "app.rocksky.rockbox.getAudioSettings", q, out); err != nil {
		return nil, err
	}
	return out, nil
}

// PutAudioSettings upserts the authenticated user's Rockbox audio settings.
// Only sections present in input are merged; omitted sections are left unchanged.
// XRPC: app.rocksky.rockbox.putAudioSettings.
func (s *RockboxService) PutAudioSettings(ctx context.Context, input *PutAudioSettingsInput) (*RockboxSettingsView, error) {
	out := &RockboxSettingsView{}
	if err := s.c.procedure(ctx, "app.rocksky.rockbox.putAudioSettings", nil, input, out); err != nil {
		return nil, err
	}
	return out, nil
}
