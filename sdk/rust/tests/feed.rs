//! Feed resource tests.

mod common;

use common::{mock_client, mock_client_with_token};
use serde_json::json;
use wiremock::matchers::{method, path, query_param};
use wiremock::{Mock, ResponseTemplate};

#[tokio::test]
async fn search_returns_heterogeneous_hits() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.search"))
        .and(query_param("query", "kate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "hits": [
                {"type": "song", "title": "Wuthering Heights"},
                {"type": "artist", "name": "Kate Bush"}
            ],
            "estimatedTotalHits": 2,
            "processingTimeMs": 7,
        })))
        .mount(&server)
        .await;

    let results = client.feed().search("kate").await.unwrap();
    assert_eq!(results.hits.len(), 2);
    assert_eq!(results.estimated_total_hits, Some(2));
    assert_eq!(results.processing_time_ms, Some(7));
    assert_eq!(results.hits[0]["type"], "song");
}

#[tokio::test]
async fn get_feed_with_cursor() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.getFeed"))
        .and(query_param("feed", "at://generator"))
        .and(query_param("cursor", "abc"))
        .and(query_param("limit", "25"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "feed": [{"scrobble": {"id": "s1", "title": "T"}}],
            "cursor": "next",
        })))
        .mount(&server)
        .await;

    let f = client
        .feed()
        .get("at://generator")
        .cursor("abc")
        .limit(25)
        .send()
        .await
        .unwrap();
    assert_eq!(f.cursor.as_deref(), Some("next"));
    assert_eq!(f.feed.len(), 1);
    assert!(f.feed[0].scrobble.is_some());
}

#[tokio::test]
async fn stories_with_feed_and_following_filters() {
    let (server, client) = mock_client_with_token("tkn").await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.getStories"))
        .and(query_param("size", "10"))
        .and(query_param(
            "feed",
            "at://did:plc:abc/app.rocksky.feed.generator/metalcore",
        ))
        .and(query_param("following", "true"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "stories": [{
                "id": "st1",
                "handle": "alice.bsky.social",
                "title": "Heaven",
                "artist": "BMTH",
            }],
        })))
        .mount(&server)
        .await;

    let stories = client
        .feed()
        .stories()
        .size(10)
        .feed("at://did:plc:abc/app.rocksky.feed.generator/metalcore")
        .following(true)
        .send()
        .await
        .unwrap();
    assert_eq!(stories.len(), 1);
    assert_eq!(stories[0].artist.as_deref(), Some("BMTH"));
}

#[tokio::test]
async fn recommendations_unwraps_inner_array() {
    let (server, client) = mock_client().await;
    Mock::given(method("GET"))
        .and(path("/xrpc/app.rocksky.feed.getRecommendations"))
        .and(query_param("did", "did:plc:alice"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "recommendations": [{
                "title": "Suggested",
                "artist": "X",
                "recommendationScore": 88,
                "source": "knn",
            }],
            "cursor": null,
        })))
        .mount(&server)
        .await;

    let r = client
        .feed()
        .recommendations("did:plc:alice")
        .send()
        .await
        .unwrap();
    assert_eq!(r.recommendations.len(), 1);
    assert_eq!(r.recommendations[0].recommendation_score, Some(88));
    assert_eq!(r.recommendations[0].source.as_deref(), Some("knn"));
}
