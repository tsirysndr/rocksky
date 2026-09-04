use actix_web::{web, HttpRequest, HttpResponse};
use serde_json::json;

use crate::{
    auth::AuthedUser,
    dto::{PublicSystemInfo, SystemInfo, JELLYFIN_API_VERSION},
    state::AppState,
};

pub async fn index(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/plain; charset=utf-8")
        .body(format!(
            "{}{}\n  server: {} ({})\n",
            crate::BANNER,
            crate::INFO,
            state.server_name,
            state.server_id
        ))
}

/// The address a client should use to reach us again. Behind the reverse proxy
/// the bound host/port is `127.0.0.1:<port>`, which is useless to a phone, so
/// prefer whatever the request actually arrived on.
pub fn server_base(state: &AppState, req: &HttpRequest) -> String {
    if let Some(host) = req.headers().get("host").and_then(|v| v.to_str().ok()) {
        let scheme = req.connection_info().scheme().to_string();
        return format!("{scheme}://{host}");
    }
    format!("http://{}:{}", state.host, state.port)
}

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "Darwin",
        "linux" => "Linux",
        "windows" => "Windows",
        "freebsd" => "FreeBSD",
        other => other,
    }
}

fn public_info(state: &AppState, req: &HttpRequest) -> PublicSystemInfo {
    PublicSystemInfo {
        local_address: Some(server_base(state, req)),
        server_name: Some(state.server_name.clone()),
        version: Some(JELLYFIN_API_VERSION.to_string()),
        product_name: Some("Jellyfin Server".to_string()),
        operating_system: Some(os_name().to_string()),
        id: Some(state.server_id.clone()),
        startup_wizard_completed: Some(true),
    }
}

pub async fn system_info_public(state: web::Data<AppState>, req: HttpRequest) -> HttpResponse {
    HttpResponse::Ok().json(public_info(&state, &req))
}

pub async fn system_info(
    _user: AuthedUser,
    state: web::Data<AppState>,
    req: HttpRequest,
) -> HttpResponse {
    let base = public_info(&state, &req);
    HttpResponse::Ok().json(SystemInfo {
        local_address: base.local_address,
        server_name: base.server_name,
        version: base.version,
        product_name: base.product_name,
        operating_system: base.operating_system,
        id: base.id,
        startup_wizard_completed: base.startup_wizard_completed,
        operating_system_display_name: Some(os_name().to_string()),
        package_name: Some("rocksky-jellyfin".to_string()),
        has_pending_restart: false,
        is_shutting_down: false,
        supports_library_monitor: false,
        web_socket_port_number: state.port as i32,
        completed_installations: Some(vec![]),
        can_self_restart: false,
        can_launch_web_browser: false,
        program_data_path: Some(String::new()),
        web_path: Some(String::new()),
        items_by_name_path: Some(String::new()),
        cache_path: Some(String::new()),
        log_path: Some(String::new()),
        internal_metadata_path: Some(String::new()),
        transcoding_temp_path: Some(String::new()),
        cast_receiver_applications: Some(vec![]),
        has_update_available: false,
        encoder_location: Some("Default".to_string()),
        system_architecture: Some(std::env::consts::ARCH.to_string()),
    })
}

pub async fn system_endpoint(_user: AuthedUser, req: HttpRequest) -> HttpResponse {
    let info = req.connection_info();
    HttpResponse::Ok().json(json!({
        "IsLocal": false,
        "IsInNetwork": false,
        "RemoteAddress": info.realip_remote_addr().unwrap_or(""),
    }))
}

/// The canonical heartbeat. The body is the bare string `"Jellyfin Server"` —
/// clients compare it literally before deciding a URL is a Jellyfin server.
pub async fn system_ping() -> HttpResponse {
    HttpResponse::Ok().json("Jellyfin Server")
}

pub async fn branding_config() -> HttpResponse {
    HttpResponse::Ok().json(json!({
        "LoginDisclaimer": "",
        "CustomCss": "",
        "SplashscreenEnabled": false,
    }))
}

pub async fn branding_css() -> HttpResponse {
    HttpResponse::Ok().content_type("text/css").body("")
}
