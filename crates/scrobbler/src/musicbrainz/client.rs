use std::env;

use super::recording::{Recording, Recordings};
use anyhow::{anyhow, Context, Error};
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use tokio::time::{timeout, Duration, Instant};

pub const BASE_URL: &str = "https://musicbrainz.org/ws/2";
pub const USER_AGENT: &str = "Rocksky/0.1.0 (+https://rocksky.app)";

const Q_QUEUE: &str = "mb:queue:v1";
const CACHE_SEARCH_PREFIX: &str = "mb:cache:search:";
const CACHE_REC_PREFIX: &str = "mb:cache:rec:";
const INFLIGHT_PREFIX: &str = "mb:inflight:";
const RESP_PREFIX: &str = "mb:resp:";

const CACHE_TTL_SECS: u64 = 60 * 60 * 24;
const WAIT_TIMEOUT_SECS: u64 = 20;
const INFLIGHT_TTL_SECS: i64 = 30; // de-dup window while the worker is fetching

#[derive(Clone)]
pub struct MusicbrainzClient {
    http: reqwest::Client,
    redis: MultiplexedConnection,
    cache_ttl: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Job {
    Search { id: String, query: String },
    GetRecording { id: String, mbid: String },
}

impl MusicbrainzClient {
    pub async fn new() -> Result<Self, Error> {
        let client =
            redis::Client::open(env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".into()))?;
        let redis = client.get_multiplexed_tokio_connection().await?;
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()
            .context("build http client")?;
        let me = MusicbrainzClient {
            http,
            redis,
            cache_ttl: CACHE_TTL_SECS,
        };

        let mut worker_conn = client.get_multiplexed_async_connection().await?;

        let http = me.http.clone();
        tokio::spawn(async move { worker_loop(http, &mut worker_conn).await });

        Ok(me)
    }

    pub async fn search(&self, query: &str) -> Result<Recordings, Error> {
        if let Some(h) = self.get_cache(&cache_key_search(query)).await? {
            return Ok(serde_json::from_str(&h).context("decode cached search")?);
        }
        let id = nanoid::nanoid!();
        let job = Job::Search {
            id: id.clone(),
            query: query.to_string(),
        };
        self.enqueue_if_needed(&job, &infl_key_search(query))
            .await?;

        let raw = self.wait_for_response(&id).await?;
        let parsed: Recordings = serde_json::from_str(&raw).context("decode search response")?;

        self.set_cache(&cache_key_search(query), &raw).await?;
        Ok(parsed)
    }

    pub async fn get_recording(&self, mbid: &str) -> Result<Recording, Error> {
        if let Some(h) = self.get_cache(&cache_key_rec(mbid)).await? {
            return Ok(serde_json::from_str(&h).context("decode cached recording")?);
        }
        let id = nanoid::nanoid!();
        let job = Job::GetRecording {
            id: id.clone(),
            mbid: mbid.to_string(),
        };
        self.enqueue_if_needed(&job, &infl_key_rec(mbid)).await?;
        let raw = self.wait_for_response(&id).await?;
        let parsed: Recording = serde_json::from_str(&raw).context("decode recording response")?;
        self.set_cache(&cache_key_rec(mbid), &raw).await?;
        Ok(parsed)
    }

    // ---------- Redis helpers ----------

    async fn get_cache(&self, key: &str) -> Result<Option<String>, Error> {
        let mut r = self.redis.clone();
        let val: Option<String> = r.get(key).await?;
        Ok(val)
    }

    async fn set_cache(&self, key: &str, json: &str) -> Result<(), Error> {
        let mut r = self.redis.clone();
        let _: () = r
            .set_ex(key, json, self.cache_ttl)
            .await
            .with_context(|| format!("cache set {key}"))?;
        Ok(())
    }

    async fn enqueue_if_needed(&self, job: &Job, inflight_key: &str) -> Result<(), Error> {
        let mut r = self.redis.clone();

        // set NX to avoid duplicate work; short TTL
        let set: bool = r.set_nx(inflight_key, "1").await.context("set in-flight")?;
        if set {
            let _: () = r
                .expire(inflight_key, INFLIGHT_TTL_SECS)
                .await
                .context("expire inflight")?;
            let payload = serde_json::to_string(job).expect("serialize job");
            let _: () = r.rpush(Q_QUEUE, payload).await.context("enqueue job")?;
        }
        Ok(())
    }

    async fn wait_for_response(&self, id: &str) -> Result<String, Error> {
        let mut r = self.redis.clone();
        let resp_q = resp_key(id);

        let fut = async {
            loop {
                let popped: Option<(String, String)> = r.brpop(&resp_q, 2.0).await?;
                if let Some((_key, json)) = popped {
                    return Ok::<String, Error>(json);
                }
            }
        };

        match timeout(Duration::from_secs(WAIT_TIMEOUT_SECS), fut).await {
            Ok(res) => res,
            Err(_) => Err(anyhow!("timed out waiting for MusicBrainz response")),
        }
    }
}

async fn worker_loop(
    http: reqwest::Client,
    redis: &mut MultiplexedConnection,
) -> Result<(), Error> {
    // pacing ticker: strictly 1 request/second
    let mut next_allowed = Instant::now();

    loop {
        tokio::select! {
            res = async {

                // finite timeout pop
                let v: Option<Vec<String>> = redis.blpop(Q_QUEUE, 2.0).await.ok();
                Ok::<_, Error>(v)
            } => {
                let Some(mut v) = res? else {
                    continue };
                if v.len() != 2 {
                    continue; }
                let payload = v.pop().unwrap();

                // 1 rps pacing
                let now = Instant::now();
                if now < next_allowed { tokio::time::sleep(next_allowed - now).await; }
                next_allowed = Instant::now() + Duration::from_secs(1);

                let payload: Job = match serde_json::from_str(&payload) {
                    Ok(j) => j,
                    Err(e) => {
                        tracing::error!(%e, "invalid job payload");
                        continue;
                    }
                };
                if let Err(e) = process_job(&http, redis, payload).await {
                    tracing::error!(%e, "job failed");
                }
            }
        }
    }
}

async fn process_job(
    http: &reqwest::Client,
    redis: &mut MultiplexedConnection,
    job: Job,
) -> Result<(), Error> {
    match job {
        Job::Search { id, query } => {
            let url = format!("{}/recording", BASE_URL);
            let resp = http
                .get(&url)
                .header("Accept", "application/json")
                .query(&[
                    ("query", query.as_str()),
                    ("fmt", "json"),
                    ("inc", "artists+releases+isrcs"),
                ])
                .send()
                .await
                .context("http search")?;

            if !resp.status().is_success() {
                // Push an error payload so waiters don’t hang forever
                let _ = push_response(
                    redis,
                    &id,
                    &format!(r#"{{"error":"http {}"}}"#, resp.status()),
                )
                .await;
                return Err(anyhow!("musicbrainz search http {}", resp.status()));
            }

            let text = resp.text().await.context("read body")?;
            push_response(redis, &id, &text).await?;
        }
        Job::GetRecording { id, mbid } => {
            let url = format!("{}/recording/{}", BASE_URL, mbid);
            let resp = http
                .get(&url)
                .header("Accept", "application/json")
                .query(&[("fmt", "json"), ("inc", "artists+releases+isrcs")])
                .send()
                .await
                .context("http get_recording")?;

            if !resp.status().is_success() {
                let _ = push_response(
                    redis,
                    &id,
                    &format!(r#"{{"error":"http {}"}}"#, resp.status()),
                )
                .await;
                return Err(anyhow!("musicbrainz get_recording http {}", resp.status()));
            }

            let text = resp.text().await.context("read body")?;
            push_response(redis, &id, &text).await?;
        }
    }
    Ok(())
}

async fn push_response(
    redis: &mut MultiplexedConnection,
    id: &str,
    json: &str,
) -> Result<(), Error> {
    let q = resp_key(id);
    // RPUSH then EXPIRE to avoid leaks if a client never BRPOPs
    let _: () = redis.rpush(&q, json).await?;
    let _: () = redis.expire(&q, WAIT_TIMEOUT_SECS as i64 + 5).await?;
    Ok(())
}

fn cache_key_search(query: &str) -> String {
    format!("{}{}", CACHE_SEARCH_PREFIX, fast_hash(query))
}
fn cache_key_rec(mbid: &str) -> String {
    format!("{}{}", CACHE_REC_PREFIX, mbid)
}
fn infl_key_search(query: &str) -> String {
    format!("{}search:{}", INFLIGHT_PREFIX, fast_hash(query))
}
fn infl_key_rec(mbid: &str) -> String {
    format!("{}rec:{}", INFLIGHT_PREFIX, mbid)
}
fn resp_key(id: &str) -> String {
    format!("{}{}", RESP_PREFIX, id)
}

fn fast_hash(s: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    h.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn test_fast_hash() {
        let h1 = fast_hash("hello");
        let h2 = fast_hash("hello");
        let h3 = fast_hash("world");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
    }

    #[test]
    fn test_cache_keys() {
        let q = "test query";
        let mbid = "some-mbid";
        assert!(cache_key_search(q).starts_with(CACHE_SEARCH_PREFIX));
        assert!(cache_key_rec(mbid).starts_with(CACHE_REC_PREFIX));
        assert!(infl_key_search(q).starts_with(INFLIGHT_PREFIX));
        assert!(infl_key_rec(mbid).starts_with(INFLIGHT_PREFIX));
        assert!(resp_key("id").starts_with(RESP_PREFIX));
    }

    #[tokio::test]
    #[serial]
    async fn test_musicbrainz_client() -> Result<(), Error> {
        let client = MusicbrainzClient::new().await?;
        let query = format!(
            r#"recording:"{}" AND artist:"{}"  AND status:Official"#,
            "Come As You Are", "Nirvana"
        );
        let search_res = client.search(&query).await?;

        assert!(!search_res.recordings.is_empty());
        let rec = &search_res.recordings[0];
        let mbid = &rec.id;
        let rec_res = client.get_recording(mbid).await?;
        assert_eq!(rec_res.id, *mbid);
        Ok(())
    }
}
