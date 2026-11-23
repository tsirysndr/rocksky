# PDS write quota responses

Direct PDS record-write methods return response objects containing the optional
`PdsWriteRateLimit` definition. This is the server's record-write **point budget**,
not a count of remaining scrobbles and not the SDK's local throttle.

```typescript
interface PdsWriteRateLimit {
  limit: number;
  remaining: number;
  resetAt: number; // Unix epoch seconds
  policy: string;
}

interface WriteResult {
  uri: string;
  pdsWriteRateLimit: PdsWriteRateLimit | null;
  written: boolean;
}
```

Creates and upserts returning a URI use this result in TypeScript and Go
(`WriteResult`), and `RecordWriteResult` in Rust/Python/Kotlin. Native scrobbling
preserves its `artistUri`, `albumUri`, `songUri`, and `scrobbleUri` fields and adds
`pdsWriteRateLimit` and `written`. Rust's preset write result preserves `rkey`.
Deletion/status results include the quota without a URI. Python and Rust use
snake_case field names; Kotlin uses camelCase. Native JSON maps use camelCase.

```typescript
const result = await agent.scrobble(track);
console.log(result.uri, result.pdsWriteRateLimit?.remaining);
```

```python
result = agent.scrobble(track)
if result.pds_write_rate_limit is not None:
    print(result.scrobble_uri, result.pds_write_rate_limit.remaining)
```

```go
result, err := agent.Scrobble(ctx, track)
if err == nil && result.PdsWriteRateLimit != nil {
    fmt.Println(result.URI, result.PdsWriteRateLimit.Remaining)
}
```

```rust
let result = agent.scrobble(&track).await?;
if let Some(quota) = result.pds_write_rate_limit {
    println!("{} points remain", quota.remaining);
}
```

Ruby and Clojure return maps; Erlang, Elixir, and Gleam retain their existing
result envelope and return the enriched map inside it. Gleam provides typed
payload decoders in `rocksky/write_result`.

A scrobble may publish artist, album, song, and scrobble records. Its quota comes
from the last actual write performed by that operation, including when the final
scrobble record was deduplicated. If the entire operation is deduplicated,
`written` is false and its quota is null. No extra request is made for quota data.

A missing, malformed, or unrecognized policy produces null. Currently recognized
point policies are `5000;w=3600` and `35000;w=86400`; custom policies are deliberately
unavailable rather than assumed to be write points. General HTTP request policies
such as `3000;w=300` are excluded. The PDS normally advertises one applicable
window, so this object does not claim to expose both hourly and daily budgets.
Values are snapshots from the response and can change through other clients.

For failed writes, TypeScript's `RockskyError`, Go's `PdsWriteError`, and Rust's
`SdkError::PdsWrite` retain the quota when available. Every agent also exposes
`pdsWriteRateLimit` / `pds_write_rate_limit()` / `PdsWriteRateLimit()` (following
language conventions) to inspect the latest actual write response after an error.
Reads and dedup hits leave that agent snapshot unchanged; an actual write with
missing or unrecognized headers clears it. Prefer the per-operation result for
concurrent callers.

## Migration

Methods that previously returned a URI string now return a result: use `.uri`
(or `.URI` in Go). Methods returning only completion now return a quota-bearing
result. Native scrobble results keep their existing URI fields. Rebuild the native
library together with the regenerated Python/Kotlin bindings; old prebuilt
libraries are not compatible with the new UniFFI API.

This applies to SDK agents that write directly to the PDS. AppView-only XRPC
clients (including PureScript and the deprecated `sdk/rust` HTTP client) do not
receive the PDS response headers and cannot infer this budget.
