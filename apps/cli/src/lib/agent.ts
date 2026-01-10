import { Agent, AtpAgent } from "@atproto/api";
import { ctx } from "context";
import { eq } from "drizzle-orm";
import authSessions from "schema/auth-session";
import extractPdsFromDid from "./extractPdsFromDid";
import { env } from "./env";

export async function createAgent(did: string, handle: string): Promise<Agent> {
  const pds = await extractPdsFromDid(did);
  const agent = new AtpAgent({
    service: new URL(pds),
  });

  try {
    const [data] = await ctx.db
      .select()
      .from(authSessions)
      .where(eq(authSessions.key, did))
      .execute();

    if (!data) {
      throw new Error("No session found");
    }

    await agent.resumeSession(JSON.parse(data.session));
    return agent;
  } catch (e) {
    ctx.logger.error`Resuming session ${did}`;
    await ctx.db
      .delete(authSessions)
      .where(eq(authSessions.key, did))
      .execute();

    await agent.login({
      identifier: handle,
      password: env.ROCKSKY_PASSWORD,
    });

    await ctx.db
      .insert(authSessions)
      .values({
        key: did,
        session: JSON.stringify(agent.session),
      })
      .onConflictDoUpdate({
        target: authSessions.key,
        set: { session: JSON.stringify(agent.session) },
      })
      .execute();

    ctx.logger.info`Logged in as ${handle}`;

    return agent;
  }
}
