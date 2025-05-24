use std::collections::BTreeMap;

use anyhow::Error;

pub fn validate_scrobble_params(
    form: &BTreeMap<String, String>,
    required_params: &[&str],
) -> Result<Vec<String>, Error> {
    let has_artist = form.keys().any(|k| k.starts_with("artist"));
    let has_track = form.keys().any(|k| k.starts_with("track"));
    let has_timestamp = form.keys().any(|k| k.starts_with("timestamp"));

    if !has_artist {
        return Err(Error::msg(format!("Missing required parameter: artist")));
    }

    if !has_track {
        return Err(Error::msg(format!("Missing required parameter: track")));
    }

    if !has_timestamp {
        return Err(Error::msg(format!("Missing required parameter: timestamp")));
    }

    for &param in required_params {
        if !form.contains_key(param) {
            return Err(Error::msg(format!("Missing required parameter: {}", param)));
        }
    }

    Ok(required_params
        .iter()
        .map(|&s| form.get(s).unwrap().to_string())
        .collect())
}

pub fn validate_required_params(
    form: &BTreeMap<String, String>,
    required_params: &[&str],
) -> Result<Vec<String>, Error> {
    for &param in required_params {
        if !form.contains_key(param) {
            return Err(Error::msg(format!("Missing required parameter: {}", param)));
        }
    }

    Ok(required_params
        .iter()
        .map(|&s| form.get(s).unwrap().to_string())
        .collect())
}
