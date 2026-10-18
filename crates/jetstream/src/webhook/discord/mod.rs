pub mod model;

use crate::webhook::discord::model::*;
use reqwest::Client;

pub fn embed_from_scrobble(s: &ScrobbleData, rkey: &str) -> DiscordEmbed {
    let url = format!("https://rocksky.app/{}/scrobble/{}", s.user.did, rkey);

    let mut desc = format!(
        "**[{}]({})**\nby {}",
        esc(&s.track.title),
        url,
        esc(&s.track.artist)
    );
    desc.push_str(&format!("\non *{}*", esc(&s.track.album)));

    DiscordEmbed {
        title: String::new(),
        url,
        description: Some(desc),
        timestamp: Some(s.played_at.clone()),
        thumbnail: s.track.artwork_url.clone().map(|u| DiscordThumb { url: u }),
        footer: Some(DiscordFooter {
            text: format!("Rocksky • {}", s.user.handle.clone()),
        }),
        author: s.user.display_name.as_ref().map(|name| DiscordAuthor {
            name: name.clone(),
            url: format!("https://rocksky.app/profile/{}", s.user.handle),
            icon_url: s.user.avatar_url.clone(),
        }),
    }
}

pub async fn post_embeds(
    http: &Client,
    discord_webhook_url: &str,
    embeds: Vec<DiscordEmbed>,
) -> reqwest::Result<()> {
    if discord_webhook_url.is_empty() {
        tracing::warn!("DISCORD_WEBHOOK_URL is not set, skipping webhook post");
        return Ok(());
    }

    let body = DiscordWebhookPayload {
        content: String::new(),
        embeds,
    };
    let res = http.post(discord_webhook_url).json(&body).send().await;
    if let Err(e) = &res {
        tracing::error!(error = %e, "Failed to post to Discord webhook");
        return Ok(());
    }

    let res = res.unwrap();

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        tracing::error!(error = %text, "Failed to post to Discord webhook");
    }
    Ok(())
}

fn esc(s: &str) -> String {
    s.replace(['*', '_', '~', '`', '>'], "\\$0")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nullable_display_name_is_preserved_in_events() {
        for name in [serde_json::Value::Null, serde_json::json!("Alice")] {
            let data: ScrobbleData = serde_json::from_value(serde_json::json!({
                "user": {"did": "did:plc:test", "display_name": name,
                         "handle": "alice.test", "avatar_url": ""},
                "track": {"title": "Song", "artist": "Artist", "album": "Album", "duration": 100},
                "played_at": "2026-01-02T03:04:05Z"
            }))
            .unwrap();
            assert_eq!(
                serde_json::to_value(&data).unwrap()["user"]["display_name"],
                name
            );
            let embed = serde_json::to_value(embed_from_scrobble(&data, "rkey")).unwrap();
            if name.is_null() {
                assert!(embed.get("author").is_none());
            } else {
                assert_eq!(embed["author"]["name"], name);
            }
        }
    }
}
