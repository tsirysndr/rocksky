type error =
  | Invalid_request of Request.error
  | Http_status of int
  | Invalid_response
  | Unavailable

val match_track :
  ?timeout:float ->
  base_url:string ->
  Domain.request ->
  (Domain.response, error) result Lwt.t
(** Validates locally, calls POST /v1/match, and checks the response contract.
    Transport/provider failures are errors, never an unmatched decision. *)
