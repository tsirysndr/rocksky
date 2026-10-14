use actix_web::{web, App, HttpServer};
use rocksky_matching::{
    providers::{HttpProvider, Provider, ProviderKind},
    service::{routes, Service},
};
use std::{env, sync::Arc};

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    let mut providers: Vec<Arc<dyn Provider>> = vec![];
    for (key, kind) in [
        ("DEEZER_URL", ProviderKind::Deezer),
        ("MUSICBRAINZ_URL", ProviderKind::Musicbrainz),
        ("SPOTIFY_API_URL", ProviderKind::Spotify),
    ] {
        if let Ok(url) = env::var(key) {
            let token = if matches!(kind, ProviderKind::Spotify) {
                Some(env::var("SPOTIFY_ACCESS_TOKEN")?)
            } else {
                None
            };
            providers.push(Arc::new(HttpProvider::new(kind, url, token)?));
        }
    }
    if let Ok(url) = env::var("DATABASE_URL") {
        providers.push(Arc::new(rocksky_matching::catalog::Catalog {
            db: rocksky_db::Backend::connect(&url).await?,
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
