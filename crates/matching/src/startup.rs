use crate::{
    providers::{HttpProvider, Provider, ProviderKind},
    service::{routes, Service},
};
use actix_web::{web, App, HttpServer};
use std::{env, sync::Arc};

/// Start the matching HTTP service using the current process environment.
pub async fn run() -> anyhow::Result<()> {
    let mut providers: Vec<Arc<dyn Provider>> = vec![];
    for (key, kind) in [
        ("DEEZER_URL", ProviderKind::Deezer),
        ("MUSICBRAINZ_URL", ProviderKind::Musicbrainz),
        ("SPOTIFY_API_URL", ProviderKind::Spotify),
    ] {
        if let Ok(url) = env::var(key) {
            let mut provider = HttpProvider::new(kind, url, None)?;
            if matches!(kind, ProviderKind::Spotify) {
                let auth=match (env::var("SPOTIFY_CLIENT_ID"),env::var("SPOTIFY_CLIENT_SECRET")) {
                    (Ok(id),Ok(secret)) => crate::spotify_auth::SpotifyAuth::client_credentials(id,secret,
                        env::var("SPOTIFY_TOKEN_URL").unwrap_or_else(|_|"https://accounts.spotify.com/api/token".into()))?,
                    _ => crate::spotify_auth::SpotifyAuth::Static(env::var("SPOTIFY_ACCESS_TOKEN")
                        .map_err(|_|anyhow::anyhow!("configure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (or SPOTIFY_ACCESS_TOKEN)"))?),
                };
                provider = provider.with_spotify_auth(auth);
            }
            providers.push(Arc::new(provider));
        }
    }
    if let Some(url) = crate::database::selected_url(
        env::var("XATA_READ_POSTGRES_URL").ok(),
        env::var("DATABASE_URL").ok(),
    ) {
        providers.push(Arc::new(crate::catalog::Catalog {
            db: crate::database::connect_read_only(&url).await?,
        }));
    }
    anyhow::ensure!(
        !providers.is_empty(),
        "configure DATABASE_URL, DEEZER_URL, MUSICBRAINZ_URL or SPOTIFY_API_URL"
    );
    let bind = env::var("MATCHING_BIND").unwrap_or_else(|_| "127.0.0.1:8096".into());
    let state = web::Data::new(Service::new(providers));
    HttpServer::new(move || App::new().app_data(state.clone()).configure(routes))
        .bind(bind)?
        .run()
        .await?;
    Ok(())
}
