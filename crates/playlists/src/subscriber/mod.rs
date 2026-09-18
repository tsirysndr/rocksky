use anyhow::Error;
use async_nats::{connect, Client};
use owo_colors::OwoColorize;
use std::{
    env,
    sync::{Arc, Mutex},
    thread,
};
use tokio_stream::StreamExt;
use types::UserPayload;

pub mod types;

pub async fn subscribe() -> Result<(), Error> {
    let addr = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let nc = connect(&addr).await?;
    println!("Connected to NATS server at {}", addr.bright_green());

    let nc = Arc::new(Mutex::new(nc));
    on_new_user(nc.clone());

    Ok(())
}

pub fn on_new_user(nc: Arc<Mutex<Client>>) {
    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let nc = nc.clone();
        rt.block_on(async {
            let nc = nc.lock().unwrap();
            let mut sub = nc.subscribe("rocksky.user".to_string()).await?;
            drop(nc);

            while let Some(msg) = sub.next().await {
                let data = String::from_utf8(msg.payload.to_vec()).unwrap();
                match serde_json::from_str::<UserPayload>(&data) {
                    Ok(payload) => {
                        // Nothing to store: this used to write the user into a
                        // local DuckDB file that nothing ever read back.
                        println!("Saw user {}{}", "@".cyan(), payload.handle.cyan());
                    }
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
