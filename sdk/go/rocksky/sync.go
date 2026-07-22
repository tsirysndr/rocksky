package rocksky

import (
	"context"
	"fmt"

	"github.com/bluesky-social/indigo/api/atproto"
)

// SyncRepo downloads the caller's full repository and (re)builds the dedup
// index from it. Requires an attached index ([Agent.UseIndex]). This is a full
// backfill; keep the index current afterwards with [Agent.HydrateFromJetstream].
func (a *Agent) SyncRepo(ctx context.Context) (IndexStats, error) {
	if a.idx == nil {
		return IndexStats{}, fmt.Errorf("no dedup index attached (call UseIndex)")
	}
	car, err := atproto.SyncGetRepo(ctx, a.client, a.did, "")
	if err != nil {
		return IndexStats{}, fmt.Errorf("getRepo: %w", err)
	}
	return a.idx.IndexCAR(ctx, a.did, car)
}
