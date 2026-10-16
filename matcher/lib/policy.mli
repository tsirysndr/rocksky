val resolve :
  Domain.request ->
  Domain.candidate list ->
  (Domain.response, Request.error) result
(** Pure resolution; no network, database, or cache access. *)

val same_recording : Domain.candidate -> Domain.candidate -> bool
val normalize_identifier : string -> string -> string
