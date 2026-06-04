import { eq } from "drizzle-orm";
import drizzle from "drizzle";
import jwt, { type JwtPayload } from "jsonwebtoken";
import accessTokens from "schema/access-tokens";
import { env } from "./env";

export type VerifiedPayload = JwtPayload & {
  did?: string;
  jti?: string;
  type?: string;
};

export const ACCESS_TOKEN_TYPE = "access_token";

/**
 * Verifies a Bearer token against env.JWT_SECRET. If the token carries the
 * `type === "access_token"` claim, additionally checks that its `jti` still
 * exists in the access_tokens table — a deleted row means revoked.
 *
 * Throws on any verification failure — same contract as jwt.verify.
 */
export async function verifyToken(bearer: string): Promise<VerifiedPayload> {
  const payload = jwt.verify(bearer, env.JWT_SECRET, {
    ignoreExpiration: true,
  }) as VerifiedPayload;

  if (payload && payload.type === ACCESS_TOKEN_TYPE && payload.jti) {
    const row = await drizzle.db
      .select({ id: accessTokens.id })
      .from(accessTokens)
      .where(eq(accessTokens.jti, payload.jti))
      .limit(1)
      .then((rows) => rows[0]);

    if (!row) {
      throw new Error("Access token revoked");
    }
  }

  return payload;
}
