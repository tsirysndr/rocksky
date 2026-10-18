import gleam/dynamic.{type Dynamic}
import rocksky_api/db/param.{type Param}

pub type Expression {
  Logic(operator: String, left: Expression, right: Expression)
  Comparison(selector: String, operator: String, values: List(String))
}

@external(javascript, "./rsql_parser_ffi.mjs", "parse")
pub fn parse(filter: String) -> Result(Expression, String)

@external(javascript, "./rsql_parser_ffi.mjs", "number")
pub fn number(value: String) -> Result(Param, String)

@external(javascript, "./rsql_parser_ffi.mjs", "date")
pub fn date(value: String) -> Result(Dynamic, String)
