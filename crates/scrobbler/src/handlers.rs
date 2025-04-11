use actix_web::{post, web, HttpResponse, Responder};
use serde_json::json;
use std::collections::BTreeMap;
use crate::musicbrainz::client::MusicbrainzClient;
use crate::signature::generate_signature;
use crate::models::Scrobble;
use crate::spotify::client::SpotifyClient;

fn parse_batch(form: &BTreeMap<String, String>) -> Vec<Scrobble> {
    let mut result = vec![];
    let mut index = 0;

    loop {
        let artist = form.get(&format!("artist[{}]", index));
        let track = form.get(&format!("track[{}]", index));
        let timestamp = form.get(&format!("timestamp[{}]", index));

        if artist.is_none() || track.is_none() || timestamp.is_none() {
            break;
        }

        let album = form.get(&format!("album[{}]", index)).cloned();
        let context = form.get(&format!("context[{}]", index)).cloned();
        let stream_id = form.get(&format!("streamId[{}]", index)).cloned();
        let chosen_by_user = form.get(&format!("chosenByUser[{}]", index)).and_then(|s| s.parse().ok());
        let track_number = form.get(&format!("trackNumber[{}]", index)).and_then(|s| s.parse().ok());
        let mbid = form.get(&format!("mbid[{}]", index)).cloned();
        let album_artist = form.get(&format!("albumArtist[{}]", index)).cloned();
        let duration = form.get(&format!("duration[{}]", index)).and_then(|s| s.parse().ok());

        result.push(Scrobble {
            artist: artist.unwrap().to_string(),
            track: track.unwrap().to_string(),
            timestamp: timestamp.unwrap().parse().unwrap_or(0),
            album,
            context,
            stream_id,
            chosen_by_user,
            track_number,
            mbid,
            album_artist,
            duration,
        });

        index += 1;
    }

    result
}

#[post("/2.0")]
pub async fn scrobble(form: web::Form<BTreeMap<String, String>>) -> impl Responder {
    /*
    let secret = "your_app_secret";
    let sig_check = generate_signature(&form, secret);
    if form.get("api_sig").map(String::as_str) != Some(&sig_check) {
        return HttpResponse::Forbidden().json(json!({
            "error": 13,
            "message": "Invalid API signature"
        }));
    }
    */

    let method = form.get("method").map(String::as_str);
    if method != Some("track.scrobble") {
        return HttpResponse::BadRequest().json(json!({
            "error": 3,
            "message": "Method not supported"
        }));
    }

    let scrobbles = parse_batch(&form);

    if scrobbles.is_empty() {
        return HttpResponse::BadRequest().json(json!({
            "error": 6,
            "message": "Missing or invalid scrobble fields"
        }));
    }

    // You can now save these scrobbles to your database here.
    let client = MusicbrainzClient::new();
    // let result = client.get_recording("47fb34da-5d07-4772-8cdb-af352699ee67").await;
    let result = client.search(r#"
        recording:"Don't stay" AND artist:"Linkin Park"
    "#).await;
    println!("Musicbrainz result: {:#?}", result);

    /*
    let client = SpotifyClient::new("BQDhXOoiiSNCmmOKFvtvpuT3gwXJGOdXvjpkfb4JTc8GPLhNOhLrgy_tAVA7i8c3VipA4mbQfwvc9rAGDaNyzpVw26SXtQXFMNw_na2VRAeBXMcHMqrJ-Cfg4XQoLzAvQwX8RkuRAKtaBpMSFtwiHYHeYj2GybiqinRZ8ZDNRzIn3GvoYQjcYqfEKR39iNHtlToDPkdPxO1caZh8DDc2VltMLxOUyNs8po_OLpp6-7WgED3_CmHEbOfdc_DD4-btRcsmvri8O58lOioxBgCgrKx0Ww-xq7oNk0-mdDJcUat805Fuh2PHRIoWK2rOLtbVAtU8PnpfLzUbbiejxBfXubl5J3EST7tB9N_OkVz8ZQs92tp-QQk");
    let results = match client.search("track:one more time artist:daft punk").await {
        Ok(res) => res,
        Err(e) => {
            return HttpResponse::InternalServerError().json(json!({
                "error": 9,
                "message": format!("Internal server error: {}", e)
            }));
        }
    };

    println!("Search results: {:?}", results);
     */

    let response = json!({
        "scrobbles": {
            "@attr": {
                "accepted": scrobbles.len().to_string(),
                "ignored": "0"
            },
            "scrobble": scrobbles.iter().map(|s| json!({
                "artist": { "#text": s.artist, "corrected": "0" },
                "track": { "#text": s.track, "corrected": "0" },
                "album": { "#text": s.album.clone().unwrap_or_default(), "corrected": "0" },
                "timestamp": s.timestamp.to_string(),
                "ignoredMessage": { "#text": "", "code": "0" }
            })).collect::<Vec<_>>()
        }
    });

    HttpResponse::Ok().json(response)
}
