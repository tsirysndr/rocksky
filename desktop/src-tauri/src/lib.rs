mod cache;
mod cards;
// dsp/engine are pub so examples/boundary_probe.rs can drive the shipped
// snapshot path (smoother included) across a real track boundary.
pub mod dsp;
pub mod engine;
mod login;
mod media;
mod nfc;
mod player;
mod remote;
mod rocksky;
mod session;
mod state;

use tauri::Manager;

use cache::MediaCache;
use engine::Engine;
use state::AppState;

/// Frontend diagnostics → the app log (the webview console is not visible in
/// the dev terminal). Dev aid; harmless in release.
#[tauri::command]
fn app_log(msg: String) {
    tracing::info!(target: "webview", "{msg}");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,rocksky_desktop_lib=debug".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let engine = Engine::start()?;
            app.manage(AppState::new(engine));

            let cache_dir = app.path().app_cache_dir()?;
            let config_dir = app.path().app_config_dir()?;
            app.manage(MediaCache::new(cache_dir, config_dir));

            // OS media session (macOS Now Playing, Linux MPRIS) — must run on
            // the main thread; non-fatal when the platform has none.
            media::init(app.handle());

            // Browser-login token handoff (the CLI's localhost:6996 contract).
            login::start(app.handle());

            // NFC tag reader. Idles harmlessly when no reader is plugged in.
            app.manage(nfc::Nfc::start(app.handle()));

            // OS media session + scrobbling driven off the engine, so both keep
            // working while the window is minimized and the webview's timers
            // are throttled to a standstill.
            session::start(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_log,
            media::media_set_now_playing,
            player::player_open,
            player::player_set_queue,
            player::player_set_queue_meta,
            player::player_insert,
            player::player_queue_paths,
            player::player_set_eq_enabled,
            player::player_set_eq_band,
            player::player_set_eq_precut,
            player::player_set_tone,
            player::player_set_tone_cutoffs,
            player::player_set_crossfade,
            player::player_set_channel_mode,
            player::player_set_stereo_width,
            player::player_set_replaygain,
            player::player_set_crossfeed,
            player::player_set_pbe,
            player::player_set_compressor,
            player::player_set_surround,
            player::player_enqueue,
            player::player_play,
            player::player_pause,
            player::player_toggle,
            player::player_stop,
            player::player_next,
            player::player_previous,
            player::player_seek,
            player::player_skip_to,
            player::player_remove,
            player::player_move,
            player::player_clear_queue,
            player::player_set_volume,
            player::player_set_shuffle,
            player::player_set_repeat,
            player::player_status,
            player::player_queue,
            remote::remote_connect,
            remote::remote_disconnect,
            remote::remote_status,
            cache::cache_get_config,
            cache::cache_set_config,
            cache::cache_stats,
            cache::cache_clear,
            rocksky::scrobble_submit,
            rocksky::rocksky_feed,
            rocksky::rocksky_profile,
            rocksky::rocksky_search,
            session::session_set_token,
            session::session_set_source,
            session::session_register_tracks,
            nfc::nfc_status,
            nfc::nfc_write,
            nfc::nfc_cancel_write,
            nfc::nfc_rescan,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
