import gleam/list
import gleam/option.{Some}
import gleam/string
import rocksky_api/context.{type Context}
import rocksky_api/drizzle/orm.{
  alias, all, all_columns, and, asc, eq, eq_columns, left_join, map, nested,
  nullable, optional_selection, or, order_by, pair, select, where,
}
import rocksky_api/drizzle/schema/google_drive_directories as d
import rocksky_api/drizzle/schema/google_drive_paths as f
import rocksky_api/drizzle/schema/googledrive as p
import rocksky_api/drizzle/schema/users as u
import rocksky_api/lexicon/models
import rocksky_api/node/xrpc_server.{type Server}
import rocksky_api/schema/google_drive_directories.{type GoogleDriveDirectory}
import rocksky_api/task
import rocksky_api/views/cloud_files as view
import rocksky_api/xrpc/auth
import rocksky_api/xrpc/handler

fn directory(row: GoogleDriveDirectory) {
  view.Directory(
    row.id,
    row.name,
    row.path,
    row.parent_id,
    row.google_drive_id,
    row.file_id,
    row.xata_version,
    row.created_at,
    row.updated_at,
  )
}

pub fn register(server: Server, ctx: Context) -> Nil {
  xrpc_server.method(
    server,
    "app.rocksky.googledrive.getFiles",
    Some(auth.verifier(ctx)),
    fn(req) {
      use params <- handler.query(
        req,
        handler.options("googledrive.getFiles")
          |> handler.on_error(handler.Fallback(view.fallback())),
        models.googledrive_get_files_params_decoder(),
      )
      let directories = d.table()
      let files = f.table()
      let provider = p.table()
      let users = u.table()
      let parent = alias(directories, "parent")
      let grandparent = alias(directories, "parent_dir")
      let path = option.unwrap(params.at, "/Music")
      let path =
        case string.ends_with(path, "/") {
          True -> string.drop_end(path, 1)
          False -> path
        }
        |> string.trim
      let at = option.unwrap(params.at, "") |> string.trim
      let condition =
        and([
          eq(nullable(u.did(users)), handler.caller(req)),
          or([eq(d.path(parent), path), eq(d.file_id(parent), at)]),
        ])
      let parents =
        pair(
          nested(
            "parent",
            all_columns(parent) |> map(directory) |> optional_selection,
          ),
          nested(
            "grandparent",
            all_columns(grandparent) |> map(directory) |> optional_selection,
          ),
        )
      use data <- task.map(task.all2(
        select(
          directories,
          pair(
            nested("directory", all_columns(directories) |> map(directory)),
            parents,
          ),
        )
          |> left_join(
            provider,
            eq_columns(d.google_drive_id(directories), p.id(provider)),
          )
          |> left_join(users, eq_columns(p.user_id(provider), u.id(users)))
          |> left_join(
            parent,
            eq_columns(d.parent_id(directories), nullable(d.id(parent))),
          )
          |> left_join(
            grandparent,
            eq_columns(d.parent_id(parent), nullable(d.id(grandparent))),
          )
          |> where(condition)
          |> order_by([asc(d.name(directories))])
          |> all(ctx.db),
        select(
          files,
          pair(
            nested(
              "file",
              all_columns(files)
                |> map(fn(row) {
                  view.File(
                    row.id,
                    row.name,
                    row.file_id,
                    row.directory_id,
                    row.track_id,
                    row.created_at,
                    row.updated_at,
                  )
                }),
            ),
            parents,
          ),
        )
          |> left_join(
            provider,
            eq_columns(f.google_drive_id(files), p.id(provider)),
          )
          |> left_join(users, eq_columns(p.user_id(provider), u.id(users)))
          |> left_join(
            parent,
            eq_columns(f.directory_id(files), nullable(d.id(parent))),
          )
          |> left_join(
            grandparent,
            eq_columns(d.parent_id(parent), nullable(d.id(grandparent))),
          )
          |> where(condition)
          |> order_by([asc(f.name(files))])
          |> all(ctx.db),
      ))
      let directories_parents = view.first_parent(data.0)
      let files_parents = view.first_parent(data.1)
      view.View(
        option.or(directories_parents.0, files_parents.0),
        option.or(directories_parents.1, files_parents.1),
        list.map(data.0, fn(r) { r.0 }),
        list.map(data.1, fn(r) { r.0 }),
        True,
      )
      |> view.encode
    },
  )
}
