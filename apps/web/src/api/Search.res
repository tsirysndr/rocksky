// Federated search over GET /xrpc/app.rocksky.feed.search. The response shape —
// a discriminated union of hits narrowed by type guards (isUserHit, …) — stays
// hand-written in types/search.ts where the consumers narrow it, so we import
// that TS type here rather than re-model the union in ReScript.
@module("../consts") external apiUrl: string = "API_URL"

@genType.import(("../types/search", "SearchResponse"))
type searchResponse

// Params carry `query` and a fixed `size=100`; axios url-encodes the query value
// (matching the old `encodeURIComponent(query)`), so behaviour is identical.
@genType
let search = async (query: string): searchResponse => {
  let res: Axios.response<searchResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.feed.search",
    {headers: Dict.make(), params: {"query": query, "size": 100}},
  )
  res.data
}
