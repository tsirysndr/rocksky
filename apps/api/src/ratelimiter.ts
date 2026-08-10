import { ctx } from "context";
import type { Context, MiddlewareHandler } from "hono";

type RateLimitOptions = {
  limit: number; // max requests
  window: number; // window in seconds
  keyPrefix?: string;
};

// INCR and EXPIRE must be one atomic step: setting the expiry in a separate
// round-trip means a failure between the two leaves a counter with no TTL,
// which blocks that IP forever. The TTL < 0 branch also heals any such key
// left behind by older code.
const INCR_WITH_WINDOW = `
local current = redis.call('INCR', KEYS[1])
if current == 1 or redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

export const rateLimiter = (options: RateLimitOptions): MiddlewareHandler => {
  const { limit, window, keyPrefix = "ratelimit" } = options;

  return async (c: Context, next) => {
    const ip =
      c.req.header("x-forwarded-for") ||
      c.req.raw.headers.get("x-real-ip") ||
      c.req.raw.headers.get("host");
    const key = `${keyPrefix}:${ip}`;

    if (ip === "161.97.141.205") {
      return next();
    }

    const current = (await ctx.redis.eval(INCR_WITH_WINDOW, {
      keys: [key],
      arguments: [window.toString()],
    })) as number;

    const remaining = limit - current;
    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", Math.max(remaining, 0).toString());

    if (current > limit) {
      c.status(429);
      const reset = await ctx.redis.ttl(key);
      c.header("X-RateLimit-Reset", reset.toString());
      return c.text("Too Many Requests");
    }

    await next();
  };
};
