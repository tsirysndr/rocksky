open Matcher

let count = ref 0

let check name c =
  incr count;
  if not c then failwith name

let () =
  let path = Filename.temp_file "matcher-catalog-" ".sqlite3" in
  Fun.protect
    ~finally:(fun () -> Sys.remove path)
    (fun () ->
      let db = Sqlite3.db_open path in
      let exec sql = Sqlite3.Rc.check (Sqlite3.exec db sql) in
      exec
        "CREATE TABLE tracks (xata_id TEXT, title TEXT, artist TEXT, album \
         TEXT, album_artist TEXT, duration INTEGER, mb_id TEXT, isrc TEXT, \
         album_art TEXT, track_number INTEGER, disc_number INTEGER, label \
         TEXT, spotify_link TEXT, genre TEXT)";
      exec "CREATE TABLE albums (xata_id TEXT, title TEXT, release_date TEXT)";
      exec "CREATE TABLE album_tracks (track_id TEXT, album_id TEXT)";
      exec
        "INSERT INTO tracks VALUES ('a','Beat It','Michael \
         Jackson','Thriller','Michael \
         Jackson',240000,'mbid','USABC1212345','art',1,1,'Epic',NULL,'pop, \
         rock')";
      exec
        "INSERT INTO tracks VALUES ('b','Wrong Title','Wrong \
         Artist','Other','Other',180000,NULL,'USABC1212345',NULL,NULL,NULL,NULL,NULL,NULL)";
      ignore (Sqlite3.db_close db);
      let url = "sqlite:" ^ path in
      let request =
        Json.request_of_json
          (Yojson.Safe.from_string
             {|{"title":"Beat It","artists":["Michael Jackson"]}|})
      in
      let provider = Catalog.create url in
      let cs = Lwt_main.run (provider.candidates request) in
      check "catalog title lookup"
        (List.length cs = 1 && (List.hd cs).Domain.id = "a");
      check "catalog metadata"
        ((List.hd cs).genres = Some [ "pop"; "rock" ]
        && (List.hd cs).duration_ms = Some 240000L);
      let requested =
        {
          request with
          identifiers =
            { Domain.empty_identifiers with isrc = Some "US-ABC-12-12345" };
        }
      in
      let cs = Lwt_main.run (provider.candidates requested) in
      check "catalog broad ISRC lookup" (List.length cs = 2);
      check "catalog IDs still validated"
        (match (Result.get_ok (Policy.resolve requested cs)).decision with
        | Domain.Matched c -> c.id = "a"
        | _ -> false);
      let cs =
        Lwt_main.run
          (provider.candidates { request with title = "' OR 1=1 --" })
      in
      check "SQL parameterization" (cs = []);
      let read_db = Sqlite3.db_open ~mode:`READONLY path in
      check "read-only SQLite"
        (Sqlite3.exec read_db "DELETE FROM tracks" = Sqlite3.Rc.READONLY);
      ignore (Sqlite3.db_close read_db);
      let missing = path ^ ".missing" in
      check "missing DB not created"
        (try
           ignore
             (Lwt_main.run
                ((Catalog.create ("sqlite:" ^ missing)).candidates request));
           false
         with _ -> not (Sys.file_exists missing)));
  check "read URL preferred"
    (Catalog.selected_url (Some "read") (Some "write") = Some "read");
  check "blank URLs ignored" (Catalog.selected_url (Some " ") None = None);
  Printf.printf "%d catalog cases passed\n" !count
