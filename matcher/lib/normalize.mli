val fold : string -> string
(** Unicode NFKD decomposition, removal of combining marks, typographic
    punctuation folding, whitespace collapsing and Unicode lowercasing. Keeps
    delimiters needed to inspect version suffixes later.
    @raise Invalid_argument if the input is malformed UTF-8. *)

val normalize : string -> string
(** Apply [fold], then replace the Rust policy's punctuation delimiters with
    spaces and collapse whitespace. Version words are never removed. This is a
    comparison key, not a display title or a matching decision.
    @raise Invalid_argument if the input is malformed UTF-8. *)
