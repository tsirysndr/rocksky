use crate::{
    queue::{digest, Conflict},
    worker::{self, Failure, Settings},
    Job, Queue,
};
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use anyhow::{ensure, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    env,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use subtle::ConstantTimeEq;
use tokio_util::sync::CancellationToken;

pub const KIND: &str = "scrobble.publish.v1";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Submission {
    pub did: String,
    pub idempotency_key: String,
    pub track: Value,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSubmission {
    did: String,
    track: Value,
    record_key: String,
}

fn new_record_key() -> String {
    // ATProto's scrobble lexicon requires a TID (13 sortable base32 chars).
    // Generate once on acceptance and persist; never regenerate in a worker.
    let micros = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_micros() as u64;
    let random = uuid::Uuid::new_v4();
    let clock = u16::from_be_bytes([random.as_bytes()[0], random.as_bytes()[1]]) as u64 & 1023;
    let mut value = (micros << 10) | clock;
    let alphabet = b"234567abcdefghijklmnopqrstuvwxyz";
    let mut output = [b'2'; 13];
    for ch in output.iter_mut().rev() {
        *ch = alphabet[(value & 31) as usize];
        value >>= 5;
    }
    String::from_utf8(output.to_vec()).unwrap()
}

pub struct Service {
    pub queue: Queue,
    pub secret: String,
}

fn authorized(req: &HttpRequest, secret: &str) -> bool {
    req.headers()
        .get("x-rocksky-submissions-secret")
        .and_then(|s| s.to_str().ok())
        .is_some_and(|s| s.as_bytes().ct_eq(secret.as_bytes()).into())
}

impl Submission {
    fn validate(&self) -> Result<()> {
        ensure!(
            self.did.starts_with("did:") && self.did.len() <= 2048,
            "invalid DID"
        );
        ensure!(
            !self.idempotency_key.is_empty() && self.idempotency_key.len() <= 512,
            "invalid idempotency key"
        );
        ensure!(self.track.is_object(), "track must be an object");
        for key in ["title", "artist", "album", "albumArtist"] {
            ensure!(
                self.track[key]
                    .as_str()
                    .is_some_and(|s| !s.trim().is_empty()),
                "missing track field {key}"
            );
        }
        ensure!(
            self.track["duration"].as_f64().is_some(),
            "invalid duration"
        );
        if !self.track["timestamp"].is_null() {
            ensure!(
                self.track["timestamp"]
                    .as_f64()
                    .is_some_and(|n| n > 0.0 && n < 253402300800.0),
                "invalid timestamp"
            );
        }
        Ok(())
    }
}

async fn submit(
    state: web::Data<Service>,
    req: HttpRequest,
    input: web::Json<Submission>,
) -> HttpResponse {
    if !authorized(&req, &state.secret) {
        return HttpResponse::Unauthorized().finish();
    }
    let mut input = input.into_inner();
    if let Err(error) = input.validate() {
        return HttpResponse::BadRequest().json(serde_json::json!({"error": error.to_string()}));
    }
    let key = serde_json::to_string(&(&input.did, &input.idempotency_key)).unwrap();
    // Fingerprint the caller's original input BEFORE assigning listening time.
    // A retry without timestamp must reuse the original accepted timestamp.
    let request_hash = digest(&serde_json::to_string(&input).unwrap());
    if input.track["timestamp"].is_null() {
        input.track["timestamp"] = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .into();
    }
    let stored = StoredSubmission {
        did: input.did,
        track: input.track,
        record_key: new_record_key(),
    };
    match state
        .queue
        .enqueue(
            KIND,
            &key,
            &request_hash,
            &serde_json::to_string(&stored).unwrap(),
        )
        .await
    {
        Ok(job) => HttpResponse::Accepted().json(job),
        Err(error) if error.is::<Conflict>() => {
            HttpResponse::Conflict().json(serde_json::json!({"error": error.to_string()}))
        }
        Err(error) => {
            tracing::error!(%error, "durable submission not accepted");
            HttpResponse::ServiceUnavailable()
                .json(serde_json::json!({"error":"submission could not be persisted"}))
        }
    }
}

async fn status(
    state: web::Data<Service>,
    req: HttpRequest,
    id: web::Path<String>,
) -> HttpResponse {
    if !authorized(&req, &state.secret) {
        return HttpResponse::Unauthorized().finish();
    }
    match state.queue.get(&id).await {
        Ok(Some(job)) => HttpResponse::Ok().json(job),
        Ok(None) => HttpResponse::NotFound().finish(),
        Err(_) => HttpResponse::ServiceUnavailable().finish(),
    }
}

async fn retry(state: web::Data<Service>, req: HttpRequest, id: web::Path<String>) -> HttpResponse {
    if !authorized(&req, &state.secret) {
        return HttpResponse::Unauthorized().finish();
    }
    match state.queue.retry(&id).await {
        Ok(true) => HttpResponse::Accepted().finish(),
        Ok(false) => HttpResponse::Conflict().finish(),
        Err(_) => HttpResponse::ServiceUnavailable().finish(),
    }
}

pub fn routes(config: &mut web::ServiceConfig) {
    config
        .app_data(web::JsonConfig::default().limit(256 * 1024))
        .route("/v1/submissions", web::post().to(submit))
        .route("/v1/jobs/{id}", web::get().to(status))
        .route("/v1/jobs/{id}/retry", web::post().to(retry));
}

async fn publish(
    queue: Queue,
    http: reqwest::Client,
    url: String,
    secret: String,
    job: Job,
) -> Result<(), Failure> {
    // Keep workflow/step versions stable across deploys. Recovery skips a
    // checkpointed publication even if the worker died before completing its job.
    if queue.step(&job, "publish-pds.v1").await?.is_some() {
        return Ok(());
    }
    let input: StoredSubmission = serde_json::from_str(&job.payload).map_err(|_| Failure {
        message: "invalid stored submission".into(),
        permanent: true,
    })?;
    let response = http.post(&url)
        .header("x-rocksky-submissions-secret", secret)
        .json(&serde_json::json!({"did": input.did, "track": input.track, "recordKey": input.record_key, "submissionId": job.id}))
        .send().await.map_err(|_| Failure { message: "API publication request failed or timed out".into(), permanent: false })?;
    let status = response.status();
    if !status.is_success() {
        return Err(Failure {
            message: format!("API publication returned HTTP {}", status.as_u16()),
            // Auth/session expiry, throttling, deployments and transport errors
            // may recover. Malformed input / permanent bot rejection do not.
            permanent: matches!(status.as_u16(), 400 | 403 | 422),
        });
    }
    // Require the worker-specific acknowledgement, not a proxy's generic 200.
    let result: Value = response.json().await.map_err(|_| Failure {
        message: "invalid publication acknowledgement".into(),
        permanent: false,
    })?;
    if result["submissionId"].as_str() != Some(job.id.as_str()) || result["status"] != "published" {
        return Err(Failure {
            message: "unexpected publication acknowledgement".into(),
            permanent: false,
        });
    }
    queue
        .checkpoint(&job, "publish-pds.v1", &result.to_string())
        .await?;
    Ok(())
}

pub async fn run() -> Result<()> {
    let secret = env::var("SUBMISSIONS_SECRET").context("SUBMISSIONS_SECRET is required")?;
    ensure!(
        secret.len() >= 32,
        "SUBMISSIONS_SECRET must contain at least 32 bytes"
    );
    let queue = Queue::from_env().await?;
    let bind = env::var("SUBMISSIONS_BIND").unwrap_or_else(|_| "127.0.0.1:8098".into());
    let api = env::var("SUBMISSIONS_API_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8000/internal/submissions/process".into());
    let concurrency: usize = env::var("SUBMISSIONS_CONCURRENCY")
        .unwrap_or_else(|_| "8".into())
        .parse()?;
    ensure!(
        (1..=256).contains(&concurrency),
        "SUBMISSIONS_CONCURRENCY must be 1..256"
    );
    let settings = Settings {
        max_attempts: env::var("SUBMISSIONS_MAX_ATTEMPTS")
            .unwrap_or_else(|_| "20".into())
            .parse()?,
        ..Settings::default()
    };
    ensure!(
        settings.max_attempts > 0,
        "SUBMISSIONS_MAX_ATTEMPTS must be positive"
    );
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()?;
    let state = web::Data::new(Service {
        queue: queue.clone(),
        secret: secret.clone(),
    });
    // Bind first so a failed startup cannot leave invisible workers running.
    let server = HttpServer::new(move || App::new().app_data(state.clone()).configure(routes))
        .disable_signals()
        .bind(bind)?
        .run();
    let handle = server.handle();
    let shutdown = CancellationToken::new();
    let mut workers = tokio::task::JoinSet::new();
    let process_queue = queue.clone();
    workers.spawn(worker::run(
        queue,
        KIND,
        concurrency,
        settings,
        shutdown.clone(),
        move |job| {
            publish(
                process_queue.clone(),
                http.clone(),
                api.clone(),
                secret.clone(),
                job,
            )
        },
    ));
    tokio::pin!(server);
    let outcome = tokio::select! {
        result = &mut server => result.map_err(anyhow::Error::from),
        _ = shutdown_signal() => { handle.stop(true).await; Ok(()) },
        _ = workers.join_next() => {
            handle.stop(true).await;
            Err(anyhow::anyhow!("submission dispatcher exited unexpectedly"))
        },
    };
    shutdown.cancel();
    // HTTP calls have a deadline; leave enough time to drain one active call.
    if tokio::time::timeout(Duration::from_secs(190), async {
        while workers.join_next().await.is_some() {}
    })
    .await
    .is_err()
    {
        workers.abort_all();
    }
    outcome
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

#[cfg(all(test, feature = "sqlite"))]
mod tests {
    use super::*;
    use actix_web::{http::StatusCode, test};

    #[actix_web::test]
    async fn acceptance_is_durable_authenticated_and_idempotent() {
        let dir = tempfile::tempdir().unwrap();
        let url = format!(
            "sqlite://{}?mode=rwc",
            dir.path().join("queue.sqlite").display()
        );
        let queue = Queue::connect(&url).await.unwrap();
        let secret = "test-only-secret-00000000000000000000";
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(Service {
                    queue: queue.clone(),
                    secret: secret.into(),
                }))
                .configure(routes),
        )
        .await;
        let mut input = serde_json::json!({
            "did":"did:plc:test", "idempotencyKey":"client-retry-key",
            "track":{"title":"Song","artist":"Artist","album":"Album","albumArtist":"Artist","duration":180000}
        });
        let request = test::TestRequest::post()
            .uri("/v1/submissions")
            .set_json(&input)
            .to_request();
        assert_eq!(
            test::call_service(&app, request).await.status(),
            StatusCode::UNAUTHORIZED
        );
        let request = test::TestRequest::post()
            .uri("/v1/submissions")
            .insert_header(("x-rocksky-submissions-secret", secret))
            .set_json(&input)
            .to_request();
        let response = test::call_service(&app, request).await;
        assert_eq!(response.status(), StatusCode::ACCEPTED);
        let response: Value = test::read_body_json(response).await;
        let id = response["id"].as_str().unwrap();
        let persisted = queue.get(id).await.unwrap().unwrap();
        let stored: StoredSubmission = serde_json::from_str(&persisted.payload).unwrap();
        assert!(stored.track["timestamp"].as_u64().unwrap() > 0);
        assert_eq!(stored.record_key.len(), 13);
        assert!(stored
            .record_key
            .bytes()
            .all(|b| b"234567abcdefghijklmnopqrstuvwxyz".contains(&b)));

        let request = test::TestRequest::post()
            .uri("/v1/submissions")
            .insert_header(("x-rocksky-submissions-secret", secret))
            .set_json(&input)
            .to_request();
        assert_eq!(
            test::call_service(&app, request).await.status(),
            StatusCode::ACCEPTED
        );
        assert_eq!(
            queue.get(id).await.unwrap().unwrap().payload,
            persisted.payload
        );
        input["track"]["title"] = "Different song".into();
        let request = test::TestRequest::post()
            .uri("/v1/submissions")
            .insert_header(("x-rocksky-submissions-secret", secret))
            .set_json(&input)
            .to_request();
        assert_eq!(
            test::call_service(&app, request).await.status(),
            StatusCode::CONFLICT
        );
    }
}
