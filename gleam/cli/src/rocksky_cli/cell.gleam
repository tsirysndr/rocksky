/// Mutable references for asynchronous host callbacks.
pub type Cell(a)

@external(javascript, "./cell_ffi.mjs", "create")
pub fn new(value: a) -> Cell(a)

@external(javascript, "./cell_ffi.mjs", "get")
pub fn get(cell: Cell(a)) -> a

@external(javascript, "./cell_ffi.mjs", "set")
pub fn set(cell: Cell(a), value: a) -> Nil
