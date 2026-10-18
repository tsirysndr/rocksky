//// Host calendar operations matching JavaScript Date month arithmetic.

@external(javascript, "./calendar_ffi.mjs", "monthsAgoDate")
pub fn months_ago_date(months: Int) -> String
