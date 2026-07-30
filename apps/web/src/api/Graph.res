@module("../consts") external apiUrl: string = "API_URL"

// A follow/follower entry. Was untyped `any`; fields taken from every consumer
// read across the profile pages + Handle (did/handle/displayName/avatar).
@genType
type follow = {
  did: string,
  handle: string,
  displayName: string,
  avatar: string,
}

@genType
type followsResponse = {
  follows: array<follow>,
  cursor?: string,
  count: float,
}

@genType
type followersResponse = {
  followers: array<follow>,
  cursor?: string,
  count: float,
}

let authHeaders = (): Axios.headers => Dict.fromArray([("Authorization", Axios.bearer())])

// `dids` is an array param — axios serializes it (dids[]=a&dids[]=b) and drops
// it entirely when undefined, matching the old `{ params: { ..., dids } }`.
// limit is floored to 1, exactly as before (`limit > 0 ? limit : 1`).
@genType
let getFollows = async (
  actor: string,
  limit: float,
  dids: option<array<string>>,
  cursor: option<string>,
): followsResponse => {
  let res: Axios.response<followsResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.graph.getFollows",
    {
      headers: Dict.make(),
      params: {"actor": actor, "limit": limit > 0. ? limit : 1., "dids": dids, "cursor": cursor},
    },
  )
  res.data
}

@genType
let getFollowers = async (
  actor: string,
  limit: float,
  dids: option<array<string>>,
  cursor: option<string>,
): followersResponse => {
  let res: Axios.response<followersResponse> = await Axios.getP(
    apiUrl ++ "/xrpc/app.rocksky.graph.getFollowers",
    {
      headers: Dict.make(),
      params: {"actor": actor, "limit": limit > 0. ? limit : 1., "dids": dids, "cursor": cursor},
    },
  )
  res.data
}

// follow/unfollow: POST with no body (undefined), account as a param. The axios
// response is never consumed (mutation onSuccess ignores `_data`), so unit.
@genType
let followAccount = async (account: string): unit =>
  (
    await Axios.postP(apiUrl ++ "/xrpc/app.rocksky.graph.followAccount", %raw("undefined"), {
      headers: authHeaders(),
      params: {"account": account},
    })
  )->ignore

@genType
let unfollowAccount = async (account: string): unit =>
  (
    await Axios.postP(apiUrl ++ "/xrpc/app.rocksky.graph.unfollowAccount", %raw("undefined"), {
      headers: authHeaders(),
      params: {"account": account},
    })
  )->ignore
