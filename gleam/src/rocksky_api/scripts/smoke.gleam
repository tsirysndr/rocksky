import rocksky_api/atproto/agent
import rocksky_api/atproto/identity
import rocksky_api/atproto/oauth
import rocksky_api/auth/store
import rocksky_api/db/db
import rocksky_api/kv
import rocksky_api/log
import rocksky_api/node/axios
import rocksky_api/node/cron
import rocksky_api/node/crypto
import rocksky_api/node/express
import rocksky_api/node/hono
import rocksky_api/node/jwt
import rocksky_api/node/nats
import rocksky_api/node/otel
import rocksky_api/node/redis
import rocksky_api/node/typesense
import rocksky_api/node/xrpc_server

pub fn main() {
  let _ = agent.rkey_of("at://did/coll/rkey")
  let _ = identity.is_valid_handle("alice.bsky.social")
  let _ = oauth.install_pds_proxy_fetch([])
  let _ = store.open(":memory:")
  let _ = kv.open(":memory:")
  let _ = axios.global()
  let _ = cron.schedule
  let _ = crypto.sha256_hex("x")
  let _ = express.new()
  let _ = hono.new()
  let _ = jwt.decode("x")
  let _ = nats.connect
  let _ = otel.counter
  let _ = redis.connect
  let _ = typesense.client
  let _ = xrpc_server.create
  let _ = db.placeholders(3, 2)
  log.success("smoke ok: " <> crypto.sha256_hex("rocksky"))
}
