package rocksky

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/bluesky-social/indigo/xrpc"
)

// WriteResult includes the URI and the point quota from this operation.
// Written is false for a dedup hit; its quota is nil, never a stale snapshot.
type WriteResult struct {
	URI               string             `json:"uri"`
	PdsWriteRateLimit *PdsWriteRateLimit `json:"pdsWriteRateLimit"`
	Written           bool               `json:"written"`
}

// DeleteResult contains the point quota returned by a record deletion.
type DeleteResult struct {
	PdsWriteRateLimit *PdsWriteRateLimit `json:"pdsWriteRateLimit"`
}

// PdsWriteRateLimit is a server-reported record-write point budget.
// ResetAt is Unix epoch seconds. Unknown policies are never guessed.
type PdsWriteRateLimit struct {
	Limit     uint64 `json:"limit"`
	Remaining uint64 `json:"remaining"`
	ResetAt   uint64 `json:"resetAt"`
	Policy    string `json:"policy"`
}

func parsePdsWriteRateLimit(h http.Header) *PdsWriteRateLimit {
	policy := strings.TrimSpace(h.Get("ratelimit-policy"))
	var expected uint64
	switch policy {
	case "5000;w=3600":
		expected = 5000
	case "35000;w=86400":
		expected = 35000
	default:
		return nil
	}
	number := func(key string) (uint64, bool) {
		s := strings.TrimSpace(h.Get(key))
		if s == "" {
			return 0, false
		}
		for _, c := range s {
			if c < '0' || c > '9' {
				return 0, false
			}
		}
		n, err := strconv.ParseUint(s, 10, 64)
		return n, err == nil && n <= 9007199254740991
	}
	limit, ok1 := number("ratelimit-limit")
	remaining, ok2 := number("ratelimit-remaining")
	reset, ok3 := number("ratelimit-reset")
	if !ok1 || !ok2 || !ok3 || limit != expected || remaining > limit {
		return nil
	}
	return &PdsWriteRateLimit{Limit: limit, Remaining: remaining, ResetAt: reset, Policy: policy}
}

// PdsWriteRateLimit returns a copy of the latest actual PDS write response,
// including failures. Reads/dedup hits leave it unchanged. A write without a
// recognized point policy clears it. It is nil before the first write.
func (a *Agent) PdsWriteRateLimit() *PdsWriteRateLimit {
	a.quotaMu.RLock()
	defer a.quotaMu.RUnlock()
	if a.writeQuota == nil {
		return nil
	}
	value := *a.writeQuota
	return &value
}

func (a *Agent) setWriteQuota(q *PdsWriteRateLimit) {
	a.quotaMu.Lock()
	defer a.quotaMu.Unlock()
	if q != nil {
		copy := *q
		q = &copy
	}
	a.writeQuota = q
}

type quotaTransport struct {
	base  http.RoundTripper
	agent *Agent
	quota **PdsWriteRateLimit
}

func (t quotaTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(r)
	if response != nil {
		*t.quota = parsePdsWriteRateLimit(response.Header)
		t.agent.setWriteQuota(*t.quota)
	} else {
		t.agent.setWriteQuota(nil)
	}
	return response, err
}

// Keep the authenticated client untouched; scope observation to this write.
func (a *Agent) write(ctx context.Context, nsid string, input, output any) (*PdsWriteRateLimit, error) {
	var quota *PdsWriteRateLimit
	a.setWriteQuota(nil)
	rpc := *a.client
	client := http.DefaultClient
	if rpc.Client != nil {
		client = rpc.Client
	}
	observed := *client
	base := observed.Transport
	if base == nil {
		base = http.DefaultTransport
	}
	observed.Transport = quotaTransport{base: base, agent: a, quota: &quota}
	rpc.Client = &observed
	if err := rpc.Do(ctx, xrpc.Procedure, "application/json", nsid, nil, input, output); err != nil {
		return quota, &PdsWriteError{Err: err, PdsWriteRateLimit: quota}
	}
	return quota, nil
}

// PdsWriteError preserves the underlying XRPC error and the quota at failure.
type PdsWriteError struct {
	Err               error
	PdsWriteRateLimit *PdsWriteRateLimit
}

func (e *PdsWriteError) Error() string { return e.Err.Error() }
func (e *PdsWriteError) Unwrap() error { return e.Err }
