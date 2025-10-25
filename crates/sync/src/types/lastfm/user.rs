use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UserResponse {
    pub user: User,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct User {
    pub name: String,
    pub age: String,        // API returns "0" as string
    pub subscriber: String, // "0" or "1" as string
    pub realname: String,
    pub bootstrap: String,    // "0" or "1" as string
    pub playcount: String,    // Numeric but returned as string
    pub artist_count: String, // Numeric but returned as string
    pub playlists: String,    // Numeric but returned as string
    pub track_count: String,  // Numeric but returned as string
    pub album_count: String,  // Numeric but returned as string
    pub image: Vec<Image>,
    pub registered: Registered,
    pub country: String,
    pub gender: String,
    pub url: String,
    #[serde(rename = "type")]
    pub user_type: String, // Renamed to avoid Rust keyword conflict
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Image {
    pub size: String,
    #[serde(rename = "#text")]
    pub text: String, // URL for the image
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Registered {
    pub unixtime: String,
    #[serde(rename = "#text")]
    pub text: u64, // Numeric timestamp
}
