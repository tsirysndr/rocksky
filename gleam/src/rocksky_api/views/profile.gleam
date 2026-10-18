import gleam/dynamic/decode
import gleam/json
import gleam/option.{Some}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{field, map, nullable, pair}
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/schema/dropbox_accounts
import rocksky_api/schema/google_drive_accounts
import rocksky_api/schema/spotify_accounts
import rocksky_api/schema/users

pub fn decoder() -> decode.Decoder(models.ActorProfileViewBasic) {
  use id <- decode.field("xata_id", decode.string)
  use did <- decode.field("did", decode.string)
  use handle <- decode.field("handle", decode.string)
  use name <- decode.field("display_name", decode.optional(decode.string))
  use avatar <- decode.field("avatar", decode.string)
  use created <- decode.field("xata_createdat", row.timestamp())
  use updated <- decode.field("xata_updatedat", row.timestamp())
  decode.success(models.ActorProfileViewBasic(
    Some(id),
    Some(did),
    Some(handle),
    name,
    Some(avatar),
    Some(row.iso8601(created)),
    Some(row.iso8601(updated)),
  ))
}

pub fn selection(table) {
  pair(
    pair(
      pair(field("id", u.id(table)), field("did", u.did(table))),
      pair(
        field("handle", u.handle(table)),
        field("name", nullable(u.display_name(table))),
      ),
    ),
    pair(
      field("avatar", u.avatar(table)),
      pair(
        field("created", u.created_at(table)),
        field("updated", u.updated_at(table)),
      ),
    ),
  )
  |> map(fn(v) {
    models.ActorProfileViewBasic(
      Some(v.0.0.0),
      Some(v.0.0.1),
      Some(v.0.1.0),
      v.0.1.1,
      Some(v.1.0),
      Some(row.iso8601(v.1.1.0)),
      Some(row.iso8601(v.1.1.1)),
    )
  })
}

pub type Detailed {
  Detailed(
    user: users.User,
    spotify: option.Option(spotify_accounts.SpotifyAccount),
    connected: Bool,
    google: option.Option(google_drive_accounts.GoogleDriveAccount),
    dropbox: option.Option(dropbox_accounts.DropboxAccount),
  )
}

/// Includes the account fields returned by the API's open response objects.
pub fn encode_detailed(view: Detailed) {
  let user = view.user
  let spotify = case view.spotify {
    option.None -> models.new_actor_response_spotify_user_view()
    Some(s) ->
      models.ActorResponseSpotifyUserView(
        created_at: Some(row.iso8601(s.created_at)),
        updated_at: Some(row.iso8601(s.updated_at)),
        id: Some(s.id),
        xata_version: s.xata_version,
        user_id: Some(s.user_id),
        is_beta_user: Some(s.is_beta_user),
        spotify_app_id: s.spotify_app_id,
      )
  }
  json.object([
    #("id", json.string(user.id)),
    #("did", json.string(user.did)),
    #("handle", json.string(user.handle)),
    #("displayName", json.string(user.display_name)),
    #("createdAt", json.string(row.iso8601(user.created_at))),
    #("updatedAt", json.string(row.iso8601(user.updated_at))),
    #("spotifyUser", models.encode_actor_response_spotify_user_view(spotify)),
    #("spotifyConnected", json.bool(view.connected)),
    #("googledrive", case view.google {
      option.None -> json.object([])
      Some(v) -> google_drive_accounts.to_json(v)
    }),
    #("dropbox", case view.dropbox {
      option.None -> json.object([])
      Some(v) -> dropbox_accounts.to_json(v)
    }),
    ..case user.avatar {
      "" -> []
      avatar -> [#("avatar", json.string(avatar))]
    }
  ])
}
