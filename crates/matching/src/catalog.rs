//! Read-only catalog adapter, using Rocksky's shared SQLite/Postgres backend.
use crate::{
    providers::{CandidateFuture, Provider},
    Candidate, Identifiers, MatchRequest,
};
use rocksky_db::Backend;
pub struct Catalog {
    pub db: Backend,
}
impl Provider for Catalog {
    fn name(&self) -> &'static str {
        "catalog"
    }
    fn candidates<'a>(&'a self, request: &'a MatchRequest) -> CandidateFuture<'a> {
        Box::pin(async move {
            // Retrieval is deliberately broad across artists and albums. The
            // shared Rust policy validates every row, including identifier hits.
            // SQL lower() is a retrieval optimization, not the matching rule.
            let mut query=self.db.sql("SELECT t.xata_id, t.title, t.artist, COALESCE(a.title,t.album), t.album_artist, CAST(t.duration AS BIGINT), t.mb_id, t.isrc, t.album_art, t.album, CAST(t.track_number AS BIGINT), CAST(t.disc_number AS BIGINT), t.label, t.spotify_link, CAST(a.release_date AS TEXT), t.genre FROM tracks t LEFT JOIN album_tracks at ON at.track_id=t.xata_id LEFT JOIN albums a ON a.xata_id=at.album_id WHERE LOWER(t.title)=LOWER(");
            query.bind(request.title.trim()).push(")");
            if let Some(id) = &request.identifiers.musicbrainz_recording_id {
                query
                    .push(" OR LOWER(t.mb_id)=LOWER(")
                    .bind(id.clone())
                    .push(")");
            }
            if let Some(id) = &request.identifiers.isrc {
                query
                    .push(" OR UPPER(REPLACE(t.isrc,'-',''))=")
                    .bind(id.replace('-', "").to_ascii_uppercase());
            }
            query.push(" ORDER BY t.xata_id, a.xata_id LIMIT 501");
            type Row = (
                String,
                String,
                String,
                String,
                String,
                i64,
                Option<String>,
                Option<String>,
                Option<String>,
                String,
                Option<i64>,
                Option<i64>,
                Option<String>,
                Option<String>,
                Option<String>,
                Option<String>,
            );
            let rows: Vec<Row> = self.db.fetch_all(&query).await?;
            anyhow::ensure!(rows.len() <= 500, "catalog candidate limit exceeded");
            Ok(rows
                .into_iter()
                .map(
                    |(
                        id,
                        title,
                        artist,
                        album,
                        album_artist,
                        duration,
                        mbid,
                        isrc,
                        art,
                        track_album,
                        track_number,
                        disc_number,
                        label,
                        spotify_link,
                        release_date,
                        genre,
                    )| {
                        Candidate {
                            track_number: track_number.and_then(|n| n.try_into().ok()),
                            disc_number: disc_number.and_then(|n| n.try_into().ok()),
                            label,
                            spotify_link,
                            release_date: release_date
                                .map(|d| d.split('T').next().unwrap_or(&d).to_owned()),
                            genres: genre.map(|g| g.split(", ").map(str::to_owned).collect()),
                            source: "catalog".into(),
                            id,
                            title,
                            artists: vec![artist],
                            version: (crate::normalize(&album) != crate::normalize(&track_album))
                                .then_some(track_album),
                            album: Some(album),
                            album_artist: Some(album_artist),
                            duration_ms: u64::try_from(duration).ok().filter(|n| *n > 0),
                            album_art: art,
                            identifiers: Identifiers {
                                musicbrainz_recording_id: mbid,
                                isrc,
                                ..Default::default()
                            },
                            ..Default::default()
                        }
                    },
                )
                .collect())
        })
    }
}
