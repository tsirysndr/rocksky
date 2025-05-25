use std::thread;

use owo_colors::OwoColorize;
use websocket::connect_to_rocksky_websocket;

pub mod players;
pub mod websocket;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let home = dirs::home_dir().unwrap();
    let token_file = home.join(".rocksky").join("token.json");

    if !token_file.exists() {
        println!(
            "Please run {} to authenticate with Rocksky before connecting to the WebSocket",
            "`rocksky login`".magenta()
        );
        return Ok(());
    }

    let token = std::fs::read_to_string(token_file)?;
    let token: serde_json::Value = serde_json::from_str(&token)?;
    let token = token
        .get("token")
        .and_then(|t| t.as_str())
        .ok_or("Token not found")?
        .to_string();

    thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async move {
            let delay = 3;

            loop {
                match connect_to_rocksky_websocket(token.clone()).await {
                    Ok(_) => {
                        println!("WebSocket session ended cleanly");
                    }
                    Err(e) => {
                        eprintln!("WebSocket session error: {}", e);
                    }
                }

                println!("Reconnecting in {} seconds...", delay);
                tokio::time::sleep(std::time::Duration::from_secs(delay)).await;
            }
        })
    });

    // Keep the main thread alive to allow the WebSocket to run
    loop {
        std::thread::park();
    }
}
