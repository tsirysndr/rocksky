@external(javascript, "./google_oauth_ffi.mjs", "authorizeUrl")
pub fn authorize_url(
  client_id: String,
  client_secret: String,
  redirect_uri: String,
  state: String,
) -> String
