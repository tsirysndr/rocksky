import gleam/dynamic.{type Dynamic}
import gleam/javascript/promise.{type Promise}
import rocksky_api/node/js.{type Exception}

@external(javascript, "./files_ffi.mjs", "temporaryDirectory")
pub fn temporary_directory(prefix: String) -> Promise(Result(String, Exception))

@external(javascript, "./files_ffi.mjs", "read")
pub fn read(path: String) -> Promise(Result(BitArray, Exception))

@external(javascript, "./files_ffi.mjs", "write")
pub fn write(path: String, bytes: BitArray) -> Promise(Result(Nil, Exception))

@external(javascript, "./files_ffi.mjs", "removeTree")
pub fn remove_tree(path: String) -> Promise(Result(Nil, Exception))

@external(javascript, "./files_ffi.mjs", "fromBytes")
pub fn from_bytes(data: Dynamic) -> Result(BitArray, Exception)
