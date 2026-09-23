//! `GET /1/stats/user/{user_name}/recordings` — the top-tracks chart.

use anyhow::Error;
use rocksky_db::loaders;
use rocksky_db::models::User;
use rocksky_db::schema::Scrobbles;
use rocksky_db::Backend;

use crate::listenbrainz::catalogue;
use crate::listenbrainz::range::Window;
use crate::listenbrainz::statistics::{self, StatsParams};
use crate::listenbrainz::types::{StatsEntry, StatsResponse};

pub async fn get_top_recordings(
    db: &Backend,
    user: &User,
    range: &str,
    window: &Window,
    params: &StatsParams,
) -> Result<StatsResponse, Error> {
    let ranked = statistics::rank(db, &user.id, Scrobbles::TrackId, window, params).await?;
    let ids = ranked.iter().map(|(id, _)| Some(id.clone()));
    let by_id = loaders::tracks_by_id(db, ids).await?;

    let recordings: Vec<StatsEntry> = ranked
        .iter()
        .filter_map(|(id, plays)| Some(catalogue::recording_entry(by_id.get(id.as_str())?, *plays)))
        .collect();

    let mut payload = statistics::payload(&user.handle, range, window, params);
    payload.count = recordings.len();
    payload.total_recording_count =
        Some(statistics::total(db, &user.id, Scrobbles::TrackId, window).await?);
    payload.recordings = Some(recordings);

    Ok(statistics::response(payload))
}
