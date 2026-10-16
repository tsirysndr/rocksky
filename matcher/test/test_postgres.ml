open Matcher

let run () =
  match Sys.getenv_opt "MATCHER_TEST_POSTGRES_URL" with
  | None ->
      print_endline
        "PostgreSQL integration: use python3 scripts/test_postgres.py"
  | Some url ->
      let request =
        Json.request_of_json
          (Yojson.Safe.from_string
             {|{"title":"Beat It","artists":["Michael Jackson"]}|})
      in
      let provider = Catalog.create url in
      let cs = Lwt_main.run (provider.candidates request) in
      assert (List.length cs = 1);
      assert ((List.hd cs).Domain.id = "a");
      assert ((List.hd cs).duration_ms = Some 240000L);
      let cs =
        Lwt_main.run
          (provider.candidates { request with title = "' OR 1=1 --" })
      in
      assert (cs = []);
      let ids =
        { Domain.empty_identifiers with isrc = Some "US-ABC-12-12345" }
      in
      let cs =
        Lwt_main.run (provider.candidates { request with identifiers = ids })
      in
      assert (List.length cs = 2);
      assert (
        match (Result.get_ok (Policy.resolve request cs)).decision with
        | Domain.Matched c -> c.id = "a"
        | _ -> false);
      let db =
        new Postgresql.connection
          ~conninfo:(Catalog.postgres_connection_info url)
          ()
      in
      Fun.protect
        ~finally:(fun () -> db#finish)
        (fun () ->
          let write = db#exec "DELETE FROM tracks" in
          assert (write#status = Postgresql.Fatal_error);
          let rows = db#exec "SELECT COUNT(*) FROM tracks" in
          assert (rows#getvalue 0 0 = "2"));
      print_endline "8 PostgreSQL integration cases passed"

let () =
  try run ()
  with Postgresql.Error e -> failwith (Postgresql.string_of_error e)
