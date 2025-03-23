use std::{env, sync::Arc};

use anyhow::Error;
use sqlx::postgres::PgPoolOptions;

use crate::scan::scan_dropbox;

pub async fn scan() -> Result<(), Error> {
  let pool =  PgPoolOptions::new().max_connections(5).connect(&env::var("XATA_POSTGRES_URL")?).await?;
  let conn = Arc::new(pool);

  scan_dropbox(conn).await?;

  Ok(())
}
