import rocksky_api/node/abort.{type Signal}

pub fn enrichment_signal(parent: Signal, timeout_ms: Int) -> Signal {
  abort.any([parent, abort.timeout(timeout_ms)])
}
