use anyhow::Error;
use s3::{creds::Credentials, region::Region, Bucket};
use std::env;

pub async fn presign_get(r2_key: &str, expires_secs: u32) -> Result<String, Error> {
    let region = Region::Custom {
        region: env::var("S3_REGION").unwrap_or_else(|_| "auto".to_string()),
        endpoint: env::var("S3_ENDPOINT").map_err(|_| Error::msg("S3_ENDPOINT is not set"))?,
    };

    let credentials = Credentials::new(
        Some(&env::var("S3_ACCESS_KEY_ID").map_err(|_| Error::msg("S3_ACCESS_KEY_ID is not set"))?),
        Some(
            &env::var("S3_SECRET_ACCESS_KEY")
                .map_err(|_| Error::msg("S3_SECRET_ACCESS_KEY is not set"))?,
        ),
        None,
        None,
        None,
    )?;

    let bucket_name = env::var("S3_BUCKET").map_err(|_| Error::msg("S3_BUCKET is not set"))?;

    let bucket = Bucket::new(&bucket_name, region, credentials)?.with_path_style();

    let key = if r2_key.starts_with('/') {
        r2_key.to_string()
    } else {
        format!("/{}", r2_key)
    };

    let url = bucket.presign_get(&key, expires_secs, None).await?;
    Ok(url)
}
