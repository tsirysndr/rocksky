package deezer

import (
	"context"
	"fmt"
	"sync"
	"time"
)

// WindowLimiter admits at most n sends in any rolling window of the given
// length, and queues everything else.
//
// A token bucket cannot express that quota. With a burst of n and a refill of
// n/window it will emit n immediately and another n over the following window —
// 2n inside a single window — which is how a service that looks compliant on
// paper still trips a fixed per-IP limit.
//
// Instead we keep the scheduled send time of the last n requests in a ring. A
// request may go out no earlier than one window after the n-th most recent one,
// so no window ever contains more than n sends. Slots are handed out under the
// lock in call order, so waiters are admitted FIFO, and a request whose slot
// would fall past its deadline claims nothing at all.
type WindowLimiter struct {
	mu sync.Mutex
	// spacing is the window plus a guard band. Slots hold the time a request
	// was *scheduled* to go out, but a sleeping goroutine wakes late, never
	// early — so a request that ran late can land less than a window after one
	// that ran on time. The guard absorbs that jitter, at the cost of a few
	// percent of throughput we would rather not spend on a quota violation.
	spacing time.Duration
	slots   []time.Time
	next    int
}

// NewWindowLimiter allows n sends per rolling window.
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

// reserve claims the next send slot and reports how long the caller must wait
// for it. When that slot falls past deadline nothing is claimed and ok is
// false, so a request that gives up never burns quota.
func (l *WindowLimiter) reserve(now, deadline time.Time) (wait time.Duration, ok bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	at := now
	// The zero value of the first n slots is long past, so the first window
	// fills without anyone waiting.
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

// Wait blocks until this request may be sent to Deezer. It returns errQueueFull
// when the request's turn would come after deadline — answering the caller then
// is strictly better than holding its connection open until it times out.
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
		// The slot is forfeited rather than handed back. That only ever
		// under-uses the quota, never overruns it.
		return ctx.Err()
	}
}
