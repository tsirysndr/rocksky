use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
};

type Entries = Arc<Mutex<HashMap<String, (String, Instant)>>>;
// Isolated RESP fixture: exercise the real Redis client without a production DB.
pub struct Redis {
    pub url: String,
    pub entries: Entries,
    task: tokio::task::JoinHandle<()>,
}
impl Redis {
    pub async fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("redis://{}", listener.local_addr().unwrap());
        let entries: Entries = Arc::default();
        let store = entries.clone();
        let task = tokio::spawn(async move {
            let mut connections = tokio::task::JoinSet::new();
            while let Ok((stream, _)) = listener.accept().await {
                let store = store.clone();
                connections.spawn(async move {
                    let mut stream = BufReader::new(stream);
                    loop {
                        let mut line = String::new();
                        if stream.read_line(&mut line).await.unwrap_or(0) == 0 {
                            break;
                        }
                        let Some(count) = line
                            .strip_prefix('*')
                            .and_then(|s| s.trim().parse::<usize>().ok())
                        else {
                            break;
                        };
                        let mut args = Vec::new();
                        for _ in 0..count {
                            line.clear();
                            if stream.read_line(&mut line).await.is_err() {
                                return;
                            }
                            let len = line
                                .trim()
                                .trim_start_matches('$')
                                .parse::<usize>()
                                .unwrap();
                            let mut bytes = vec![0; len + 2];
                            if stream.read_exact(&mut bytes).await.is_err() {
                                return;
                            }
                            args.push(String::from_utf8(bytes[..len].to_vec()).unwrap());
                        }
                        let reply = {
                            let mut store = store.lock().unwrap();
                            match args[0].as_str() {
                                "GET" => match store
                                    .get(&args[1])
                                    .filter(|(_, until)| *until > Instant::now())
                                {
                                    Some((value, _)) => {
                                        format!("${}\r\n{}\r\n", value.len(), value)
                                    }
                                    None => "$-1\r\n".to_owned(),
                                },
                                "SETEX" => {
                                    store.insert(
                                        args[1].clone(),
                                        (
                                            args[3].clone(),
                                            Instant::now()
                                                + Duration::from_secs(args[2].parse().unwrap()),
                                        ),
                                    );
                                    "+OK\r\n".to_owned()
                                }
                                "CLIENT" | "SELECT" => "+OK\r\n".to_owned(),
                                _ => "-ERR unsupported command\r\n".to_owned(),
                            }
                        };
                        if stream.get_mut().write_all(reply.as_bytes()).await.is_err() {
                            break;
                        }
                    }
                });
            }
        });
        Self { url, entries, task }
    }
}
impl Drop for Redis {
    fn drop(&mut self) {
        self.task.abort();
    }
}
