open Domain
open Lwt.Infix

let selected_url read explicit =
  let nonblank v =
    Option.bind v (fun s -> if String.trim s = "" then None else Some s)
  in
  match nonblank read with Some _ as v -> v | None -> nonblank explicit

let select =
  "SELECT t.xata_id, t.title, t.artist, COALESCE(a.title,t.album), \
   t.album_artist, CAST(t.duration AS BIGINT), t.mb_id, t.isrc, t.album_art, \
   t.album, CAST(t.track_number AS BIGINT), CAST(t.disc_number AS BIGINT), \
   t.label, t.spotify_link, CAST(a.release_date AS TEXT), t.genre FROM tracks \
   t LEFT JOIN album_tracks at ON at.track_id=t.xata_id LEFT JOIN albums a ON \
   a.xata_id=at.album_id WHERE "

let query placeholder (r : request) =
  let params = ref [ String.trim r.title ] in
  let conditions = ref [ "LOWER(t.title)=LOWER(" ^ placeholder 1 ^ ")" ] in
  let add expression value =
    params := !params @ [ value ];
    conditions :=
      !conditions @ [ expression (placeholder (List.length !params)) ]
  in
  Option.iter
    (fun id -> add (fun p -> "LOWER(t.mb_id)=LOWER(" ^ p ^ ")") id)
    r.identifiers.musicbrainz_recording_id;
  Option.iter
    (fun id ->
      add
        (fun p -> "UPPER(REPLACE(t.isrc,'-',''))=" ^ p)
        (Policy.normalize_identifier "isrc" id))
    r.identifiers.isrc;
  ( select
    ^ String.concat " OR " !conditions
    ^ " ORDER BY t.xata_id, a.xata_id LIMIT 501",
    Array.of_list !params )

let row values =
  let value n = values.(n) and str n = Option.value ~default:"" values.(n) in
  let num n =
    Option.bind
      (Option.bind (value n) Int64.of_string_opt)
      (fun n -> if n > 0L then Some n else None)
  in
  let c =
    candidate ~source:"catalog" ~id:(str 0) ~title:(str 1) ~artists:[ str 2 ] ()
  in
  {
    c with
    album = value 3;
    album_artist = value 4;
    duration_ms = num 5;
    identifiers =
      {
        empty_identifiers with
        musicbrainz_recording_id = value 6;
        isrc = value 7;
      };
    album_art = value 8;
    version =
      (if Normalize.normalize (str 3) <> Normalize.normalize (str 9) then
         value 9
       else None);
    track_number = num 10;
    disc_number = num 11;
    label = value 12;
    spotify_link = value 13;
    release_date =
      Option.map (fun s -> List.hd (String.split_on_char 'T' s)) (value 14);
    genres = Option.map (Str.split_delim (Str.regexp_string ", ")) (value 15);
  }

let sqlite_path url =
  let raw = String.sub url 7 (String.length url - 7) in
  let raw =
    if String.starts_with ~prefix:"//" raw then
      String.sub raw 2 (String.length raw - 2)
    else raw
  in
  if raw = "" || raw = ":memory:" || String.contains raw '?' then
    invalid_arg "SQLite requires an existing file path without URI options";
  Uri.pct_decode raw

let sqlite_read url r =
  let db = Sqlite3.db_open ~mode:`READONLY (sqlite_path url) in
  Fun.protect
    ~finally:(fun () -> ignore (Sqlite3.db_close db))
    (fun () ->
      Sqlite3.busy_timeout db 7000;
      let query, params = query (fun _ -> "?") r in
      let stmt = Sqlite3.prepare db query in
      Fun.protect
        ~finally:(fun () -> ignore (Sqlite3.finalize stmt))
        (fun () ->
          Array.iteri
            (fun i v -> Sqlite3.Rc.check (Sqlite3.bind_text stmt (i + 1) v))
            params;
          let rec loop acc =
            match Sqlite3.step stmt with
            | Sqlite3.Rc.ROW ->
                let values =
                  Array.init 16 (fun i ->
                      if Sqlite3.column_is_null stmt i then None
                      else Some (Sqlite3.column_text stmt i))
                in
                loop (row values :: acc)
            | Sqlite3.Rc.DONE -> List.rev acc
            | rc ->
                Sqlite3.Rc.check rc;
                assert false
          in
          loop []))

let postgres_connection_info url =
  let uri = Uri.of_string url in
  let uri =
    Uri.add_query_param'
      (Uri.remove_query_param
         (Uri.remove_query_param uri "options")
         "connect_timeout")
      ( "options",
        "-c default_transaction_read_only=on -c statement_timeout=7000 -c \
         application_name=rocksky-matching-ocaml" )
  in
  let uri = Uri.add_query_param' uri ("connect_timeout", "5") in
  (* libpq requires '=' inside query values to be percent-encoded; Uri's
     generic serializer permits it. Encode every query component explicitly. *)
  let encode value =
    let buffer = Buffer.create (String.length value) in
    String.iter
      (function
        | ('a' .. 'z' | 'A' .. 'Z' | '0' .. '9' | '-' | '.' | '_' | '~') as c ->
            Buffer.add_char buffer c
        | c -> Buffer.add_string buffer (Printf.sprintf "%%%02X" (Char.code c)))
      value;
    Buffer.contents buffer
  in
  let query =
    Uri.query uri
    |> List.concat_map (fun (key, values) ->
        List.map (fun value -> encode key ^ "=" ^ encode value) values)
    |> String.concat "&"
  in
  Uri.to_string (Uri.with_query uri []) ^ "?" ^ query

let postgres_read url r =
  let db =
    new Postgresql.connection ~conninfo:(postgres_connection_info url) ()
  in
  Fun.protect
    ~finally:(fun () -> db#finish)
    (fun () ->
      let check =
        db#exec ~expect:[ Postgresql.Tuples_ok ] "SHOW transaction_read_only"
      in
      if check#getvalue 0 0 <> "on" then
        failwith "catalog session must be read-only";
      let query, params = query (fun i -> "$" ^ string_of_int i) r in
      let rows = db#exec ~expect:[ Postgresql.Tuples_ok ] ~params query in
      List.init rows#ntuples (fun n ->
          row
            (Array.init 16 (fun i ->
                 if rows#getisnull n i then None else Some (rows#getvalue n i)))))

let create url =
  let read =
    if String.starts_with ~prefix:"sqlite:" url then sqlite_read
    else if
      String.starts_with ~prefix:"postgres:" url
      || String.starts_with ~prefix:"postgresql:" url
    then postgres_read
    else invalid_arg "catalog URL must use sqlite or postgres"
  in
  let pool = Lwt_pool.create 5 (fun () -> Lwt.return_unit) in
  Provider.make "catalog" (fun request ->
      Lwt_pool.use pool (fun () ->
          (* A timeout must not release the DB slot while the worker still runs. *)
          Lwt.no_cancel (Lwt_preemptive.detach (fun () -> read url request) ()))
      >>= fun candidates ->
      if List.length candidates > 500 then
        Lwt.fail_with "catalog candidate limit exceeded"
      else Lwt.return candidates)
