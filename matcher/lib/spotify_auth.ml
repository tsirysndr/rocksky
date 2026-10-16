open Lwt.Infix

type credentials = {
  client_id : string;
  secret : string;
  endpoint : Uri.t;
  lock : Lwt_mutex.t;
  mutable cached : (string * float) option;
}

type t = Static of string | Credentials of credentials

let credentials ~client_id ~secret ~endpoint =
  if String.trim client_id = "" || String.trim secret = "" then
    invalid_arg "Spotify credentials must not be blank";
  let uri = Http_io.validate_url endpoint in
  if
    Uri.scheme uri <> Some "https"
    && not
         (List.mem (Uri.host uri)
            [ Some "127.0.0.1"; Some "localhost"; Some "::1" ])
  then invalid_arg "Spotify token endpoint requires HTTPS";
  Credentials
    {
      client_id;
      secret;
      endpoint = uri;
      lock = Lwt_mutex.create ();
      cached = None;
    }

let token = function
  | Static token -> Lwt.return token
  | Credentials c ->
      Lwt_mutex.with_lock c.lock (fun () ->
          match c.cached with
          | Some (token, expiry) when expiry > Unix.gettimeofday () ->
              Lwt.return token
          | _ ->
              let started = Unix.gettimeofday () in
              let auth =
                "Basic " ^ Base64.encode_exn (c.client_id ^ ":" ^ c.secret)
              in
              let headers =
                Cohttp.Header.of_list
                  [
                    ("authorization", auth);
                    ("content-type", "application/x-www-form-urlencoded");
                  ]
              in
              Http_io.call ~headers ~body:"grant_type=client_credentials" `POST
                c.endpoint
              >>= fun (status, body) ->
              if status <> 200 then Lwt.fail_with "Spotify token request failed"
              else
                let json = Yojson.Safe.from_string body in
                let access = Json.string (Json.member "access_token" json) in
                let kind = Json.string (Json.member "token_type" json) in
                let expires = Json.unsigned (Json.member "expires_in" json) in
                if
                  access = ""
                  || String.lowercase_ascii kind <> "bearer"
                  || expires <= 0L || expires > 604800L
                then Lwt.fail_with "Invalid Spotify token response"
                else (
                  c.cached <-
                    Some
                      (access, started +. max 0. (Int64.to_float expires -. 30.));
                  Lwt.return access))

let invalidate auth rejected =
  match auth with
  | Static _ -> Lwt.return_unit
  | Credentials c ->
      Lwt_mutex.with_lock c.lock (fun () ->
          (match c.cached with
          | Some (token, _) when token = rejected -> c.cached <- None
          | _ -> ());
          Lwt.return_unit)

let get auth uri =
  let rec attempt retry =
    token auth >>= fun access ->
    let headers =
      Cohttp.Header.init_with "authorization" ("Bearer " ^ access)
    in
    Lwt.catch
      (fun () -> Http_io.json ~headers `GET uri)
      (function
        | Http_io.Http_error 401
          when retry && match auth with Credentials _ -> true | _ -> false ->
            invalidate auth access >>= fun () -> attempt false
        | e -> Lwt.fail e)
  in
  attempt true
