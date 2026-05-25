use actix_web::HttpResponse;
use serde_json::json;
use sqlx::{Pool, Postgres};
use std::sync::Arc;

use crate::{response, xata::user::UserWithApiKey};

pub fn handle_get_user(format: &str, user: &UserWithApiKey) -> HttpResponse {
    response::ok(
        format,
        json!({
            "user": {
                "username": user.handle,
                "scrobblingEnabled": true,
                "adminRole": false,
                "settingsRole": false,
                "downloadRole": true,
                "uploadRole": false,
                "playlistRole": true,
                "coverArtRole": true,
                "commentRole": false,
                "podcastRole": false,
                "streamRole": true,
                "jukeboxRole": false,
                "shareRole": false,
                "videoConversionRole": false,
                "folder": [1]
            }
        }),
    )
}

pub fn handle_get_license(format: &str) -> HttpResponse {
    response::ok(
        format,
        json!({
            "license": {
                "valid": true,
                "email": "hi@rocksky.app",
                "licenseExpires": "2099-01-01T00:00:00.000Z",
                "trialExpires": "2099-01-01T00:00:00.000Z"
            }
        }),
    )
}

pub fn handle_get_scan_status(format: &str, pool: &Arc<Pool<Postgres>>) -> HttpResponse {
    let _ = pool;
    response::ok(
        format,
        json!({
            "scanStatus": {
                "scanning": false,
                "count": 0,
                "folderCount": 0,
                "lastScan": "1970-01-01T00:00:00.000Z"
            }
        }),
    )
}
