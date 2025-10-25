pub struct TidalClient {
    refresh_token: String,
}

impl TidalClient {
    pub fn new(refresh_token: &str) -> Self {
        TidalClient {
            refresh_token: refresh_token.to_string(),
        }
    }
}
