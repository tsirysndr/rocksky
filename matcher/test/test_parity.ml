open Matcher

let summarize json =
  let selected =
    match Json.member "track" json with
    | `Null -> `Null
    | track -> `List [ Json.member "source" track; Json.member "id" track ]
  in
  let ranked =
    Json.list
      (fun c ->
        let track = Json.member "track" c in
        `List
          [
            Json.member "source" track;
            Json.member "id" track;
            Json.member "rank" c;
            Json.member "reasons" c;
          ])
      (Json.member "candidates" json)
  in
  let rejected =
    Json.list
      (fun c ->
        `List
          [
            Json.member "source" c;
            Json.member "id" c;
            Json.strings
              (List.sort String.compare
                 (Json.list Json.string (Json.member "reasons" c)));
          ])
      (Json.member "rejected" json)
    |> List.sort compare
  in
  `Assoc
    [
      ("status", Json.member "status" json);
      ("selected", selected);
      ("ranked", `List ranked);
      ("rejected", `List rejected);
    ]

let () =
  let fixture = Yojson.Safe.from_file "fixtures/policy.json" in
  let cases = Json.list Fun.id (Json.member "cases" fixture) in
  List.iter
    (fun case ->
      let request = Json.request_of_json (Json.member "request" case) in
      let candidates =
        Json.list Json.candidate_of_json (Json.member "candidates" case)
      in
      let response =
        Result.get_ok (Policy.resolve request candidates)
        |> Json.response_to_json |> summarize
      in
      let expected = Json.member "expected" case in
      if response <> expected then
        failwith
          ("Rust parity: "
          ^ Json.string (Json.member "name" case)
          ^ "\nexpected "
          ^ Yojson.Safe.to_string expected
          ^ "\nactual "
          ^ Yojson.Safe.to_string response))
    cases;
  Printf.printf "%d Rust parity cases passed\n" (List.length cases)
