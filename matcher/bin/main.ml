open Matcher

let usage () =
  print_endline
    "Usage: matcher serve | matcher resolve INPUT.json | matcher normalize \
     TEXT\n\n\
     resolve input: \
     {\"request\":{\"title\":\"...\",\"artists\":[\"...\"]},\"candidates\":[...]}\n\
     Use - for standard input. See README.md for provider configuration."

let read_file path =
  let ic = if path = "-" then stdin else open_in_bin path in
  Fun.protect
    ~finally:(fun () -> if path <> "-" then close_in ic)
    (fun () ->
      let buffer = Buffer.create 4096 in
      let chunk = Bytes.create 4096 in
      let rec loop () =
        match input ic chunk 0 4096 with
        | 0 -> Buffer.contents buffer
        | n ->
            if Buffer.length buffer + n > 16 * 1024 * 1024 then
              failwith "input exceeds 16 MiB";
            Buffer.add_subbytes buffer chunk 0 n;
            loop ()
      in
      loop ())

let main () =
  match Array.to_list Sys.argv with
  | [ _; ("--help" | "-h") ] -> usage ()
  | [ _; "normalize"; text ] -> print_endline (Normalize.normalize text)
  | [ _; "resolve"; path ] -> (
      let json = Yojson.Safe.from_string (read_file path) in
      let request = Json.request_of_json (Json.member "request" json) in
      let candidates =
        Json.list Json.candidate_of_json (Json.member "candidates" json)
      in
      match Policy.resolve request candidates with
      | Error e -> failwith (Request.error_message e)
      | Ok response ->
          print_endline
            (Yojson.Safe.pretty_to_string (Json.response_to_json response)))
  | [ _ ] | [ _; "serve" ] ->
      let service = Config.service () in
      let bind =
        Option.value ~default:"127.0.0.1:8097" (Config.env "MATCHING_BIND")
      in
      let stop, wake = Lwt.wait () in
      let shutdown _ = if Lwt.is_sleeping stop then Lwt.wakeup_later wake () in
      let term = Lwt_unix.on_signal Sys.sigterm shutdown
      and interrupt = Lwt_unix.on_signal Sys.sigint shutdown in
      Fun.protect
        ~finally:(fun () ->
          Lwt_unix.disable_signal_handler term;
          Lwt_unix.disable_signal_handler interrupt)
        (fun () ->
          prerr_endline ("matching: listening on " ^ bind);
          Lwt_main.run (Service.serve ~stop ~bind service))
  | _ ->
      usage ();
      exit 2

let () =
  try main () with
  | Json.Decode_error message | Failure message | Invalid_argument message ->
      prerr_endline ("matcher: " ^ message);
      exit 1
  | Yojson.Json_error _ ->
      prerr_endline "matcher: invalid JSON";
      exit 1
  | _ ->
      prerr_endline "matcher: operation failed";
      exit 1
