import { Agent } from "@atproto/api";
import { NodeOAuthClient } from "@atproto/oauth-client-node";

export async function createAgent(oauthClient: NodeOAuthClient, did: string) {
  let agent = null;
  let retry = 0;
  do {
    const oauthSession = await oauthClient.restore(did);
    agent = oauthSession ? new Agent(oauthSession) : null;
    if (agent === null) {
      await new Promise((r) => setTimeout(r, 1000));
      retry += 1;
    }
  } while (agent === null && retry < 5);

  return agent;
}
