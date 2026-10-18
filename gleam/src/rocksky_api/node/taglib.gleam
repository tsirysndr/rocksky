import rocksky_api/node/js.{type Exception}

@external(javascript, "./taglib_ffi.mjs", "writeTrackGain")
pub fn write_track_gain(
  path: String,
  gain_db: Float,
  peak: Float,
) -> Result(Nil, Exception)
