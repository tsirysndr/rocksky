//! Isolated protocol fixture: no credentials, network service or audio device.
use crate::{
    analysis::cache::AnalysisCache,
    autodj::AutoDj,
    config::Config,
    control::Control,
    engine::Engine,
    remote::Shared,
    settings::{Baseline, SettingsSync},
};
use rocksky_sdk::{RemotePlayer, RemotePlayerConfig};
use std::sync::Arc;

pub async fn control() -> Arc<Control> {
    let mut config = Config::default();
    config.output = "fifo:/dev/null".into();
    config.resume = false;
    config.api_url = "http://127.0.0.1:1".into();
    let pc = config.player_config().unwrap();
    let baseline = Baseline::from_player_config(&pc);
    let engine = Arc::new(Engine::start(pc).unwrap());
    let cache = AnalysisCache::open(std::path::Path::new(":memory:"))
        .await
        .unwrap();
    let autodj = Arc::new(AutoDj::new(&config, cache));
    let remote = Arc::new(RemotePlayer::connect(
        RemotePlayerConfig::new("test", "protocol test").url("ws://127.0.0.1:1"),
    ));
    remote.disconnect();
    let shared = Arc::new(Shared::new(
        engine,
        remote,
        Arc::new(SettingsSync::new(baseline, autodj)),
        None,
        None,
    ));
    Control::new(shared, config, "test".into())
}
