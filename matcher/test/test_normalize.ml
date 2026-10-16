open Matcher.Normalize

let count = ref 0

let equal name expected actual =
  if actual <> expected then
    failwith (Printf.sprintf "%s: expected %S, got %S" name expected actual);
  incr count

let () =
  let cases =
    [
      ("Beyoncé", "beyonce");
      ("Jóhann Jóhannsson", "johann johannsson");
      ("JAŸ-Z", "jay z");
      ("SÄLEN", "salen");
      ("8‐Bit", "8 bit");
      ("Cafe\204\129", "cafe");
      ("Café", "cafe");
      ("宇多田ヒカル", "宇多田ヒカル");
      ("ПРИВЕТ", "привет");
      ("ΟΣ", "ος");
      ("ΟΣΑ", "οσα");
      ("Σ", "σ");
      ("ΟΣ’", "ος'");
      ("ΟΣ’Α", "οσ'α");
      ("İ", "i");
      ("Straße", "straße");
      ("ＦＯＯ ﬁ", "foo fi");
      ("  BEAT   IT! ", "beat it");
      ("a\t\n\194\160\226\128\131b", "a b");
      ("a—b−c", "a b c");
      ("Don’t Stop", "don't stop");
      ("“Hello”", "\"hello\"");
      ("Earth, Wind & Fire", "earth wind & fire");
      ("AC/DC + X_Y", "ac/dc + x_y");
      ("a(b)[c]{d}.e,f:g;h!i?j-k", "a b c d e f g h i j k");
      ("Song (Live)", "song live");
      ("Song [Remix]", "song remix");
      ("Song - 2011 Remaster", "song 2011 remaster");
      ("Live Through This", "live through this");
      ("", "");
      (" \t!?--- ", "");
    ]
  in
  List.iter
    (fun (input, expected) -> equal input expected (normalize input))
    cases;
  equal "fold preserves version delimiters" "song (live) - 2011"
    (fold "  SÓNG (Live) — 2011  ");
  equal "fold preserves apostrophes" "don't" (fold "DON’T");
  (* These invariants should hold for all inputs, not just one spelling. *)
  List.iter
    (fun (input, _) ->
      equal "normalization idempotence" (normalize input)
        (normalize (normalize input));
      equal "fold idempotence" (fold input) (fold (fold input)))
    cases;
  List.iter
    (fun version ->
      if normalize ("Song " ^ version) = normalize "Song" then
        failwith ("lost version: " ^ version);
      incr count)
    [ "Live"; "Remix"; "Remaster"; "Radio Edit"; "Acoustic" ];
  List.iter
    (fun f ->
      List.iter
        (fun text ->
          match f text with
          | _ -> failwith "malformed UTF-8 was accepted"
          | exception Invalid_argument _ -> incr count)
        [ "a\255"; "\195"; "\192\175" ])
    [ fold; normalize ];
  Printf.printf "%d normalization cases passed\n" !count
