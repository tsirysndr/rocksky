use crate::musicbrainz::{recording::Recordings, release::Release};
use std::cmp::Ordering;

pub mod artist;
pub mod client;
pub mod label;
pub mod recording;
pub mod release;

fn get_best_release(releases: &[Release]) -> Option<Release> {
    if releases.is_empty() {
        return None;
    }

    // Remove the single filtering - this was causing the issue
    let mut candidates: Vec<&Release> = releases.iter().collect();

    if candidates.is_empty() {
        return None;
    }

    candidates.sort_by(|a, b| cmp_release(a, b));
    candidates.first().cloned().cloned()
}

pub fn get_best_release_from_recordings(all: &Recordings, artist: &str) -> Option<Release> {
    use std::collections::HashSet;

    let mut pool: Vec<Release> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let all_recordings: Vec<&recording::Recording> = all
        .recordings
        .iter()
        .filter(|rec| {
            if let Some(credits) = &rec.artist_credit {
                artist_credit_contains(credits, artist)
            } else {
                false
            }
        })
        .collect();

    for rec in &all_recordings {
        if let Some(rels) = &rec.releases {
            for r in rels {
                if seen.insert(r.id.clone()) {
                    pool.push(r.clone());
                }
            }
        }
    }

    get_best_release(&pool)
}

fn cmp_release(a: &Release, b: &Release) -> Ordering {
    // First priority: prefer albums over singles
    let sa = is_single_release_type(a);
    let sb = is_single_release_type(b);
    if sa != sb {
        return bool_true_last(sa, sb); // Albums (false) come before singles (true)
    }

    let ta = release_tier(a.status.as_deref());
    let tb = release_tier(b.status.as_deref());
    if ta != tb {
        return ta.cmp(&tb);
    }

    let pa = has_preferred_country(a, &["XW", "US"]);
    let pb = has_preferred_country(b, &["XW", "US"]);
    if pa != pb {
        return bool_true_first(pa, pb);
    }

    let la = is_live_release(a);
    let lb = is_live_release(b);
    if la != lb {
        return bool_true_last(la, lb);
    }

    let da = date_key(a.date.as_deref());
    let db = date_key(b.date.as_deref());
    if da != db {
        return da.cmp(&db);
    }

    match a.title.cmp(&b.title) {
        Ordering::Equal => a.id.cmp(&b.id),
        ord => ord,
    }
}

fn release_tier(status: Option<&str>) -> u8 {
    match status.map(|s| s.to_ascii_lowercase()) {
        Some(s) if s == "official" => 0,
        Some(s) if s == "bootleg" => 1,
        _ => 2,
    }
}

fn bool_true_first(a: bool, b: bool) -> Ordering {
    match (a, b) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => Ordering::Equal,
    }
}

fn bool_true_last(a: bool, b: bool) -> Ordering {
    match (a, b) {
        (true, false) => Ordering::Greater,
        (false, true) => Ordering::Less,
        _ => Ordering::Equal,
    }
}

fn is_single_release_type(rel: &Release) -> bool {
    if let Some(release_group) = &rel.release_group {
        if let Some(primary_type) = &release_group.primary_type {
            if primary_type.to_ascii_lowercase() == "single" {
                return true;
            }
        }
    }

    if rel.track_count == Some(1) {
        return true;
    }
    if let Some(media) = &rel.media {
        if media.len() == 1 && media[0].track_count == 1 {
            return true;
        }
        let total: u32 = media.iter().map(|m| m.track_count).sum();
        if total == 1 {
            return true;
        }
    }
    false
}

fn has_preferred_country(rel: &Release, prefs: &[&str]) -> bool {
    if let Some(c) = rel.country.as_deref() {
        if prefs.iter().any(|p| *p == c) {
            return true;
        }
    }
    if let Some(events) = rel.release_events.as_ref() {
        for ev in events {
            if let Some(area) = &ev.area {
                if area
                    .iso_3166_1_codes
                    .iter()
                    .any(|codes| prefs.iter().any(|p| codes.contains(&p.to_string())))
                {
                    return true;
                }
            }
        }
    }
    false
}

/// Convert "YYYY[-MM[-DD]]" into YYYYMMDD (missing parts → 01). Unknown dates sort last.
fn date_key(d: Option<&str>) -> i32 {
    if let Some(d) = d {
        let mut parts = d.split('-');
        let y = parts.next().unwrap_or("9999");
        let m = parts.next().unwrap_or("01");
        let day = parts.next().unwrap_or("01");

        let y: i32 = y.parse().unwrap_or(9999);
        let m: i32 = m.parse().unwrap_or(1);
        let day: i32 = day.parse().unwrap_or(1);

        return y * 10000 + m * 100 + day;
    }
    9_999_01_01
}

fn is_live_release(rel: &Release) -> bool {
    let t_live = rel.title.to_ascii_lowercase().contains("live");
    let d_live = rel
        .disambiguation
        .as_ref()
        .map(|d| d.to_ascii_lowercase().contains("live"))
        .unwrap_or(false);
    t_live || d_live
}

fn artist_credit_contains(credits: &[artist::ArtistCredit], name: &str) -> bool {
    credits.iter().any(|c| c.name.eq_ignore_ascii_case(name))
}

#[cfg(test)]
mod tests {
    use crate::musicbrainz::client::MusicbrainzClient;
    use crate::musicbrainz::release::Media;
    use anyhow::Error;
    use serial_test::serial;

    use super::*;

    #[test]
    fn test_date_key() {
        assert_eq!(date_key(Some("2020-05-15")), 20200515);
        assert_eq!(date_key(Some("2020-05")), 20200501);
        assert_eq!(date_key(Some("2020")), 20200101);
        assert_eq!(date_key(None), 99990101);
        assert_eq!(date_key(Some("invalid-date")), 99990101);
    }

    #[test]
    fn test_is_single() {
        let rel1 = Release {
            track_count: Some(1),
            media: None,
            ..Default::default()
        };
        assert!(is_single_release_type(&rel1));
        let rel2 = Release {
            track_count: Some(2),
            media: Some(vec![
                Media {
                    track_count: 1,
                    ..Default::default()
                },
                Media {
                    track_count: 1,
                    ..Default::default()
                },
            ]),
            ..Default::default()
        };
        assert!(!is_single_release_type(&rel2));
    }

    #[tokio::test]
    #[serial]
    async fn test_get_best_release_from_recordings() -> Result<(), Error> {
        let client = MusicbrainzClient::new().await?;
        let query = format!(
            r#"recording:"{}" AND artist:"{}" AND status:Official"#,
            "Smells Like Teen Spirit", "Nirvana"
        );
        let recordings = client.search(&query).await?;
        let best = get_best_release_from_recordings(&recordings, "Nirvana");
        assert!(best.is_some());
        let best = best.unwrap();
        assert_eq!(best.title, "Nevermind");
        assert_eq!(best.status.as_deref(), Some("Official"));
        assert_eq!(best.country.as_deref(), Some("US"));

        let query = format!(
            r#"recording:"{}" AND artist:"{}" AND status:Official"#,
            "Medicine", "Joji"
        );
        let recordings = client.search(&query).await?;
        let best = get_best_release_from_recordings(&recordings, "Joji");
        assert!(best.is_some());
        let best = best.unwrap();
        assert_eq!(best.title, "Chloe Burbank Vol. 1");
        assert_eq!(best.status.as_deref(), Some("Bootleg"));
        assert_eq!(best.country.as_deref(), Some("XW"));

        let query = format!(
            r#"recording:"{}" AND artist:"{}" AND status:Official"#,
            "Don't Stay", "Linkin Park"
        );
        let recordings = client.search(&query).await?;
        let best = get_best_release_from_recordings(&recordings, "Linkin Park");
        assert!(best.is_some());
        let best = best.unwrap();
        assert_eq!(best.title, "Meteora");
        assert_eq!(best.status.as_deref(), Some("Official"));
        assert_eq!(best.country.as_deref(), Some("US"));

        Ok(())
    }
}
