//! `GET /1/stats/user/{user_name}/artists` — the top-artists chart.

use anyhow::Error;
use rocksky_db::loaders;
use rocksky_db::models::User;
use rocksky_db::schema::Scrobbles;
use rocksky_db::Backend;

use crate::listenbrainz::range::Window;
use crate::listenbrainz::statistics::{self, StatsParams};
use crate::listenbrainz::types::{StatsEntry, StatsResponse};

pub async fn get_top_artists(
    db: &Backend,
    user: &User,
    range: &str,
    window: &Window,
    params: &StatsParams,
) -> Result<StatsResponse, Error> {
    let ranked = statistics::rank(db, &user.id, Scrobbles::ArtistId, window, params).await?;
    let ids = ranked.iter().map(|(id, _)| Some(id.clone()));
    let by_id = loaders::artists_by_id(db, ids).await?;

    // Walked in ranking order so the response keeps it; a row that vanished
    // between the two queries is skipped rather than faked.
    let artists: Vec<StatsEntry> = ranked
        .iter()
        .filter_map(|(id, plays)| {
            let artist = by_id.get(id.as_str())?;
            Some(StatsEntry {
                artist_name: artist.name.clone(),
                // The catalogue stores no MusicBrainz id for an artist.
                artist_mbids: None,
                release_name: None,
                release_mbid: None,
                track_name: None,
                recording_mbid: None,
                listen_count: *plays,
            })
        })
        .collect();

    let mut payload = statistics::payload(&user.handle, range, window, params);
    payload.count = artists.len();
    payload.total_artist_count =
        Some(statistics::total(db, &user.id, Scrobbles::ArtistId, window).await?);
    payload.artists = Some(artists);

    Ok(statistics::response(payload))
}
