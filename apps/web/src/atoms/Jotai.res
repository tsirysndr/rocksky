// Minimal binding to Jotai's `atom` primitive — just enough to declare stores
// in ReScript. `t<'a>` is mapped, via genType, onto Jotai's real
// `PrimitiveAtom<T>`, so `useAtom` / `useAtomValue` / `useSetAtom` on the TS
// side keep inferring the stored value type exactly as before.
//
// This is the shared foundation every migrated atom module builds on; the
// atoms themselves stay one-liners.
@genType.import(("jotai", "PrimitiveAtom"))
type t<'a>

@module("jotai")
external atom: 'a => t<'a> = "atom"
