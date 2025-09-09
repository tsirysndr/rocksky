import { Agent } from "@atproto/api";
import type { NodeOAuthClient } from "@atproto/oauth-client-node";

export async function createAgent(
  oauthClient: NodeOAuthClient,
  did: string,
): Promise<Agent | null> {
  let agent = null;
  let retry = 0;
  do {
    try {
      const oauthSession = await oauthClient.restore(did);
      agent = oauthSession ? new Agent(oauthSession) : null;
      if (agent === null) {
        await new Promise((r) => setTimeout(r, 1000));
        retry += 1;
      }
    } catch (e) {
      console.log("Error creating agent");
      console.log(did);
      console.log(e);
      await new Promise((r) => setTimeout(r, 1000));
      retry += 1;
    }
  } while (agent === null && retry < 5);

  return agent;
}
