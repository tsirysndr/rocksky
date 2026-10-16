type error =
  | Invalid_title
  | Invalid_artists
  | Invalid_album
  | Invalid_album_artist
  | Invalid_duration
  | Invalid_identifier of string

val validate : Domain.request -> (unit, error) result
(** Validate without modifying the request. Returns the first error, in the same
    field order as the Rust policy. Text must be valid UTF-8, contain a Unicode
    letter or number, and occupy at most 1024 bytes. *)

val valid_text : string -> bool
val error_message : error -> string
