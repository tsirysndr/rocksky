@module("../consts") external apiUrl: string = "API_URL"

// Auth header captured at module load, matching beta.ts's module-level `headers`.
let headers: Axios.config = {headers: Dict.fromArray([("authorization", Axios.bearer())])}

// Fires the platform's beta-join endpoint. The axios response was never consumed
// (the only caller is a react-query mutation whose data is ignored), so this
// returns unit; an unknown platform is a no-op, exactly like the old `default`.
@genType
let joinBeta = async (email: string, platform: string): unit => {
  let body = {"email": email}
  switch platform {
  | "spotify" => (await Axios.post(apiUrl ++ "/spotify/join", body, headers))->ignore
  | "google" => (await Axios.post(apiUrl ++ "/googledrive/join", body, headers))->ignore
  | "dropbox" => (await Axios.post(apiUrl ++ "/dropbox/join", body, headers))->ignore
  | _ => ()
  }
}
