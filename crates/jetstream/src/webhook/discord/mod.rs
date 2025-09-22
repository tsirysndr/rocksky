pub mod model;

use crate::webhook::discord::model::*;
use reqwest::Client;

pub fn embed_from_scrobble(s: &ScrobbleData, rkey: &str) -> DiscordEmbed {
    let url = format!("https://rocksky.app/{}/scrobble/{}", s.user.did, rkey);

    let mut desc = format!("**{}**\nby {}", esc(&s.track.title), esc(&s.track.artist));
    desc.push_str(&format!("\non *{}*", esc(&s.track.album)));

    DiscordEmbed {
        title: s.user.display_name.clone(),
        url,
        description: Some(desc),
        timestamp: Some(s.played_at.clone()),
        thumbnail: s.track.artwork_url.clone().map(|u| DiscordThumb { url: u }),
        footer: Some(DiscordFooter {
            text: format!("Rocksky • {}", s.user.handle.clone()),
        }),
    }
}

pub async fn post_embeds(
    http: &Client,
    discord_webhook_url: &str,
    embeds: Vec<DiscordEmbed>,
) -> reqwest::Result<()> {
    if discord_webhook_url.is_empty() {
        println!("DISCORD_WEBHOOK_URL is not set, skipping webhook post");
        return Ok(());
    }

    let body = DiscordWebhookPayload {
        content: String::new(),
        embeds,
    };
    let res = http.post(discord_webhook_url).json(&body).send().await?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        eprintln!("Failed to post to Discord webhook: {}", text);
    }
    Ok(())
}

fn esc(s: &str) -> String {
    s.replace(['*', '_', '~', '`', '>'], "\\$0")
}
