open Matcher

let () =
  let n =
    if Array.length Sys.argv > 1 then int_of_string Sys.argv.(1) else 500
  in
  if n < 1 || n > 10000 then invalid_arg "candidate count must be 1-10000";
  let r =
    Json.request_of_json
      (Yojson.Safe.from_string
         {|{"title":"Karma Police","artists":["Radiohead"]}|})
  in
  let candidates =
    List.init n (fun i ->
        let c =
          Domain.candidate ~source:"benchmark" ~id:(string_of_int i)
            ~title:r.title ~artists:r.artists ()
        in
        {
          c with
          album = Some "OK Computer";
          duration_ms = Some 264066L;
          identifiers =
            { Domain.empty_identifiers with isrc = Some "GBAYE9701368" };
        })
  in
  let before = Gc.allocated_bytes () in
  let start = Unix.gettimeofday () in
  let response = Result.get_ok (Policy.resolve r candidates) in
  let elapsed = Unix.gettimeofday () -. start in
  Printf.printf "%d tied candidates: %s, %.3f ms, %.2f MiB allocated\n" n
    (Json.status response.decision)
    (elapsed *. 1000.)
    ((Gc.allocated_bytes () -. before) /. 1048576.)
