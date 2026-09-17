//! Filling in metadata from `api.rocksky.app`.
//!
//! A record carries the metadata of the thing it is about and nothing about
//! the things it references. A scrobble names its artist and its album but
//! says nothing about either, so an artist created from the firehose has a
//! name and no picture, and an album created from a record that happened to
//! carry no cover has no art.
//!
//! The hosted API has already resolved all of this for anything anybody has
//! scrobbled — from Spotify, from MusicBrainz, from a Bluesky avatar — so a
//! self-hosted instance asks it rather than repeating that work against
//! upstreams it has no credentials for. Where to ask is
//! [`crate::Config::artist_metadata_url`]; both sweeps use it, since it is one
//! API.
//!
//! | sweep             | fills                        | matched on   |
//! |-------------------|------------------------------|--------------|
//! | [`artists`]       | pictures and genres          | artist name  |
//! | [`albums`]        | album art                    | album sha256 |
//!
//! # The API is rate limited, so this is deliberately slow
//!
//! One batch of requests per [`INTERVAL`], **shared between both sweeps** —
//! they talk to the same rate-limited API, so running them on independent
//! timers would double the rate for no gain. A `429` backs off for
//! [`BACKOFF`] rather than retrying.
//!
//! Filling in ten thousand rows therefore takes hours, which is fine: an
//! album without a cover renders a placeholder, not an error.
//!
//! Three things keep the request count down beyond that:
//!
//! | measure                | why                                                 |
//! |------------------------|-----------------------------------------------------|
//! | batching               | many rows per request instead of one each           |
//! | only missing rows      | a filled row is never asked about again             |
//! | asked-recently marking | a row already asked about is not re-asked for a week |
//!
//! And one thing keeps them *moving*: a [`Cursor`], because "still missing"
//! is the condition for selecting a row, so a row the API cannot fill stays
//! selected at the head of the table. Marking it stops the request but not
//! the selection — without the cursor a sweep reads the same rows forever and
//! reports itself idle while the rest of the table is never touched. Both are
//! needed, and both exist because the artist sweep did exactly that.

pub mod albums;
pub mod artists;

use crate::state::AppState;
use std::time::Duration;

/// Where to ask. The hosted API, which has already done this work.
pub const DEFAULT_SOURCE: &str = "https://api.rocksky.app";

/// Gap between batches.
///
/// The API is rate limited and this is background work nobody is waiting on,
/// so the interval is generous rather than tuned.
const INTERVAL: Duration = Duration::from_secs(20);

/// How long to wait after a `429` or a server error.
const BACKOFF: Duration = Duration::from_secs(300);

/// One request's worth of timeout.
pub(crate) const TIMEOUT: Duration = Duration::from_secs(15);

/// How long a row the API did not recognise is left alone.
///
/// Long, because the answer rarely changes: something the hosted instance has
/// never seen either will not appear because this instance asked again. Not
/// permanent, because it does change when somebody scrobbles it there.
pub(crate) const UNKNOWN_TTL: Duration = Duration::from_secs(7 * 24 * 3600);

/// What one batch did.
pub enum Outcome {
    /// How many rows were filled in. A request was spent.
    Filled(usize),
    /// Nothing to ask about, so no request was made — which is what lets the
    /// tick go to the other sweep instead of being wasted.
    Idle,
    /// The API refused; the caller should wait.
    RateLimited,
}

/// The two sweeps, which share one request budget.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum Sweep {
    Albums,
    Artists,
}

impl Sweep {
    async fn run(self, state: &AppState) -> anyhow::Result<Outcome> {
        match self {
            Sweep::Albums => albums::run_batch(state).await,
            Sweep::Artists => artists::run_batch(state).await,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Sweep::Albums => "albums",
            Sweep::Artists => "artists",
        }
    }
}

/// The order to try the sweeps in on a given tick.
///
/// Alternating, so that a long backlog on one side does not starve the other:
/// with a fixed order, thousands of missing album covers would mean no artist
/// picture is ever filled in.
fn order(tick: u64) -> [Sweep; 2] {
    if tick % 2 == 0 {
        [Sweep::Albums, Sweep::Artists]
    } else {
        [Sweep::Artists, Sweep::Albums]
    }
}

/// Starts the sweeps. The handle stops them when dropped.
pub fn spawn(state: &AppState) -> tokio::task::JoinHandle<()> {
    let state = state.clone();
    tokio::spawn(async move {
        let mut tick: u64 = 0;
        loop {
            tokio::time::sleep(INTERVAL).await;
            tick = tick.wrapping_add(1);

            for sweep in order(tick) {
                match sweep.run(&state).await {
                    // No request was spent, so give the tick to the other one.
                    Ok(Outcome::Idle) => continue,
                    Ok(Outcome::Filled(filled)) => {
                        if filled > 0 {
                            tracing::info!(sweep = sweep.name(), filled, "filled in metadata");
                        }
                        break;
                    }
                    Ok(Outcome::RateLimited) => {
                        tracing::warn!(
                            sweep = sweep.name(),
                            seconds = BACKOFF.as_secs(),
                            "rocksky API rate limited the metadata sweep; backing off"
                        );
                        tokio::time::sleep(BACKOFF).await;
                        break;
                    }
                    Err(err) => {
                        tracing::warn!(sweep = sweep.name(), error = ?err, "metadata sweep failed");
                        tokio::time::sleep(BACKOFF).await;
                        break;
                    }
                }
            }
        }
    })
}

/// How far through its table a sweep has got.
///
/// # Why a cursor is needed at all
///
/// "Still missing" is the condition for selecting a row, so a row the API
/// cannot fill stays selected — and it is always at the head of the table,
/// because the order is oldest-first. Skipping it with the asked-recently
/// marker stops the *request* but not the *selection*: the next pass reads
/// the same rows, finds them all marked, and has nothing to ask. The sweep
/// then reports itself idle forever while thousands of fillable rows sit
/// further down the table, untouched.
///
/// That is not a hypothetical either — it is what the artist sweep did. The
/// first hundred artists all had pictures and no genres (the API answers
/// `genres: []` for nearly everyone, which cannot fill the column), so they
/// stayed selected, stayed marked, and nothing past them was ever read.
///
/// So each pass advances the offset past whatever it read, and wraps when it
/// runs off the end.
///
/// # Why an offset is sound here even though rows leave the set
///
/// Filling a row removes it from the selection, so the rows shift under the
/// offset and a pass can step over some. That is acceptable because the
/// cursor wraps: anything stepped over is selected on a later lap, and the
/// alternative — a durable per-row marker — means a schema change for a
/// background nicety. What matters is that every pass moves, which is what
/// the shifting cannot break.
pub(crate) struct Cursor(std::sync::atomic::AtomicU64);

impl Cursor {
    pub(crate) const fn new() -> Self {
        Self(std::sync::atomic::AtomicU64::new(0))
    }

    pub(crate) fn offset(&self) -> u64 {
        self.0.load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Moves past the rows just read.
    pub(crate) fn advance(&self, by: u64) {
        self.0.fetch_add(by, std::sync::atomic::Ordering::Relaxed);
    }

    /// Back to the top, after a pass ran off the end of the table.
    pub(crate) fn rewind(&self) {
        self.0.store(0, std::sync::atomic::Ordering::Relaxed);
    }
}

/// The API to ask, or `None` when there is nothing to ask.
///
/// Empty disables the sweeps. Asking *ourselves* would be a loop that answers
/// with the same empty rows it is trying to fill, so that is refused too.
pub(crate) fn source(state: &AppState) -> Option<String> {
    let source = state.config().artist_metadata_url.clone();
    if source.is_empty() {
        return None;
    }
    if is_self(&source, state.config()) {
        tracing::debug!("the metadata source is this instance; nothing to do");
        return None;
    }
    Some(source)
}

/// Whether the configured source is this instance.
fn is_self(source: &str, config: &crate::Config) -> bool {
    let normalise = |url: &str| url.trim_end_matches('/').to_lowercase();
    normalise(source) == normalise(&config.public_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Asking ourselves would answer with the same empty rows we are trying
    /// to fill.
    #[test]
    fn this_instance_is_not_its_own_source() {
        let mut config = crate::Config::for_test();
        config.public_url = "https://rocksky.example".into();

        assert!(is_self("https://rocksky.example", &config));
        assert!(is_self("https://rocksky.example/", &config));
        assert!(is_self("HTTPS://Rocksky.Example", &config));
        assert!(!is_self(DEFAULT_SOURCE, &config));
    }

    /// The cursor has one job: never hand back the same window twice in a
    /// row. A pass that reads rows it cannot fill has to leave them behind,
    /// or the sweep stalls on the head of the table — which is the bug this
    /// type exists for.
    #[test]
    fn the_cursor_always_moves_on() {
        let cursor = Cursor::new();
        assert_eq!(cursor.offset(), 0);

        cursor.advance(62);
        assert_eq!(cursor.offset(), 62, "the next pass reads past what it read");
        cursor.advance(62);
        assert_eq!(cursor.offset(), 124);

        // Off the end of the table: back to the top for another lap, where
        // rows skipped last time round are selected again.
        cursor.rewind();
        assert_eq!(cursor.offset(), 0);
    }

    /// Both sweeps must get turns. A fixed order would mean a large album
    /// backlog stops artist pictures being filled in at all.
    #[test]
    fn the_sweeps_alternate() {
        assert_eq!(order(0)[0], Sweep::Albums);
        assert_eq!(order(1)[0], Sweep::Artists);
        assert_eq!(order(2)[0], Sweep::Albums);

        // And each order covers both, so neither is ever skipped entirely.
        for tick in 0..4 {
            let order = order(tick);
            assert!(order.contains(&Sweep::Albums) && order.contains(&Sweep::Artists));
        }
    }
}
