let space = Uchar.of_int 0x20

let flatten u =
  match Uchar.to_int u with
  | 0x2010 | 0x2011 | 0x2012 | 0x2013 | 0x2014 | 0x2015 | 0x2212 ->
      Uchar.of_int 0x2d
  | 0x2018 | 0x2019 | 0x02bc -> Uchar.of_int 0x27
  | 0x201c | 0x201d -> Uchar.of_int 0x22
  | _ -> if Uucp.White.is_white_space u then space else u

let decompose text =
  let normalizer = Uunf.create `NFKD in
  let chars = ref [] in
  let rec add input =
    match Uunf.add normalizer input with
    | `Await | `End -> ()
    | `Uchar u ->
        (match Uucp.Gc.general_category u with
        | `Mn | `Mc | `Me -> ()
        | _ -> chars := flatten u :: !chars);
        add `Await
  in
  Uutf.String.fold_utf_8
    (fun () _ -> function
      | `Malformed _ -> invalid_arg "Normalize: malformed UTF-8"
      | `Uchar u -> add (`Uchar u))
    () text;
  add `End;
  List.rev !chars

let collapse chars =
  let buffer = Buffer.create 64 in
  let pending_space = ref false in
  List.iter
    (fun u ->
      if Uucp.White.is_white_space u then
        pending_space := Buffer.length buffer > 0
      else (
        if !pending_space then Buffer.add_char buffer ' ';
        pending_space := false;
        Uutf.Buffer.add_utf_8 buffer u))
    chars;
  Buffer.contents buffer

let lowercase chars =
  (* Rust string lowercasing includes the context-sensitive final sigma rule.
     Ignore case-ignorable characters when examining either side of sigma. *)
  let rec next_is_cased = function
    | u :: rest when Uucp.Case.is_case_ignorable u -> next_is_cased rest
    | u :: _ -> Uucp.Case.is_cased u
    | [] -> false
  in
  let rec loop previous_is_cased acc = function
    | [] -> List.rev acc
    | u :: rest ->
        let mapped =
          if
            Uchar.to_int u = 0x03a3
            && previous_is_cased
            && not (next_is_cased rest)
          then [ Uchar.of_int 0x03c2 ]
          else
            match Uucp.Case.Map.to_lower u with
            | `Self -> [ u ]
            | `Uchars us -> us
        in
        let previous_is_cased =
          if Uucp.Case.is_case_ignorable u then previous_is_cased
          else Uucp.Case.is_cased u
        in
        loop previous_is_cased (List.rev_append mapped acc) rest
  in
  loop false [] chars

let fold text = decompose text |> lowercase |> collapse

let normalize text =
  let folded = fold text in
  Uutf.String.fold_utf_8
    (fun acc _ -> function
      | `Malformed _ -> assert false (* [fold] only produces valid UTF-8. *)
      | `Uchar u ->
          let u =
            match Uchar.to_int u with
            | 0x28 | 0x29 | 0x5b | 0x5d | 0x7b | 0x7d | 0x2e | 0x2c | 0x3a
            | 0x3b | 0x21 | 0x3f | 0x2d ->
                space
            | _ -> u
          in
          u :: acc)
    [] folded
  |> List.rev |> collapse
