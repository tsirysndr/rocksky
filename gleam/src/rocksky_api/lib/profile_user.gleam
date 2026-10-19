//// Persist login profiles without erasing metadata absent from a partial fetch.

import gleam/list
import gleam/option.{None, Some}
import rocksky_api/db/db.{type Db}
import rocksky_api/drizzle/orm.{
  conflict_target, insert, on_conflict_update, returning_one, set,
}
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lib/bsky_profile.{type Profile}
import rocksky_api/schema/users.{type User}
import rocksky_api/task.{type Task}

pub fn save(
  db: Db,
  did: String,
  handle: String,
  profile: Profile,
) -> Task(User) {
  let users = u.table()
  insert(users, [
    set(u.did(users), did),
    set(u.handle(users), handle),
    set(u.display_name(users), Some(option.unwrap(profile.display_name, ""))),
    set(u.avatar(users), option.unwrap(profile.avatar, "")),
  ])
  |> on_conflict_update(
    [conflict_target(u.did(users))],
    list.flatten([
      [set(u.handle(users), handle)],
      case profile.display_name {
        None -> []
        Some(name) -> [set(u.display_name(users), Some(name))]
      },
      case profile.avatar {
        None -> []
        Some(avatar) -> [set(u.avatar(users), avatar)]
      },
    ]),
  )
  |> returning_one(db, "Failed to save profile")
}
