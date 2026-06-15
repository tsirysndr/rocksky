package rocksky

import "context"

// RockboxService groups endpoints under app.rocksky.rockbox.*.
// All methods require an authenticated bearer token.
type RockboxService struct{ c *Client }

// GetAudioSettings returns the authenticated user's Rockbox audio settings.
// XRPC: app.rocksky.rockbox.getAudioSettings.
func (s *RockboxService) GetAudioSettings(ctx context.Context) (*RockboxSettingsView, error) {
	out := &RockboxSettingsView{}
	if err := s.c.query(ctx, "app.rocksky.rockbox.getAudioSettings", nil, out); err != nil {
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
