use rocksky_matching::*;
fn request() -> MatchRequest {
    serde_json::from_value(serde_json::json!({"title":"Beat It","artists":["Michael Jackson"]}))
        .unwrap()
}
fn track(id: &str, album: Option<&str>) -> Candidate {
    Candidate {
        source: "fixture".into(),
        id: id.into(),
        title: "Beat It".into(),
        artists: vec!["Michael Jackson".into()],
        album: album.map(str::to_owned),
        album_type: Some("album".into()),
        ..Default::default()
    }
}
fn status(r: &MatchRequest, c: Candidate) -> Status {
    resolve(r, vec![c]).unwrap().status
}

#[test]
fn minimum_request_matches() {
    assert_eq!(status(&request(), track("a", None)), Status::Matched);
}
#[test]
fn no_candidates_is_unmatched() {
    assert_eq!(
        resolve(&request(), vec![]).unwrap().status,
        Status::Unmatched
    );
}
#[test]
fn title_required() {
    assert!(serde_json::from_value::<MatchRequest>(serde_json::json!({"artists":["A"]})).is_err());
}
#[test]
fn artists_required() {
    assert!(serde_json::from_value::<MatchRequest>(serde_json::json!({"title":"A"})).is_err());
}
#[test]
fn invalid_inputs() {
    for value in ["", "  ", "---"] {
        let mut r = request();
        r.title = value.into();
        assert!(r.validate().is_err());
    }
    for artists in [
        vec![],
        vec!["".into()],
        vec!["Michael Jackson".into(), " ".into()],
    ] {
        let mut r = request();
        r.artists = artists;
        assert!(r.validate().is_err());
    }
}
#[test]
fn blank_album_is_not_silently_ignored() {
    let mut r = request();
    r.album = Some("  ".into());
    assert!(r.validate().is_err());
}
#[test]
fn punctuation_case_spacing() {
    let mut c = track("a", None);
    c.title = "  BEAT   IT! ".into();
    c.artists = vec![" MICHAEL  JACKSON ".into()];
    assert_eq!(status(&request(), c), Status::Matched);
}
#[test]
fn unicode_accents_from_webscrobbler() {
    for (a, b) in [
        ("Beyoncé", "Beyonce"),
        ("Jóhann Jóhannsson", "Johann Johannsson"),
        ("JAŸ-Z", "JAY-Z"),
        ("Sälen", "SÄLEN"),
        ("8‐Bit", "8-Bit"),
    ] {
        let mut r = request();
        r.artists = vec![a.into()];
        let mut c = track("a", None);
        c.artists = vec![b.into()];
        assert_eq!(status(&r, c), Status::Matched, "{a}");
    }
}
#[test]
fn decomposed_unicode() {
    assert_eq!(normalize("Cafe\u{301}"), normalize("Café"));
}
#[test]
fn non_latin_names_are_preserved() {
    let mut r = request();
    r.artists = vec!["宇多田ヒカル".into()];
    let mut c = track("a", None);
    c.artists = r.artists.clone();
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn substring_artist_false_positives() {
    for (a, b) in [
        ("Air", "Air Supply"),
        ("Queen", "Queens of the Stone Age"),
        ("Slipknot", "Cannons"),
    ] {
        let mut r = request();
        r.artists = vec![a.into()];
        let mut c = track("a", None);
        c.artists = vec![b.into()];
        assert_eq!(status(&r, c), Status::Unmatched);
    }
}
#[test]
fn all_requested_artists_required() {
    let mut r = request();
    r.artists.push("Guest".into());
    assert_eq!(status(&r, track("a", None)), Status::Unmatched);
}
#[test]
fn extra_credits_allowed() {
    let mut c = track("a", None);
    c.artists.push("Guest".into());
    assert_eq!(status(&request(), c), Status::Matched);
}
#[test]
fn commas_in_artist_names_not_split() {
    let mut r = request();
    r.artists = vec!["Earth, Wind & Fire".into()];
    let mut c = track("a", None);
    c.artists = vec!["Earth".into()];
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn album_artist_does_not_replace_recording_artist() {
    let mut c = track("a", None);
    c.artists = vec!["Someone Else".into()];
    c.album_artist = Some("Michael Jackson".into());
    assert_eq!(status(&request(), c), Status::Unmatched);
}
#[test]
fn different_title_rejected() {
    let mut c = track("a", None);
    c.title = "Thriller".into();
    assert_eq!(status(&request(), c), Status::Unmatched);
}
#[test]
fn substring_title_rejected() {
    let mut c = track("a", None);
    c.title = "Beat It Again".into();
    assert_eq!(status(&request(), c), Status::Unmatched);
}
// Ported from apps/api/song/albumFilter.test.ts; wrong-album fallback is intentionally reversed.
#[test]
fn requested_thriller_wins_over_first_ranked() {
    let mut r = request();
    r.album = Some("tHRiLLeR".into());
    let result = resolve(
        &r,
        vec![
            track("remaster", Some("Thriller (2003 Remaster)")),
            track("official", Some("Thriller")),
        ],
    )
    .unwrap();
    assert_eq!(result.track.unwrap().id, "official");
}
#[test]
fn missing_album_rejected_when_required() {
    let mut r = request();
    r.album = Some("Thriller".into());
    assert_eq!(status(&r, track("a", None)), Status::Unmatched);
}
#[test]
fn wrong_album_never_falls_back() {
    let mut r = request();
    r.album = Some("Bad".into());
    assert_eq!(status(&r, track("a", Some("Thriller"))), Status::Unmatched);
}
#[test]
fn album_filter_allows_safe_normalization() {
    let mut r = request();
    r.album = Some(" THRILLER  ".into());
    assert_eq!(status(&r, track("a", Some("Thriller"))), Status::Matched);
}
#[test]
fn album_version_is_not_normalized_away() {
    let mut r = request();
    r.album = Some("Thriller".into());
    assert_eq!(
        status(&r, track("a", Some("Thriller (Deluxe)"))),
        Status::Unmatched
    );
}
#[test]
fn only_remaster_is_still_rejected() {
    assert_eq!(
        status(&request(), track("a", Some("Thriller (2003 Remaster)"))),
        Status::Unmatched
    );
}
#[test]
fn unrequested_title_versions_rejected() {
    for suffix in [
        "Live",
        "Remix",
        "Radio Edit",
        "Remastered 2011",
        "Acoustic",
        "Instrumental",
        "Karaoke",
        "Demo",
        "Mono",
        "Stereo",
    ] {
        let mut c = track("a", None);
        c.title = format!("Beat It ({suffix})");
        assert_eq!(status(&request(), c), Status::Unmatched, "{suffix}");
    }
}
#[test]
fn requested_version_matches() {
    let mut r = request();
    r.title = "Beat It (Live)".into();
    let mut c = track("a", None);
    c.title = "Beat It - Live".into();
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn explicit_album_edition_is_allowed() {
    let mut r = request();
    r.album = Some("Thriller (2003 Remaster)".into());
    assert_eq!(status(&r, track("a", r.album.as_deref())), Status::Matched);
}
#[test]
fn legitimate_live_album_title_survives() {
    assert_eq!(
        status(&request(), track("hole", Some("Live Through This"))),
        Status::Matched
    );
}
#[test]
fn plain_album_over_single_from_api() {
    let a = track("album", Some("Thriller"));
    let mut b = track("single", Some("Beat It"));
    b.album_type = Some("single".into());
    assert_eq!(
        resolve(&request(), vec![b, a]).unwrap().track.unwrap().id,
        "album"
    );
}
#[test]
fn ambiguous_ties_do_not_pick_provider_order() {
    let candidates = vec![track("a", Some("Thriller")), track("b", Some("Thriller"))];
    let out = resolve(&request(), candidates.clone()).unwrap();
    let reversed = resolve(&request(), candidates.into_iter().rev().collect()).unwrap();
    assert_eq!(out.status, Status::Ambiguous);
    assert!(out.track.is_none());
    assert_eq!(
        serde_json::to_value(out).unwrap(),
        serde_json::to_value(reversed).unwrap()
    );
}
#[test]
fn duplicate_provider_record_is_not_ambiguous() {
    let c = track("a", None);
    assert_eq!(
        resolve(&request(), vec![c.clone(), c]).unwrap().status,
        Status::Matched
    );
}
fn identified() -> (MatchRequest, Candidate) {
    let mut r = request();
    r.identifiers.isrc = Some("US-ABC-12-12345".into());
    let mut c = track("a", Some("Thriller (2003 Remaster)"));
    c.identifiers.isrc = Some("USABC1212345".into());
    (r, c)
}
#[test]
fn verified_isrc_allows_remastered_album() {
    let (r, c) = identified();
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn verified_id_allows_version_suffix_on_same_song() {
    let (r, mut c) = identified();
    c.title = "Beat It (2003 Remaster)".into();
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn explicit_id_never_allows_wrong_title() {
    let (r, mut c) = identified();
    c.title = "Thriller (2003 Remaster)".into();
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn explicit_id_never_allows_wrong_artist() {
    let (r, mut c) = identified();
    c.artists = vec!["Cannons".into()];
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn explicit_id_never_allows_wrong_album() {
    let (mut r, c) = identified();
    r.album = Some("Thriller".into());
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn supplied_but_unverified_id_is_not_an_exception() {
    let (r, mut c) = identified();
    c.identifiers.isrc = None;
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn conflicting_ids_reject_even_when_one_matches() {
    let (mut r, mut c) = identified();
    r.identifiers.spotify_track_id = Some("one".into());
    c.identifiers.spotify_track_id = Some("two".into());
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn spotify_ids_are_case_sensitive() {
    let mut r = request();
    r.identifiers.spotify_track_id = Some("ABC".into());
    let mut c = track("a", None);
    c.identifiers.spotify_track_id = Some("abc".into());
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn duration_disambiguates() {
    let mut r = request();
    r.duration_ms = Some(240000);
    let mut a = track("a", None);
    a.duration_ms = Some(241000);
    let mut b = track("b", None);
    b.duration_ms = Some(180000);
    assert_eq!(resolve(&r, vec![b, a]).unwrap().track.unwrap().id, "a");
}
#[test]
fn duration_boundary() {
    let mut r = request();
    r.duration_ms = Some(200000);
    let mut c = track("a", None);
    c.duration_ms = Some(205000);
    assert_eq!(status(&r, c.clone()), Status::Matched);
    c.duration_ms = Some(205001);
    assert_eq!(status(&r, c), Status::Unmatched);
}
#[test]
fn unknown_duration_not_a_conflict() {
    let mut r = request();
    r.duration_ms = Some(200000);
    let mut c = track("a", None);
    c.duration_ms = Some(0);
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn multiple_rejection_reasons_retained() {
    let mut c = track("a", None);
    c.title = "Wrong".into();
    c.artists = vec!["Wrong".into()];
    let out = resolve(&request(), vec![c]).unwrap();
    assert!(out.rejected[0].reasons.contains(&"title_mismatch".into()));
    assert!(out.rejected[0].reasons.contains(&"artist_mismatch".into()));
}
#[test]
fn official_release_preferred_from_musicbrainz() {
    let mut a = track("official", None);
    a.release_status = Some("official".into());
    let mut b = track("bootleg", None);
    b.release_status = Some("bootleg".into());
    assert_eq!(
        resolve(&request(), vec![b, a]).unwrap().track.unwrap().id,
        "official"
    );
}
#[test]
fn oversized_input_rejected() {
    let mut r = request();
    r.title = "a".repeat(1025);
    assert!(r.validate().is_err());
}
#[test]
fn unknown_request_fields_rejected() {
    assert!(serde_json::from_value::<MatchRequest>(
        serde_json::json!({"title":"A","artists":["B"],"albm":"C"})
    )
    .is_err());
}
#[test]
fn joined_legacy_credits_require_all_names() {
    let mut r = request();
    r.artists = vec!["Mason".into(), "Princess Superstar".into()];
    let mut c = track("a", None);
    c.artists = vec!["Mason, Princess Superstar".into()];
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn explicit_mbid_allows_remaster() {
    let mut r = request();
    r.identifiers.musicbrainz_recording_id = Some("ABC-123".into());
    let mut c = track("a", Some("Thriller (Remastered)"));
    c.identifiers.musicbrainz_recording_id = Some("abc-123".into());
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn explicit_deezer_id_allows_remaster() {
    let mut r = request();
    r.identifiers.deezer_track_id = Some("123".into());
    let mut c = track("123", Some("Thriller (Remastered)"));
    c.identifiers.deezer_track_id = Some("123".into());
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn explicit_spotify_id_allows_remaster() {
    let mut r = request();
    r.identifiers.spotify_track_id = Some("abc123".into());
    let mut c = track("abc123", Some("Thriller (Remastered)"));
    c.identifiers.spotify_track_id = Some("abc123".into());
    assert_eq!(status(&r, c), Status::Matched);
}
#[test]
fn hidden_provider_version_rejected() {
    let mut c = track("a", Some("Thriller"));
    c.version = Some("2011 remaster".into());
    assert_eq!(status(&request(), c), Status::Unmatched);
}
#[test]
fn enrichment_copy_does_not_create_ambiguity() {
    let a = track("a", None);
    let mut b = a.clone();
    b.album_art = Some("https://example.test/art".into());
    assert_eq!(
        resolve(&request(), vec![a, b]).unwrap().status,
        Status::Matched
    );
}
#[test]
fn conflicting_album_artist_rejected() {
    let mut r = request();
    r.album_artist = Some("Michael Jackson".into());
    let mut c = track("a", None);
    c.album_artist = Some("Various Artists".into());
    assert_eq!(status(&r, c), Status::Unmatched);
}
// Same named examples as webscrobbler/scrobbler's network-dependent
// get_best_release_from_recordings tests, now deterministic and offline.
#[test]
fn inherited_musicbrainz_examples() {
    for (title, artist, album, status_name, country) in [
        (
            "Smells Like Teen Spirit",
            "Nirvana",
            "Nevermind",
            "official",
            "US",
        ),
        ("Medicine", "Joji", "Chloe Burbank Vol. 1", "bootleg", "XW"),
        ("Don't Stay", "Linkin Park", "Meteora", "official", "US"),
    ] {
        let mut r = request();
        r.title = title.into();
        r.artists = vec![artist.into()];
        let mut right = track("right", Some(album));
        right.title = title.into();
        right.artists = r.artists.clone();
        right.release_status = Some(status_name.into());
        right.country = Some(country.into());
        let mut other = right.clone();
        other.id = "wrong-artist".into();
        other.artists = vec!["Unrelated Artist".into()];
        let result = resolve(&r, vec![other, right]).unwrap();
        assert_eq!(result.track.unwrap().album.as_deref(), Some(album));
    }
}
#[test]
fn canonical_markers_remain_preferences_after_validation() {
    assert!(
        canonical_score(Some("Thriller"), Some("album"))
            > canonical_score(Some("Thriller (2003 Remaster)"), Some("album"))
    );
    assert!(
        canonical_score(Some("Thriller"), Some("album"))
            > canonical_score(Some("Thriller"), Some("single"))
    );
}
#[test]
fn year_before_live_marker_still_rejected() {
    assert_eq!(
        status(&request(), track("a", Some("Thriller (2003 Live)"))),
        Status::Unmatched
    );
}
#[test]
fn album_radio_edit_is_not_plain_version() {
    assert_eq!(
        status(&request(), track("a", Some("Thriller (Radio Edit)"))),
        Status::Unmatched
    );
}
#[test]
fn literal_live_in_song_name_does_not_authorize_live_album() {
    let mut r = request();
    r.title = "Live Forever".into();
    let mut c = track("a", Some("Live at Wembley"));
    c.title = r.title.clone();
    assert_eq!(status(&r, c), Status::Unmatched);
}

#[test]
fn joined_input_credit_matches_complete_structured_credits_only() {
    let mut r = request();
    r.artists = vec!["C2C, Derek Martin".into()];
    let mut c = track("credit", None);
    c.artists = vec!["C2C".into(), "Derek Martin".into()];
    assert_eq!(status(&r, c.clone()), Status::Matched);
    c.artists = vec!["C2C".into()];
    assert_eq!(status(&r, c), Status::Unmatched);
}

#[test]
fn literal_comma_band_name_is_not_split_into_substring_matches() {
    let mut r = request();
    r.artists = vec!["Earth, Wind & Fire".into()];
    let mut c = track("band", None);
    c.artists = vec!["Earth, Wind & Fire".into()];
    assert_eq!(status(&r, c.clone()), Status::Matched);
    c.artists = vec!["Earth".into()];
    assert_eq!(status(&r, c), Status::Unmatched);
}
