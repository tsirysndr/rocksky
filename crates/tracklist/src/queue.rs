use anyhow::Error;
use rand::seq::SliceRandom;
use redis::AsyncCommands;

pub async fn add_track(
    client: &redis::Client,
    did: &str,
    track_id: &str,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    conn.rpush::<_, _, i32>(format!("user:{}:queue", did), track_id)
        .await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;

    Ok(queue)
}

pub async fn insert_track_at(
    client: &redis::Client,
    did: &str,
    position: usize,
    track_id: &str,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;

    let mut new_queue = queue.clone();
    if position >= new_queue.len() {
        new_queue.push(track_id.to_string());
    } else {
        new_queue.insert(position, track_id.to_string());
    }

    let mut pipeline = redis::pipe();
    pipeline
        .atomic()
        .del(format!("user:{}:queue", did))
        .rpush(format!("user:{}:queue", did), new_queue.clone())
        .query_async::<()>(&mut conn)
        .await?;

    Ok(new_queue)
}

pub async fn remove_track_at(
    client: &redis::Client,
    did: &str,
    position: usize,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;
    if position < queue.len() {
        let _: i32 = conn
            .lrem::<_, _, i32>(format!("user:{}:queue", did), 1, &queue[position])
            .await?;
    }

    let new_queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;
    Ok(new_queue)
}

pub async fn shuffle_queue(client: &redis::Client, did: &str) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let mut queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;
    let old_queue = queue.clone();

    loop {
        let mut rng = rand::rng();
        queue.shuffle(&mut rng);
        if queue != old_queue {
            break;
        }
    }

    redis::pipe()
        .atomic()
        .del(format!("user:{}:queue", did))
        .rpush(format!("user:{}:queue", did), queue.clone())
        .query_async::<()>(&mut conn)
        .await?;

    Ok(queue)
}

pub async fn get_queue(client: &redis::Client, did: &str) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;
    Ok(queue)
}

pub async fn clear_queue(client: &redis::Client, did: &str) -> Result<(), Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    redis::pipe()
        .atomic()
        .del(format!("user:{}:queue", did))
        .query_async::<()>(&mut conn)
        .await?;

    Ok(())
}

pub async fn get_queue_length(client: &redis::Client, did: &str) -> Result<usize, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let length: usize = conn.llen(format!("user:{}:queue", did)).await?;
    Ok(length)
}

pub async fn is_queue_empty(client: &redis::Client, did: &str) -> Result<bool, Error> {
    let length = get_queue_length(client, did).await?;
    Ok(length == 0)
}

pub async fn set_current_track(
    client: &redis::Client,
    did: &str,
    position: usize,
) -> Result<(), Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    conn.set::<_, _, ()>(format!("user:{}:current_track", did), position)
        .await?;

    Ok(())
}

pub async fn get_current_track(client: &redis::Client, did: &str) -> Result<Option<usize>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let position: Option<usize> = conn
        .get::<_, Option<usize>>(format!("user:{}:current_track", did))
        .await?;

    Ok(position)
}

pub async fn clear_current_track(client: &redis::Client, did: &str) -> Result<(), Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    conn.del::<_, ()>(format!("user:{}:current_track", did))
        .await?;

    Ok(())
}

pub async fn move_track(
    client: &redis::Client,
    did: &str,
    from: usize,
    to: usize,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;
    if from >= queue.len() || to >= queue.len() {
        return Ok(queue);
    }

    let mut new_queue = queue.clone();
    let track = new_queue.remove(from);
    new_queue.insert(to, track);

    redis::pipe()
        .atomic()
        .del(format!("user:{}:queue", did))
        .rpush(format!("user:{}:queue", did), new_queue.clone())
        .query_async::<()>(&mut conn)
        .await?;

    Ok(new_queue)
}

pub async fn replace_queue(
    client: &redis::Client,
    did: &str,
    new_queue: Vec<String>,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    redis::pipe()
        .atomic()
        .del(format!("user:{}:queue", did))
        .rpush(format!("user:{}:queue", did), new_queue.clone())
        .query_async::<()>(&mut conn)
        .await?;

    Ok(new_queue)
}

pub async fn get_track_at(
    client: &redis::Client,
    did: &str,
    position: usize,
) -> Result<Option<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let track: Option<String> = conn
        .lindex::<_, Option<String>>(format!("user:{}:queue", did), position as isize)
        .await?;

    Ok(track)
}

pub async fn insert_tracks_at(
    client: &redis::Client,
    did: &str,
    position: usize,
    track_ids: Vec<String>,
) -> Result<Vec<String>, Error> {
    let mut conn = client.get_multiplexed_async_connection().await?;

    let queue: Vec<String> = conn.lrange(format!("user:{}:queue", did), 0, -1).await?;

    let mut new_queue = queue.clone();
    if position >= new_queue.len() {
        new_queue.extend(track_ids);
    } else {
        for (i, track_id) in track_ids.into_iter().enumerate() {
            new_queue.insert(position + i, track_id);
        }
    }

    let mut pipeline = redis::pipe();
    pipeline
        .atomic()
        .del(format!("user:{}:queue", did))
        .rpush(format!("user:{}:queue", did), new_queue.clone())
        .query_async::<()>(&mut conn)
        .await?;

    Ok(new_queue)
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::Error;
    use redis::AsyncCommands;
    use uuid::Uuid;

    async fn setup_redis() -> redis::Client {
        redis::Client::open("redis://localhost:6379/").expect("Failed to create Redis client")
    }

    async fn cleanup(client: &redis::Client, did: &str) -> Result<(), Error> {
        let mut conn = client.get_multiplexed_async_connection().await?;
        conn.del::<_, ()>(format!("user:{}:queue", did)).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_add_track() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_id = "track:67890";

        // Add a track
        add_track(&client, &did, track_id).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec![track_id]);

        // Add another track
        let track_id2 = "track:67891";
        add_track(&client, &did, track_id2).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec![track_id, track_id2]);

        // Cleanup
        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_insert_track_at() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        let new_track = "track:67893";
        insert_track_at(&client, &did, 1, new_track).await?;
        let queue: Vec<String> = get_queue(&client, &did).await?;
        assert_eq!(
            queue,
            vec!["track:67890", "track:67893", "track:67891", "track:67892"]
        );

        let end_track = "track:67894";
        insert_track_at(&client, &did, 10, end_track).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(
            queue,
            vec![
                "track:67890",
                "track:67893",
                "track:67891",
                "track:67892",
                "track:67894"
            ]
        );

        let new_did = Uuid::new_v4().to_string();
        insert_track_at(&client, &new_did, 0, "track:67895").await?;
        let queue = get_queue(&client, &new_did).await?;
        assert_eq!(queue, vec!["track:67895"]);

        cleanup(&client, &did).await?;
        cleanup(&client, &new_did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_remove_track_at() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        remove_track_at(&client, &did, 1).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67890", "track:67892"]);

        remove_track_at(&client, &did, 0).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67892"]);

        remove_track_at(&client, &did, 5).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67892"]);

        let new_did = Uuid::new_v4().to_string();
        remove_track_at(&client, &new_did, 0).await?;
        let queue = get_queue(&client, &new_did).await?;
        assert_eq!(queue, Vec::<String>::new());

        cleanup(&client, &did).await?;
        cleanup(&client, &new_did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_shuffle_queue() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        shuffle_queue(&client, &did).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue.len(), track_ids.len());
        assert!(track_ids.iter().all(|id| queue.contains(&id.to_string())));

        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_get_queue() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891"];

        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, Vec::<String>::new());

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, track_ids);

        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_clear_queue() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        clear_queue(&client, &did).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, Vec::<String>::new());

        clear_queue(&client, &did).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, Vec::<String>::new());

        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_queue_length_and_empty() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891"];

        let length = get_queue_length(&client, &did).await?;
        assert_eq!(length, 0);
        let is_empty = is_queue_empty(&client, &did).await?;
        assert!(is_empty);

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        let length = get_queue_length(&client, &did).await?;
        assert_eq!(length, track_ids.len());
        let is_empty = is_queue_empty(&client, &did).await?;
        assert!(!is_empty);

        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_current_track() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891"];
        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }
        let current = get_current_track(&client, &did).await?;
        assert_eq!(current, None);
        set_current_track(&client, &did, 1).await?;
        let current = get_current_track(&client, &did).await?;
        assert_eq!(current, Some(1));
        clear_current_track(&client, &did).await?;
        let current = get_current_track(&client, &did).await?;
        assert_eq!(current, None);
        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_move_track() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        move_track(&client, &did, 0, 2).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67891", "track:67892", "track:67890"]);
        move_track(&client, &did, 2, 0).await?;

        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67890", "track:67891", "track:67892"]);
        move_track(&client, &did, 1, 1).await?;

        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67890", "track:67891", "track:67892"]);
        move_track(&client, &did, 5, 0).await?;

        let queue = get_queue(&client, &did).await?;
        assert_eq!(queue, vec!["track:67890", "track:67891", "track:67892"]);

        let new_did = Uuid::new_v4().to_string();
        move_track(&client, &new_did, 0, 1).await?;

        let queue = get_queue(&client, &new_did).await?;
        assert_eq!(queue, Vec::<String>::new());

        cleanup(&client, &did).await?;
        cleanup(&client, &new_did).await?;

        Ok(())
    }

    #[tokio::test]
    async fn test_replace_queue() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let initial_tracks = vec!["track:67890", "track:67891"];

        for &track_id in &initial_tracks {
            add_track(&client, &did, track_id).await?;
        }

        let new_queue = vec![
            "track:67892".to_string(),
            "track:67893".to_string(),
            "track:67894".to_string(),
        ];

        replace_queue(&client, &did, new_queue.clone()).await?;
        let queue = get_queue(&client, &did).await?;

        assert_eq!(queue, new_queue);
        cleanup(&client, &did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_get_track_at() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        for &track_id in &track_ids {
            add_track(&client, &did, track_id).await?;
        }

        let track = get_track_at(&client, &did, 1).await?;
        assert_eq!(track, Some("track:67891".to_string()));

        let track = get_track_at(&client, &did, 5).await?;
        assert_eq!(track, None);

        let new_did = Uuid::new_v4().to_string();
        let track = get_track_at(&client, &new_did, 0).await?;
        assert_eq!(track, None);

        cleanup(&client, &did).await?;
        cleanup(&client, &new_did).await?;

        Ok(())
    }

    #[tokio::test]
    async fn test_insert_tracks_at() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let initial_tracks = vec!["track:67890", "track:67891"];

        for &track_id in &initial_tracks {
            add_track(&client, &did, track_id).await?;
        }

        let new_tracks = vec!["track:67892".to_string(), "track:67893".to_string()];
        insert_tracks_at(&client, &did, 1, new_tracks.clone()).await?;
        let queue = get_queue(&client, &did).await?;

        assert_eq!(
            queue,
            vec!["track:67890", "track:67892", "track:67893", "track:67891"]
        );

        let end_tracks = vec!["track:67894".to_string()];
        insert_tracks_at(&client, &did, 10, end_tracks.clone()).await?;
        let queue = get_queue(&client, &did).await?;
        assert_eq!(
            queue,
            vec![
                "track:67890",
                "track:67892",
                "track:67893",
                "track:67891",
                "track:67894"
            ]
        );
        let new_did = Uuid::new_v4().to_string();
        let new_tracks = vec!["track:67895".to_string(), "track:67896".to_string()];
        insert_tracks_at(&client, &new_did, 0, new_tracks.clone()).await?;

        let queue = get_queue(&client, &new_did).await?;
        assert_eq!(queue, new_tracks);

        cleanup(&client, &did).await?;
        cleanup(&client, &new_did).await?;
        Ok(())
    }

    #[tokio::test]
    async fn test_concurrent_operations() -> Result<(), Error> {
        let client = setup_redis().await;
        let did = Uuid::new_v4().to_string();
        let track_ids = vec!["track:67890", "track:67891", "track:67892"];

        let add_task = add_track(&client, &did, track_ids[0]);
        let insert_task = insert_track_at(&client, &did, 0, track_ids[1]);
        let remove_task = remove_track_at(&client, &did, 0);
        tokio::try_join!(add_task, insert_task, remove_task)?;

        let queue = get_queue(&client, &did).await?;
        assert!(queue.len() <= 2);
        assert!(track_ids.iter().any(|id| queue.contains(&id.to_string())));

        cleanup(&client, &did).await?;
        Ok(())
    }
}
