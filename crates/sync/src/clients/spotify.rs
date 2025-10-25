pub struct SpotifyClient {
    refresh_token: String,
}

impl SpotifyClient {
    pub fn new(refresh_token: &str) -> Self {
        SpotifyClient {
            refresh_token: refresh_token.to_string(),
        }
    }
}
