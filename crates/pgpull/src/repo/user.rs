use anyhow::Error;
use sqlx::{Pool, Postgres};

use crate::xata::user::User;

pub async fn get_users(pool: &Pool<Postgres>, offset: i64, limit: i64) -> Result<Vec<User>, Error> {
    let users = sqlx::query_as::<_, User>("SELECT * FROM users OFFSET $1 LIMIT $2")
        .bind(offset)
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(users)
}

pub async fn insert_user(pool: &Pool<Postgres>, user: &User) -> Result<(), Error> {
    sqlx::query(
        r#"INSERT INTO users (
        xata_id,
        display_name,
        did,
        handle,
        avatar,
        xata_createdat
    ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (xata_id) DO NOTHING"#,
    )
    .bind(&user.xata_id)
    .bind(&user.display_name)
    .bind(&user.did)
    .bind(&user.handle)
    .bind(&user.avatar)
    .bind(user.xata_createdat)
    .execute(pool)
    .await?;
    Ok(())
}
