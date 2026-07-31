@genType
let feedAtom: Jotai.t<string> = Jotai.atom("all")

@genType
let feedGeneratorUriAtom: Jotai.t<string> = Jotai.atom(
  "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed.generator/all",
)

@genType
let feedUrisAtom: Jotai.t<Dict.t<string>> = Jotai.atom(
  Dict.fromArray([
    ("all", "at://did:plc:vegqomyce4ssoqs7zwqvgqty/app.rocksky.feed/all"),
  ]),
)
