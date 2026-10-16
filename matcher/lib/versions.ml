module Strings = Set.Make (String)

let normalize = Normalize.normalize
let words s = String.split_on_char ' ' (normalize s)

let split_once delimiter s =
  let n = String.length delimiter in
  let rec find i =
    if i + n > String.length s then None
    else if String.sub s i n = delimiter then
      Some (String.sub s 0 i, String.sub s (i + n) (String.length s - i - n))
    else find (i + 1)
  in
  find 0

let editions s =
  words s
  |> List.filter_map (function
    | "remaster" | "remastered" -> Some "remaster"
    | "remix" | "remixed" | "remixes" -> Some "remix"
    | "edit" | "edited" -> Some "edit"
    | ( "live" | "acoustic" | "instrumental" | "karaoke" | "demo" | "mono"
      | "stereo" | "deluxe" | "expanded" | "anniversary" | "clean" | "explicit"
      | "extended" | "rerecorded" | "slowed" | "nightcore" ) as s ->
        Some s
    | _ -> None)
  |> Strings.of_list

let album_editions s =
  let folded = Normalize.fold s in
  List.fold_left
    (fun flags marker ->
      let annotated =
        List.exists
          (fun delimiter ->
            match split_once delimiter folded with
            | Some (_, suffix) -> Strings.mem marker (editions suffix)
            | None -> false)
          [ "("; "["; " - " ]
      in
      if
        annotated
        || marker = "live"
           && (String.starts_with ~prefix:"live at " folded
              || String.starts_with ~prefix:"live in " folded)
      then flags
      else Strings.remove marker flags)
    (editions s)
    [ "live"; "demo"; "remix"; "acoustic"; "instrumental"; "karaoke"; "edit" ]

let version_base s =
  let folded = Normalize.fold s in
  let rec find = function
    | [] -> normalize s
    | delimiter :: rest -> (
        match split_once delimiter folded with
        | Some (base, suffix) when not (Strings.is_empty (editions suffix)) ->
            normalize base
        | _ -> find rest)
  in
  find [ " ("; " ["; " - " ]

let subtitle_base s =
  let s = String.trim s in
  let forbidden =
    [
      "version";
      "mix";
      "take";
      "session";
      "sessions";
      "radio";
      "feat";
      "featuring";
      "ft";
      "with";
      "solo";
      "duet";
      "part";
      "pt";
      "movement";
      "reprise";
      "dub";
      "vocal";
      "vocals";
      "bonus";
      "outtake";
      "rehearsal";
      "sped";
      "speed";
    ]
  in
  let rec find = function
    | [] -> None
    | (opening, closing) :: rest -> (
        match split_once opening s with
        | Some (base, suffix) when String.ends_with ~suffix:closing suffix ->
            let sub = String.sub suffix 0 (String.length suffix - 1) in
            if
              String.trim base = ""
              || String.trim sub = ""
              || String.exists (fun c -> List.mem c [ '('; ')'; '['; ']' ]) sub
              || (not (Strings.is_empty (editions sub)))
              || List.exists (fun w -> List.mem w forbidden) (words sub)
            then find rest
            else Some (normalize base)
        | _ -> find rest)
  in
  find [ (" (", ")"); (" [", "]") ]

let titles_match a b =
  let na, nb = (normalize a, normalize b) in
  na = nb || subtitle_base a = Some nb || subtitle_base b = Some na

let canonical_score album album_type =
  let score =
    match album_type with Some "album" -> 2 | Some _ -> -1 | None -> 0
  in
  let markers =
    [
      "remaster";
      "remastered";
      "live";
      "deluxe";
      "single";
      "demo";
      "acoustic";
      "instrumental";
      "karaoke";
      "anniversary";
      "expanded";
      "edition";
      "remix";
      "remixes";
      "mono";
      "stereo";
      "reissue";
      "bside";
      "bsides";
      "soundtrack";
    ]
  in
  let replace a b s =
    String.concat b (Str.split_delim (Str.regexp_string a) s)
  in
  if
    Option.fold ~none:false
      ~some:(fun s ->
        words (s |> replace "re-issue" "reissue" |> replace "b-sides" "bsides")
        |> List.exists (fun w -> List.mem w markers))
      album
  then score - 2
  else score
