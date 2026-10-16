open Matcher

let count = ref 0

let check name condition =
  incr count;
  if not condition then failwith name

let () =
  List.iter
    (fun body -> check body (Result.is_error (Json.decode_request body)))
    [
      "{}";
      "null";
      "[]";
      "{";
      {|{"artists":["A"]}|};
      {|{"title":"A"}|};
      {|{"title":"A","artists":"B"}|};
      {|{"title":"A","artists":["B"],"albm":"C"}|};
      {|{"title":"A","title":"B","artists":["C"]}|};
      {|{"title":"A","artists":["B"],"identifiers":null}|};
      {|{"title":"A","artists":["B"],"identifiers":{"foo":"a"}}|};
      {|{"title":"A","artists":["B"],"identifiers":{"isrc":"x","isrc":"y"}}|};
      {|{"title":"A","artists":["B"],"durationMs":-1}|};
      {|{"title":"A","artists":["B"],"durationMs":1.5}|};
      {|{"title":"A","artists":["B"],"durationMs":9223372036854775808}|};
      {|{"title":"A","artists":["B"],"album":""}|};
      {|{"title":"A","artists":["B"]} garbage|};
    ];
  let input =
    {|{"title":"A","artists":["B"],"durationMs":9223372036854775807,"album":null}|}
  in
  let r =
    match Json.decode_request input with Ok r -> r | Error e -> failwith e
  in
  check "int64 maximum preserved" (r.duration_ms = Some Int64.max_int);
  check "request JSON roundtrip"
    (Json.request_of_json (Json.request_to_json r) = r);
  let c =
    Domain.candidate ~source:"fixture" ~id:"a" ~title:"A" ~artists:[ "B" ] ()
  in
  let c =
    {
      c with
      duration_ms = Some Int64.max_int;
      genres = Some [ "rock" ];
      musicbrainz_artists = Some [ ("mbid", "B") ];
    }
  in
  check "candidate JSON roundtrip"
    (Json.candidate_of_json (Json.candidate_to_json c) = c);
  let response = Result.get_ok (Policy.resolve r [ c ]) in
  check "response compatible cache"
    (Cache.valid_response (Json.response_to_json response));
  let alter fields =
    match Json.response_to_json response with
    | `Assoc xs ->
        `Assoc
          (fields @ List.filter (fun (k, _) -> not (List.mem_assoc k fields)) xs)
    | _ -> assert false
  in
  List.iter
    (fun fields ->
      check "corrupt cache entry" (not (Cache.valid_response (alter fields))))
    [
      [ ("policyVersion", `String "old") ];
      [ ("track", `Null) ];
      [ ("status", `String "nope") ];
      [ ("candidates", `List []) ];
      [ ("warnings", `List [ `String "offline" ]) ];
    ];
  Printf.printf "%d JSON cases passed\n" !count
