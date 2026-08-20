package deezer

import (
	"sync"
	"time"
)

// breaker stops us from hammering Deezer once it starts refusing us.
//
// A blocked IP or an exhausted quota rejects every request in a few
// milliseconds, so without a breaker the service converts the whole incoming
// scrobble stream into upstream rejections — keeping the block warm, and
// spending the quota that the eventual retry needs. When it opens, callers are
// answered immediately from whatever we already have instead of queueing behind
// an endpoint that is not going to answer.
type breaker struct {
	mu sync.Mutex

	// threshold is how many consecutive failures open a closed breaker.
	threshold int
	// base is the first cooldown; it doubles on every failed probe up to max.
	base, max time.Duration

	failures  int
	rounds    int
	openUntil time.Time
	probing   bool
}

func newBreaker(threshold int, base, max time.Duration) *breaker {
	if threshold < 1 {
		threshold = 1
	}
	return &breaker{threshold: threshold, base: base, max: max}
}

// allow reports whether a request may go upstream. While the breaker is open it
// returns the remaining cooldown instead. Once that elapses exactly one request
// at a time is let through as a probe; probe reports it so it can hand the slot
// back if it never actually sends.
func (b *breaker) allow(now time.Time) (allowed, probe bool, wait time.Duration) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.openUntil.IsZero() {
		return true, false, 0
	}
	if remaining := b.openUntil.Sub(now); remaining > 0 {
		return false, false, remaining
	}
	if b.probing {
		return false, false, b.base
	}
	b.probing = true
	return true, true, 0
}

// abandon hands back a probe slot its holder never used, so a half-open breaker
// does not stay stuck waiting on a probe that was never sent.
func (b *breaker) abandon() {
	b.mu.Lock()
	b.probing = false
	b.mu.Unlock()
}

// success closes the breaker.
func (b *breaker) success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures, b.rounds, b.probing = 0, 0, false
	b.openUntil = time.Time{}
}

// failure records an upstream failure and reports the cooldown when it opens or
// re-opens the breaker. A Retry-After from Deezer wins over the computed
// backoff when it is longer, but is still capped at max.
func (b *breaker) failure(now time.Time, retryAfter time.Duration) (time.Duration, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	wasProbe := b.probing
	b.probing = false
	b.failures++

	// The threshold only applies while the breaker is closed: once it has
	// opened, a single failed probe re-opens it with a longer cooldown.
	if !wasProbe && b.rounds == 0 && b.failures < b.threshold {
		return 0, false
	}

	b.rounds++
	d := b.base << min(b.rounds-1, 16)
	if d <= 0 || d > b.max {
		d = b.max
	}
	if retryAfter > d {
		d = min(retryAfter, b.max)
	}
	b.openUntil = now.Add(d)
	b.failures = 0
	return d, true
}

// remaining is how much of the cooldown is left, for logging and for telling
// callers when to come back.
func (b *breaker) remaining(now time.Time) time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	if wait := b.openUntil.Sub(now); wait > 0 {
		return wait
	}
	return 0
}
