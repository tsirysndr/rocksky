use actix_web::HttpResponse;
use serde_json::{json, Value};
use sqlx::{Pool, Postgres};
use std::collections::BTreeMap;
use std::sync::Arc;

use crate::{repo, response, xata::artist::ArtistWithStats};

const IGNORED_ARTICLES: &str = "The An A Die Das Ein Eine Les Le La";

fn sort_key(name: &str) -> String {
    for article in IGNORED_ARTICLES.split_whitespace() {
        let prefix = format!("{} ", article);
        if let Some(stripped) = name.strip_prefix(&prefix) {
            return stripped.to_string();
        }
    }
    name.to_string()
}

fn first_letter(name: &str) -> String {
    let key = sort_key(name);
    key.chars()
        .next()
        .map(|c| {
            let u = c.to_uppercase().next().unwrap_or(c);
            if u.is_ascii_alphabetic() {
                u.to_string()
            } else {
                "#".to_string()
            }
        })
        .unwrap_or_else(|| "#".to_string())
}

fn artist_to_json(a: &ArtistWithStats) -> Value {
    let mut obj = json!({
        "id": a.xata_id,
        "name": a.name,
        "albumCount": a.album_count,
    });

    if let Some(pic) = &a.picture {
        obj["artistImageUrl"] = json!(pic);
        obj["coverArt"] = json!(format!("ar-{}", a.xata_id));
    }

    obj
}

pub async fn handle_get_artists(
    format: &str,
    user_id: &str,
    pool: &Arc<Pool<Postgres>>,
    is_indexes: bool,
) -> HttpResponse {
    match repo::artist::get_all_artists(pool, user_id).await {
        Ok(artists) => {
            let mut index_map: BTreeMap<String, Vec<Value>> = BTreeMap::new();

            for artist in &artists {
                let letter = first_letter(&artist.name);
                index_map
                    .entry(letter)
                    .or_default()
                    .push(artist_to_json(artist));
            }

            let index: Vec<Value> = index_map
                .into_iter()
                .map(|(letter, list)| {
                    json!({
                        "name": letter,
                        "artist": list
                    })
                })
                .collect();

            if is_indexes {
                response::ok(
                    format,
                    json!({
                        "indexes": {
                            "lastModified": 0,
                            "ignoredArticles": IGNORED_ARTICLES,
                            "index": index
                        }
                    }),
                )
            } else {
                response::ok(
                    format,
                    json!({
                        "artists": {
                            "ignoredArticles": IGNORED_ARTICLES,
                            "index": index
                        }
                    }),
                )
            }
        }
        Err(e) => {
            tracing::error!("getArtists error: {}", e);
            response::err(format, 0, "Internal server error")
        }
    }
}

pub async fn handle_get_artist(
    format: &str,
    user_id: &str,
    artist_id: &str,
    pool: &Arc<Pool<Postgres>>,
) -> HttpResponse {
    let artist = match repo::artist::get_artist_by_id(pool, artist_id, user_id).await {
        Ok(Some(a)) => a,
        Ok(None) => return response::err(format, 70, "Artist not found"),
        Err(e) => {
            tracing::error!("getArtist error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let albums = match repo::album::get_albums_by_artist(pool, artist_id, user_id).await {
        Ok(a) => a,
        Err(e) => {
            tracing::error!("getArtist albums error: {}", e);
            return response::err(format, 0, "Internal server error");
        }
    };

    let album_list: Vec<Value> = albums
        .iter()
        .map(|a| {
            let mut obj = json!({
                "id": a.xata_id,
                "name": a.title,
                "artist": a.artist,
                "artistId": artist_id,
                "songCount": a.song_count,
                "duration": a.total_duration.unwrap_or(0) / 1000,
                "created": a.created_at.map(|d| d.to_rfc3339()).unwrap_or_default(),
            });
            if let Some(year) = a.year {
                obj["year"] = json!(year);
            }
            if let Some(art) = &a.album_art {
                obj["coverArt"] = json!(format!("al-{}", a.xata_id));
                obj["_coverArtUrl"] = json!(art);
            }
            obj
        })
        .collect();

    let mut artist_obj = json!({
        "id": artist.xata_id,
        "name": artist.name,
        "albumCount": albums.len(),
        "album": album_list,
    });

    if let Some(pic) = &artist.picture {
        artist_obj["artistImageUrl"] = json!(pic);
        artist_obj["coverArt"] = json!(format!("ar-{}", artist.xata_id));
    }

    response::ok(format, json!({ "artist": artist_obj }))
}
