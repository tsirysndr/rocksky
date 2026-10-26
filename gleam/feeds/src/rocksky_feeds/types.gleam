import gleam/option.{type Option}

pub type Algorithm {
  All
  Genre(key: String, genre: String)
}

pub type Row {
  Row(uri: Option(String), timestamp_ms: Int)
}

pub type Sql

pub type Query {
  Query(sql: String, parameters: List(String), statement: Sql)
}

pub type Response {
  Response(status: Int, body: String, content_type: String)
}

pub type Config {
  Config(domain: String, port: Int, database_url: String, version: String)
}
