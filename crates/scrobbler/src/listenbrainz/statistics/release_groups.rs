//! `GET /1/stats/user/{user_name}/release-groups`.
//!
//! MusicBrainz's release *group* is the work behind every edition of an
//! album. The catalogue has no such level — one `albums` row per title and
//! artist is already the grouping — so this answers the album chart under the
//! release-group key. That is the honest mapping rather than an empty list: a
//! client charting release groups is asking "which albums", and that is the
//! question these rows answer.

use anyhow::Error;
use rocksky_db::models::User;
use rocksky_db::Backend;

use crate::listenbrainz::range::Window;
use crate::listenbrainz::statistics::{releases, StatsParams};
use crate::listenbrainz::types::StatsResponse;

pub async fn get_top_release_groups(
    db: &Backend,
    user: &User,
    range: &str,
    window: &Window,
    params: &StatsParams,
) -> Result<StatsResponse, Error> {
    let mut response = releases::get_top_releases(db, user, range, window, params).await?;
    response.payload.release_groups = response.payload.releases.take();
    response.payload.total_release_group_count = response.payload.total_release_count.take();
    Ok(response)
}
