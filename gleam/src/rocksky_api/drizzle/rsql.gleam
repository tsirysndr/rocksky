import gleam/dict
import gleam/dynamic/decode
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import gleam/time/timestamp.{type Timestamp}
import rocksky_api/db/row
import rocksky_api/drizzle/orm.{
  type Condition, type Expression, and, array_contains, array_overlaps, eq, gt,
  gte, ilike_optional, in_array, is_not_null, is_null, lt, lte, ne, not,
  not_in_array, or,
}
import rocksky_api/node/rsql_parser as parser

pub type Field {
  Text(Expression(Option(String)))
  Number(Expression(Option(Float)))
  Date(Expression(Option(Timestamp)))
  TextArray(Expression(Option(List(String))))
}

pub type Fields =
  dict.Dict(String, Field)

pub fn compile(
  filter: Option(String),
  fields: Fields,
) -> Result(Option(Condition), String) {
  case filter {
    None -> Ok(None)
    Some(filter) ->
      case string.trim(filter) {
        "" -> Ok(None)
        filter -> {
          use ast <- result.try(parser.parse(filter))
          node(ast, fields) |> result.map(Some)
        }
      }
  }
}

fn node(ast, fields) {
  case ast {
    parser.Logic(op, left, right) -> {
      use left <- result.try(node(left, fields))
      use right <- result.try(node(right, fields))
      Ok(case op {
        ";" | "and" -> and([left, right])
        _ -> or([left, right])
      })
    }
    parser.Comparison(selector, op, values) -> {
      use field <- result.try(
        dict.get(fields, selector)
        |> result.replace_error(
          "Unknown filter field \""
          <> selector
          <> "\". Allowed fields: "
          <> {
            dict.keys(fields) |> list.sort(string.compare) |> string.join(", ")
          },
        ),
      )
      case field {
        Text(column) ->
          case op, values {
            "==", [value] | "!=", [value] if value != "null" ->
              case string.contains(value, "*") {
                True -> {
                  let pattern =
                    value
                    |> string.replace("\\", "\\\\")
                    |> string.replace("%", "\\%")
                    |> string.replace("_", "\\_")
                    |> string.replace("*", "%")
                  Ok(negate(ilike_optional(column, pattern), op == "!="))
                }
                False -> scalar(column, op, values, Ok)
              }
            _, _ -> scalar(column, op, values, Ok)
          }
        Number(column) ->
          scalar(column, op, values, fn(value) {
            use number <- result.try(parser.number(value))
            decode.run(number, row.float())
            |> result.replace_error("Invalid number: " <> value)
          })
        Date(column) ->
          scalar(column, op, values, fn(value) {
            use date <- result.try(parser.date(value))
            decode.run(date, row.timestamp())
            |> result.replace_error("Invalid date: " <> value)
          })
        TextArray(column) ->
          case op, values {
            "==", ["null"] -> Ok(is_null(column))
            "!=", ["null"] -> Ok(is_not_null(column))
            "==", [value] | "!=", [value] ->
              Ok(negate(array_contains(column, [value]), op == "!="))
            "=in=", values | "=out=", values ->
              Ok(negate(array_overlaps(column, values), op == "=out="))
            _, _ -> Error("Array fields only support ==, !=, =in= and =out=")
          }
      }
    }
  }
}

fn scalar(column, op, values, parse) {
  case op, values {
    "==", ["null"] -> Ok(is_null(column))
    "!=", ["null"] -> Ok(is_not_null(column))
    "=in=", values | "=out=", values -> {
      use values <- result.try(list.try_map(values, parse))
      Ok(case op {
        "=in=" -> in_array(column, list.map(values, Some))
        _ -> not_in_array(column, list.map(values, Some))
      })
    }
    _, [value] -> {
      use value <- result.try(parse(value))
      let value = Some(value)
      case op {
        "==" -> Ok(eq(column, value))
        "!=" -> Ok(ne(column, value))
        ">" | "=gt=" -> Ok(gt(column, value))
        ">=" | "=ge=" -> Ok(gte(column, value))
        "<" | "=lt=" -> Ok(lt(column, value))
        "<=" | "=le=" -> Ok(lte(column, value))
        _ -> Error("Unsupported filter operator: " <> op)
      }
    }
    _, _ -> Error("Unsupported filter operator: " <> op)
  }
}

fn negate(condition, negated) {
  case negated {
    True -> not(condition)
    False -> condition
  }
}

pub fn selectors(filter: Option(String)) -> List(String) {
  case filter {
    None -> []
    Some(filter) ->
      case parser.parse(filter) {
        Error(_) -> []
        Ok(ast) -> list.unique(collect(ast))
      }
  }
}

fn collect(ast) {
  case ast {
    parser.Logic(_, left, right) -> list.append(collect(left), collect(right))
    parser.Comparison(selector, _, _) -> [selector]
  }
}
