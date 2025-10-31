use anyhow::Error;
use redis::Client;
use std::env;

#[derive(Clone)]
pub struct Cache {
    pub client: Client,
}

impl Cache {
    pub fn new() -> Result<Self, Error> {
        let client =
            redis::Client::open(env::var("REDIS_URL").unwrap_or("redis://127.0.0.1".into()))?;
        Ok(Cache { client })
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, Error> {
        let mut con = self.client.get_connection()?;
        let result: Option<String> = redis::cmd("GET").arg(key).query(&mut con)?;
        Ok(result)
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), Error> {
        let mut con = self.client.get_connection()?;
        redis::cmd("SET")
            .arg(key)
            .arg(value)
            .query::<()>(&mut con)?;
        Ok(())
    }

    pub fn setex(&self, key: &str, value: &str, seconds: usize) -> Result<(), Error> {
        let mut con = self.client.get_connection()?;
        redis::cmd("SETEX")
            .arg(key)
            .arg(seconds)
            .arg(value)
            .query::<()>(&mut con)?;
        Ok(())
    }

    pub fn del(&self, key: &str) -> Result<(), Error> {
        let mut con = self.client.get_connection()?;
        redis::cmd("DEL").arg(key).query::<()>(&mut con)?;
        Ok(())
    }

    pub fn exists(&self, key: &str) -> Result<bool, Error> {
        let mut con = self.client.get_connection()?;
        let result: bool = redis::cmd("EXISTS").arg(key).query(&mut con)?;
        Ok(result)
    }
}
