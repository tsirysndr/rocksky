package discogs

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// WindowLimiter admits at most n sends in any rolling window and queues the
// rest. A token bucket sized (burst n, refill n/window) would emit 2n across a
// window boundary and trip the per-token quota, so slot times are kept in a
// ring instead: a send may go out no earlier than one window after the n-th
// most recent one.
type WindowLimiter struct {
	mu sync.Mutex
	// spacing is the window plus a guard band, since a sleeping goroutine
	// wakes late and can land less than a window after one that ran on time.
	spacing time.Duration
	slots   []time.Time
	next    int
}

func NewWindowLimiter(n int, window time.Duration) *WindowLimiter {
	if n < 1 {
		n = 1
	}
	guard := window / 20
	if guard < 50*time.Millisecond {
		guard = 50 * time.Millisecond
	}
	return &WindowLimiter{spacing: window + guard, slots: make([]time.Time, n)}
}

// reserve claims the next send slot. When that slot falls past deadline
// nothing is claimed, so a request that gives up never burns quota.
func (l *WindowLimiter) reserve(now, deadline time.Time) (wait time.Duration, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	at := now
	if earliest := l.slots[l.next].Add(l.spacing); earliest.After(at) {
		at = earliest
	}
	if at.After(deadline) {
		return at.Sub(now), false
	}

	l.slots[l.next] = at
	l.next = (l.next + 1) % len(l.slots)
	return at.Sub(now), true
}

// Wait blocks until this request may be sent, or returns errQueueFull when its
// turn would come after deadline.
func (l *WindowLimiter) Wait(ctx context.Context, deadline time.Time) error {
	wait, ok := l.reserve(time.Now(), deadline)
	if !ok {
		return fmt.Errorf("%w: next slot is %s away", errQueueFull, wait.Round(time.Millisecond))
	}
	if wait <= 0 {
		return nil
	}

	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		// Forfeiting the slot only ever under-uses the quota.
		return ctx.Err()
	}
}
