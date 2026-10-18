import gleam/option.{None, Some}
import rocksky_api/lib/helpers.{credits_artist, fold}

pub fn rejects_a_track_by_someone_else_test() {
  assert credits_artist(Some("Slipknot"), Some("Cannons"), Some("Cannons"))
    == False
}

pub fn keeps_a_collaboration_test() {
  assert credits_artist(
    Some("Princess Superstar"),
    Some("Mason, Princess Superstar"),
    Some("Mason"),
  )
}

pub fn keeps_album_artist_only_credit_test() {
  assert credits_artist(
    Some("Slipknot"),
    Some("Slipknot, Corey Taylor"),
    Some("Slipknot"),
  )
}

pub fn ignores_case_and_whitespace_test() {
  assert credits_artist(
    Some("  tones and i "),
    Some("Tones And I"),
    Some("Tones And I"),
  )
}

pub fn keeps_shorter_credit_test() {
  assert credits_artist(
    Some("Nujabes / fat jon"),
    Some("fat jon"),
    Some("fat jon"),
  )
}

pub fn folds_non_ascii_case_test() {
  assert credits_artist(Some("Sälen"), Some("SÄLEN"), Some("SÄLEN"))
}

pub fn looks_past_spelling_test() {
  assert credits_artist(Some("JAŸ-Z"), Some("JAY-Z"), None)
  assert credits_artist(
    Some("Jóhann Jóhannsson"),
    Some("Johann Johannsson"),
    None,
  )
  assert credits_artist(
    Some("The 8-Bit Big Band"),
    Some("The 8‐Bit Big Band"),
    None,
  )
}

pub fn rejects_empty_artist_name_test() {
  assert credits_artist(Some(""), Some("Cannons"), None) == False
  assert credits_artist(None, Some("Cannons"), None) == False
}

pub fn rejects_track_without_credit_test() {
  assert credits_artist(Some("Slipknot"), Some(""), None) == False
}

pub fn fold_test() {
  assert fold("Sigur Rós") == "sigur ros"
  assert fold(" Guns ’n’  Roses ") == "guns 'n' roses"
  assert fold("8‐Bit") == "8-bit"
}

pub fn record_position_test() {
  assert helpers.record_position(Some(0)) == 1
  assert helpers.record_position(None) == 1
  assert helpers.record_position(Some(-1)) == 1
  assert helpers.record_position(Some(12)) == 12
}
