open Lwt.Infix

type error =
  | Invalid_request of Request.error
  | Http_status of int
  | Invalid_response
  | Unavailable

let match_track ?(timeout = 10.) ~base_url request =
  match Request.validate request with
  | Error e -> Lwt.return (Error (Invalid_request e))
  | Ok () ->
      Lwt.catch
        (fun () ->
          let uri =
            Providers.endpoint (Http_io.validate_url base_url) "/v1/match"
          in
          Http_io.json ~timeout ~body:(Json.request_to_json request) `POST uri
          >|= fun json -> Ok (Json.response_of_json json))
        (function
          | Lwt.Canceled -> Lwt.fail Lwt.Canceled
          | Http_io.Http_error status -> Lwt.return (Error (Http_status status))
          | Json.Decode_error _ | Yojson.Json_error _ ->
              Lwt.return (Error Invalid_response)
          | _ -> Lwt.return (Error Unavailable))
