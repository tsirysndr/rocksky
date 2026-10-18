import gleam/option.{None, Some}
import rocksky_api/drizzle/orm.{
  all_columns, eq_columns, left_join, map, nested, pair, select,
}
import rocksky_api/drizzle/schema/feeds as f
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/views/profile

pub fn query() {
  let feeds = f.table()
  let users = u.table()
  select(
    feeds,
    pair(
      nested("feed", all_columns(feeds)),
      nested("creator", profile.selection(users)),
    )
      |> map(fn(r) {
        models.FeedGeneratorView(
          id: Some(r.0.id),
          name: Some(r.0.display_name),
          description: r.0.description,
          uri: Some(r.0.uri),
          avatar: r.0.avatar,
          did: Some(r.0.did),
          creator: Some(
            models.ActorProfileViewBasic(
              ..r.1,
              created_at: None,
              updated_at: None,
            ),
          ),
        )
      }),
  )
  |> left_join(users, eq_columns(f.user_id(feeds), u.id(users)))
}
