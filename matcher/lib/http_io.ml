open Lwt.Infix

exception Too_large
exception Http_error of int

let max_response_bytes = 2 * 1024 * 1024

let read_bounded ~limit body =
  let buffer = Buffer.create (min limit 4096) in
  let stream = Cohttp_lwt.Body.to_stream body in
  let rec loop () =
    Lwt_stream.get stream >>= function
    | None -> Lwt.return (Buffer.contents buffer)
    | Some chunk ->
        if String.length chunk > limit - Buffer.length buffer then
          Lwt.fail Too_large
        else (
          Buffer.add_string buffer chunk;
          loop ())
  in
  loop ()

let validate_url url =
  let uri = Uri.of_string url in
  if
    (not (List.mem (Uri.scheme uri) [ Some "http"; Some "https" ]))
    || Uri.host uri = None
    || Uri.userinfo uri <> None
  then
    invalid_arg
      "provider URL must use HTTP(S), with a host and no embedded credentials";
  uri

let call ?(timeout = 7.) ?(headers = Cohttp.Header.init ()) ?(body = "") meth
    uri =
  Lwt_unix.with_timeout timeout (fun () ->
      let module Connection = Cohttp_lwt_unix.Connection in
      let ctx = Lazy.force Cohttp_lwt_unix.Net.default_ctx in
      Cohttp_lwt_unix.Net.resolve ~ctx uri >>= fun endpoint ->
      let connection = Connection.create ~ctx ~persistent:false endpoint in
      Lwt.finalize
        (fun () ->
          Connection.call connection ~headers
            ~body:(Cohttp_lwt.Body.of_string body)
            meth uri
          >>= fun (response, body) ->
          let length =
            Cohttp.Header.get
              (Cohttp.Response.headers response)
              "content-length"
            |> fun value -> Option.bind value Int64.of_string_opt
          in
          if
            Option.fold ~none:false
              ~some:(fun n -> n > Int64.of_int max_response_bytes)
              length
          then Lwt.fail Too_large
          else
            read_bounded ~limit:max_response_bytes body >|= fun contents ->
            ( Cohttp.Code.code_of_status (Cohttp.Response.status response),
              contents ))
        (fun () ->
          Connection.close connection;
          Lwt.return_unit))

let json ?timeout ?headers ?(body = `Null) meth uri =
  let headers = Option.value ~default:(Cohttp.Header.init ()) headers in
  let headers = Cohttp.Header.add headers "content-type" "application/json" in
  let body = if meth = `GET then "" else Yojson.Safe.to_string body in
  call ?timeout ~headers ~body meth uri >>= fun (status, contents) ->
  if status < 200 || status >= 300 then Lwt.fail (Http_error status)
  else Lwt.return (Yojson.Safe.from_string contents)
