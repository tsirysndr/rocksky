package app.rocksky.resource

/**
 * Marker for the SDK's builder/DSL receivers — prevents accidental implicit access to an
 * outer builder from a nested one.
 */
@DslMarker
public annotation class RockskyDsl
