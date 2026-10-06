package discogs

import (
	"sync"
	"time"
)

// breaker pauses outbound calls once Discogs starts refusing them, so a
// rejected token or an exhausted quota does not turn the whole incoming
// stream into upstream rejections.
type breaker struct {
	mu sync.Mutex

	threshold int
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

// allow reports whether a request may go upstream, and whether it is the
// single probe let through after a cooldown elapses.
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

// abandon hands back a probe slot its holder never used.
func (b *breaker) abandon() {
	b.mu.Lock()
	b.probing = false
	b.mu.Unlock()
}

func (b *breaker) success() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.failures, b.rounds, b.probing = 0, 0, false
	b.openUntil = time.Time{}
}

// failure records an upstream failure and reports the cooldown when it opens
// or re-opens the breaker.
func (b *breaker) failure(now time.Time, retryAfter time.Duration) (time.Duration, bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	wasProbe := b.probing
	b.probing = false
	b.failures++

	// The threshold only applies while closed: one failed probe re-opens it.
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

func (b *breaker) remaining(now time.Time) time.Duration {
	b.mu.Lock()
	defer b.mu.Unlock()
	if wait := b.openUntil.Sub(now); wait > 0 {
		return wait
	}
	return 0
}
