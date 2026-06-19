use anyhow::Error;
use redis::aio::MultiplexedConnection;
use std::env;

#[derive(Clone)]
pub struct Cache {
    conn: MultiplexedConnection,
}

impl Cache {
    pub async fn new() -> Result<Self, Error> {
        let client =
            redis::Client::open(env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".into()))?;
        let conn = client.get_multiplexed_async_connection().await?;
        Ok(Cache { conn })
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>, Error> {
        let mut conn = self.conn.clone();
        let result: Option<String> = redis::cmd("GET").arg(key).query_async(&mut conn).await?;
        Ok(result)
    }

    pub async fn set(&self, key: &str, value: &str) -> Result<(), Error> {
        let mut conn = self.conn.clone();
        redis::cmd("SET")
            .arg(key)
            .arg(value)
            .query_async::<()>(&mut conn)
            .await?;
        Ok(())
    }

    pub async fn setex(&self, key: &str, value: &str, seconds: usize) -> Result<(), Error> {
        let mut conn = self.conn.clone();
        redis::cmd("SETEX")
            .arg(key)
            .arg(seconds)
            .arg(value)
            .query_async::<()>(&mut conn)
            .await?;
        Ok(())
    }

    pub async fn del(&self, key: &str) -> Result<(), Error> {
        let mut conn = self.conn.clone();
        redis::cmd("DEL")
            .arg(key)
            .query_async::<()>(&mut conn)
            .await?;
        Ok(())
    }
}
