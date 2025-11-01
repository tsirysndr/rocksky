use anyhow::Error;
use async_nats::{Client, connect};
use duckdb::{Connection, params};
use owo_colors::OwoColorize;
use std::{
    env,
    sync::{Arc, Mutex},
    thread,
};
use tokio_stream::StreamExt;
use types::UserPayload;

pub mod types;

pub async fn subscribe(conn: Arc<Mutex<Connection>>) -> Result<(), Error> {
    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let conn = conn.clone();
    let nc = connect(&addr).await?;
    println!("Connected to NATS server at {}", addr.bright_green());

    let nc = Arc::new(Mutex::new(nc));
    on_new_user(nc.clone(), conn.clone());

    Ok(())
}

pub fn on_new_user(nc: Arc<Mutex<Client>>, conn: Arc<Mutex<Connection>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let conn = conn.clone();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.user".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<UserPayload>(&data) {
                    Ok(payload) => match save_user(conn.clone(), payload.clone()).await {
                        Ok(_) => println!(
                            "User saved successfully for {}{}",
                            "@".cyan(),
                            payload.handle.cyan()
                        ),
                        Err(e) => eprintln!("Error saving user: {}", e),
                    },
                    Err(e) => {
                        eprintln!("Error parsing payload: {}", e);
                        println!("{}", data);
                    }
                }
            }

            Ok::<(), Error>(())
        })?;

        Ok::<(), Error>(())
    });
}

pub async fn save_user(conn: Arc<Mutex<Connection>>, payload: UserPayload) -> Result<(), Error> {
    let conn = conn.lock().unwrap();

    match conn.execute(
        "INSERT INTO users (
        id,
        avatar,
        did,
        display_name,
        handle
      ) VALUES (
          ?,
          ?,
          ?,
          ?,
          ?
        )
        ON CONFLICT (id) DO UPDATE SET
        avatar = EXCLUDED.avatar,
        did = EXCLUDED.did,
        display_name = EXCLUDED.display_name,
        handle = EXCLUDED.handle",
        params![
            payload.xata_id,
            payload.avatar,
            payload.did,
            payload.display_name,
            payload.handle,
        ],
    ) {
        Ok(_) => (),
        Err(e) => {
            if !e.to_string().contains("violates primary key constraint") {
                println!("[users] error: {}", e);
                return Err(e.into());
            }
        }
    }
    Ok(())
}
