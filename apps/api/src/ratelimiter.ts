import { ctx } from "context";
import type { Context, MiddlewareHandler } from "hono";

type RateLimitOptions = {
  limit: number; // max requests
  window: number; // window in seconds
  keyPrefix?: string;
};

export const rateLimiter = (options: RateLimitOptions): MiddlewareHandler => {
  const { limit, window, keyPrefix = "ratelimit" } = options;

  return async (c: Context, next) => {
    const ip =
      c.req.header("x-forwarded-for") ||
      c.req.raw.headers.get("x-real-ip") ||
      c.req.raw.headers.get("host");
    const key = `${keyPrefix}:${ip}`;

    const current = await ctx.redis.incr(key);

    if (current === 1) {
      await ctx.redis.expire(key, window);
    }

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
