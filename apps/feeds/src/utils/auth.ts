import { MethodAuthContext, verifyJwt } from "@atp/xrpc-server";
import { DidResolver } from "@atp/identity";

export type NullOutput = {
  credentials: {
    type: "none";
    iss: null;
  };
  artifacts: unknown;
};

export type StandardOutput = {
  credentials: {
    type: "standard";
    iss: string;
  };
  artifacts: unknown;
};

export class AuthVerifier {
  ownDid: string;
  didResolver: DidResolver;
  constructor(ownDid: string, didResolver: DidResolver) {
    this.ownDid = ownDid ?? "";
    this.didResolver = didResolver;
  }

  standardOptional = async (
    ctx: MethodAuthContext,
  ): Promise<StandardOutput | NullOutput> => {
    try {
      const authorization = ctx.req.headers.get("Authorization") ?? "";

      if (!authorization) {
        return this.nullCreds();
      }

      // Check for Bearer token
      const BEARER = "Bearer ";
      if (authorization.startsWith(BEARER)) {
        const jwt = authorization.replace(BEARER, "").trim();

        try {
          const parsed = await verifyJwt(
            jwt,
            null,
            null,
            async (did: string) => {
              return await this.didResolver.resolveAtprotoKey(did);
            },
          );
          return {
            credentials: {
              type: "standard",
              iss: parsed.iss,
            },
            artifacts: null,
          };
        } catch (error) {
          // Log JWT verification errors for debugging
          console.error("JWT verification failed:", error);
          console.error(
            "JWT preview:",
            jwt.length > 20 ? jwt.substring(0, 20) + "..." : jwt,
          );
          console.error("ownDid:", this.ownDid);
          // If JWT verification fails, treat as unauthenticated
          return this.nullCreds();
        }
      } else {
        return this.nullCreds();
      }
    } catch (error) {
      console.error("Unexpected error in standardOptional:", error);
      return this.nullCreds();
    }
  };
  nullCreds = (): NullOutput => {
    return {
      credentials: {
        type: "none",
        iss: null,
      },
      artifacts: null,
    };
  };
}
