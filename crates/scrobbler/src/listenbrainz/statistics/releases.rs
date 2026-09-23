//! `GET /1/stats/user/{user_name}/releases` — the top-albums chart.

use anyhow::Error;
use rocksky_db::loaders;
use rocksky_db::models::User;
use rocksky_db::schema::Scrobbles;
use rocksky_db::Backend;

use crate::listenbrainz::range::Window;
use crate::listenbrainz::statistics::{self, StatsParams};
use crate::listenbrainz::types::{StatsEntry, StatsResponse};

pub async fn get_top_releases(
    db: &Backend,
    user: &User,
    range: &str,
    window: &Window,
    params: &StatsParams,
) -> Result<StatsResponse, Error> {
    let ranked = statistics::rank(db, &user.id, Scrobbles::AlbumId, window, params).await?;
    let ids = ranked.iter().map(|(id, _)| Some(id.clone()));
    let by_id = loaders::albums_by_id(db, ids).await?;

    let releases: Vec<StatsEntry> = ranked
        .iter()
        .filter_map(|(id, plays)| {
            let album = by_id.get(id.as_str())?;
            Some(StatsEntry {
                artist_name: album.artist.clone(),
                artist_mbids: None,
                release_name: Some(album.title.clone()),
                // No release MBID in the catalogue — see
                // `crate::listenbrainz::catalogue`.
                release_mbid: None,
                track_name: None,
                recording_mbid: None,
                listen_count: *plays,
            })
        })
        .collect();

    let mut payload = statistics::payload(&user.handle, range, window, params);
    payload.count = releases.len();
    payload.total_release_count =
        Some(statistics::total(db, &user.id, Scrobbles::AlbumId, window).await?);
    payload.releases = Some(releases);

    Ok(statistics::response(payload))
}
