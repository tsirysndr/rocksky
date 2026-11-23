package rocksky

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bluesky-social/indigo/xrpc"
)

func quotaHeaders(policy, remaining string) http.Header {
	var limit string
	for i, c := range policy {
		if c == ';' {
			limit = policy[:i]
			break
		}
	}
	return http.Header{"Ratelimit-Policy": {policy}, "Ratelimit-Limit": {limit},
		"Ratelimit-Remaining": {remaining}, "Ratelimit-Reset": {"1800000000"}}
}

func TestPdsWritePolicies(t *testing.T) {
	for _, policy := range []string{"5000;w=3600", "35000;w=86400"} {
		q := parsePdsWriteRateLimit(quotaHeaders(policy, "0"))
		if q == nil || q.Remaining != 0 {
			t.Fatalf("missing exhausted budget: %s", policy)
		}
	}
	for _, policy := range []string{"3000;w=300", "10000;w=3600", ""} {
		if parsePdsWriteRateLimit(quotaHeaders(policy, "0")) != nil {
			t.Fatalf("accepted non-write policy %q", policy)
		}
	}
	for _, value := range []string{"", "NaN", "-1", "1.5", "5001", "9007199254740992"} {
		if parsePdsWriteRateLimit(quotaHeaders("5000;w=3600", value)) != nil {
			t.Fatalf("accepted malformed remaining %q", value)
		}
	}
	h := quotaHeaders("5000;w=3600", "4997")
	h.Del("ratelimit-reset")
	if parsePdsWriteRateLimit(h) != nil {
		t.Fatal("accepted missing reset")
	}
}

func TestWriteResponsesIncludeQuota(t *testing.T) {
	n := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n++
		if n <= 4 {
			for k, v := range quotaHeaders("5000;w=3600", fmt.Sprint(5000-3*n)) {
				w.Header()[k] = v
			}
		}
		if n == 5 {
			for k, v := range quotaHeaders("35000;w=86400", "0") {
				w.Header()[k] = v
			}
			w.WriteHeader(429)
			fmt.Fprint(w, `{"error":"RateLimitExceeded"}`)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"uri": "at://did:plc:test/record/key"})
	}))
	defer srv.Close()
	a := &Agent{client: &xrpc.Client{Host: srv.URL, Client: srv.Client()}, did: testDID}
	if a.PdsWriteRateLimit() != nil {
		t.Fatal("quota before any write")
	}
	result, err := a.Scrobble(context.Background(), fullScrobble())
	if err != nil {
		t.Fatal(err)
	}
	if n != 4 || result.PdsWriteRateLimit == nil || result.PdsWriteRateLimit.Remaining != 4988 || !result.Written {
		t.Fatalf("incorrect fan-out result: %+v, requests=%d", result, n)
	}
	snapshot := a.PdsWriteRateLimit()
	snapshot.Remaining = 1
	if a.PdsWriteRateLimit().Remaining != 4988 {
		t.Fatal("getter leaked mutable state")
	}
	_, err = a.Delete(context.Background(), colArtist, "key")
	var writeErr *PdsWriteError
	if !errors.As(err, &writeErr) || writeErr.PdsWriteRateLimit == nil || writeErr.PdsWriteRateLimit.Remaining != 0 {
		t.Fatalf("missing failed write quota: %v", err)
	}
	deleted, err := a.Delete(context.Background(), colArtist, "key")
	if err != nil {
		t.Fatal(err)
	}
	if deleted.PdsWriteRateLimit != nil || a.PdsWriteRateLimit() != nil {
		t.Fatal("stale quota after missing headers")
	}
}
